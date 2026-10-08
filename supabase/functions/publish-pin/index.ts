// Supabase Edge Function: publish-pin
// Triggered by pg_cron at 12:00, 14:00, 16:00, 18:00, 20:00 UTC (5:30 PM, 7:30 PM, 9:30 PM, 11:30 PM, 1:30 AM IST)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PINTEREST_ACCESS_TOKEN = Deno.env.get("PINTEREST_ACCESS_TOKEN") || "";
const GOOGLE_SHEET_WEBHOOK_URL = Deno.env.get("GOOGLE_SHEET_WEBHOOK_URL") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SUPABASE_BUCKET = Deno.env.get("SUPABASE_BUCKET") || "pinterest-queue";

serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Fetch next PENDING pin in FIFO order
    const { data: queueItems, error: fetchErr } = await supabase
      .from("pin_queue")
      .select("*")
      .eq("status", "PENDING")
      .order("created_at", { ascending: true })
      .limit(1);

    if (fetchErr) {
      throw new Error(`Failed to fetch pin_queue: ${fetchErr.message}`);
    }

    if (!queueItems || queueItems.length === 0) {
      return new Response(JSON.stringify({ message: "No pending pins in queue" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    const pinItem = queueItems[0];
    console.log(`Processing pin: ${pinItem.title} (${pinItem.id})`);

    // 2. Publish to Pinterest API v5
    const pinterestPayload = {
      board_id: pinItem.board_id,
      title: pinItem.title.slice(0, 100),
      description: pinItem.description.slice(0, 500),
      alt_text: pinItem.alt_text ? pinItem.alt_text.slice(0, 500) : "",
      media_source: {
        source_type: "image_url",
        url: pinItem.image_url,
      },
    };

    const pinRes = await fetch("https://api.pinterest.com/v5/pins", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${PINTEREST_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pinterestPayload),
    });

    const pinData = await pinRes.json();
    if (!pinRes.ok) {
      // Increment tries on failure
      await supabase
        .from("pin_queue")
        .update({
          tries: (pinItem.tries || 0) + 1,
          error: pinData.message || `HTTP ${pinRes.status}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pinItem.id);

      throw new Error(`Pinterest API failed: ${pinData.message || JSON.stringify(pinData)}`);
    }

    const pinId = pinData.id;
    const pinUrl = `https://www.pinterest.com/pin/${pinId}/`;
    console.log(`✓ Pinterest Pin created: ${pinUrl}`);

    // 3. Log to Google Spreadsheet (Finmunt)
    if (GOOGLE_SHEET_WEBHOOK_URL) {
      const now = new Date();
      const dateStr = now.toISOString().split("T")[0];
      const timeStr = now.toTimeString().split(" ")[0];
      const filename = pinItem.storage_path.split("_").slice(1).join("_") || "image.png";

      const sheetRow = [
        dateStr,
        filename,
        timeStr,
        (pinItem.tries || 0) + 1,
        pinItem.title,
        pinItem.description,
        pinItem.alt_text || "",
        pinItem.board_name,
        pinItem.board_id,
        "SUCCESS",
      ];

      await fetch(GOOGLE_SHEET_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetName: "Finmunt",
          row: sheetRow,
        }),
      }).catch((err) => console.error("Google Sheet webhook error:", err.message));
    }

    // 4. Delete image from Supabase Storage & clean table
    if (pinItem.storage_path) {
      await supabase.storage.from(SUPABASE_BUCKET).remove([pinItem.storage_path]);
    }

    await supabase.from("pin_queue").delete().eq("id", pinItem.id);

    return new Response(
      JSON.stringify({
        success: true,
        pinId,
        pinUrl,
        title: pinItem.title,
        board: pinItem.board_name,
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (err) {
    console.error("Publishing error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
