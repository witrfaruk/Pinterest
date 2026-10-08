// Supabase Edge Function: publish-pin
// Triggered by pg_cron at 12:00, 14:00, 16:00, 18:00, 20:00 UTC (5:30 PM, 7:30 PM, 9:30 PM, 11:30 PM, 1:30 AM IST)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.13";

const PINTEREST_ACCESS_TOKEN = Deno.env.get("PINTEREST_ACCESS_TOKEN") || "";
const GOOGLE_SHEET_WEBHOOK_URL = Deno.env.get("GOOGLE_SHEET_WEBHOOK_URL") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SUPABASE_BUCKET = Deno.env.get("SUPABASE_BUCKET") || "pinterest-queue";

const SMTP_USER = Deno.env.get("SMTP_USER") || "farukhetro@gmail.com";
const SMTP_PASS = Deno.env.get("SMTP_PASS") || "rvsrlaksnuyrzgvy";
const ALERT_RECIPIENTS = Deno.env.get("ALERT_RECIPIENTS") || "mdarif59gdis@gmail.com,arif.pvt.9@gmail.com,farukflare@gmail.com";
const ALERT_THRESHOLD = 5;

/**
 * Send automated email alert when queue count drops to 5 or fewer pins
 */
async function sendLowQueueAlert(remainingCount: number) {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });

    const mailOptions = {
      from: `"Finmunt Pinterest Alert" <${SMTP_USER}>`,
      to: ALERT_RECIPIENTS,
      subject: `⚠️ Finmunt Pinterest Alert: Only ${remainingCount} Pin${remainingCount === 1 ? '' : 's'} Left in Queue!`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
          <div style="display: flex; align-items: center; margin-bottom: 20px;">
            <div style="background: #e60023; color: #ffffff; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: bold; margin-right: 12px; text-align: center; line-height: 40px;">P</div>
            <div>
              <h2 style="margin: 0; color: #1e293b; font-size: 20px;">Finmunt Pinterest Queue Alert</h2>
              <p style="margin: 2px 0 0 0; color: #64748b; font-size: 13px;">Cloud Automation Engine</p>
            </div>
          </div>
          
          <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; border-radius: 6px; margin-bottom: 20px;">
            <h3 style="margin: 0 0 8px 0; color: #991b1b; font-size: 16px;">Low Queue Warning: ${remainingCount} Pins Remaining</h3>
            <p style="margin: 0; color: #7f1d1d; font-size: 14px; line-height: 1.5;">
              The Finmunt 24/7 cloud publishing queue is running low. There are only <strong>${remainingCount}</strong> scheduled pins left to publish.
            </p>
          </div>

          <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
            <h4 style="margin: 0 0 10px 0; color: #334155; font-size: 14px;">Next Action Required:</h4>
            <ul style="margin: 0; padding-left: 20px; color: #475569; font-size: 14px; line-height: 1.6;">
              <li>Drop new pin images into the <code>Images/</code> folder on your PC.</li>
              <li>The local Ollama AI will automatically process, classify, and queue them to Supabase.</li>
              <li>Publishing will continue uninterrupted across all 5 daily slots (17:30, 19:30, 21:30, 23:30, 01:30 IST).</li>
            </ul>
          </div>

          <div style="border-top: 1px solid #e2e8f0; padding-top: 14px; color: #94a3b8; font-size: 12px; text-align: center;">
            Sent automatically by Finmunt Supabase Cloud Engine to: ${ALERT_RECIPIENTS}
          </div>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✓ Low queue alert email sent to ${ALERT_RECIPIENTS} (Msg ID: ${info.messageId})`);
  } catch (err: any) {
    console.error("Failed to send low queue email alert:", err.message);
  }
}

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
      // Send alert if queue is completely empty
      await sendLowQueueAlert(0);
      return new Response(JSON.stringify({ message: "No pending pins in queue (Alert sent)" }), {
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

    // 5. Check remaining queue count & send alert if <= 5
    const { count: remainingCount } = await supabase
      .from("pin_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", "PENDING");

    if (remainingCount !== null && remainingCount <= ALERT_THRESHOLD) {
      console.log(`[Alert] Remaining pins (${remainingCount}) <= ${ALERT_THRESHOLD}. Sending email alert...`);
      await sendLowQueueAlert(remainingCount);
    }

    return new Response(
      JSON.stringify({
        success: true,
        pinId,
        pinUrl,
        title: pinItem.title,
        board: pinItem.board_name,
        remainingPins: remainingCount,
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (err: any) {
    console.error("Publishing error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
