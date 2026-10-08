import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CONFIG } from '../config.js';

let supabaseClient = null;

export function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env');
  }
  if (!supabaseClient) {
    supabaseClient = createClient(url, key);
  }
  return supabaseClient;
}

export class SupabaseSyncService {
  static getBucketName() {
    return process.env.SUPABASE_BUCKET || 'pinterest-queue';
  }

  /**
   * Upload image buffer to Supabase Storage and return public URL
   */
  static async uploadImage(imagePath, filename) {
    const supabase = getSupabaseClient();
    const bucket = this.getBucketName();
    const buffer = await fs.readFile(imagePath);
    const ext = path.extname(filename).toLowerCase();

    let contentType = 'image/jpeg';
    if (ext === '.png') contentType = 'image/png';
    else if (ext === '.webp') contentType = 'image/webp';

    const storagePath = `${Date.now()}_${filename}`;

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(storagePath, buffer, {
        contentType,
        upsert: true
      });

    if (error) {
      throw new Error(`Supabase Storage upload failed: ${error.message}`);
    }

    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(storagePath);

    return {
      storagePath,
      publicUrl: urlData.publicUrl
    };
  }

  /**
   * Insert prepared Pin package into Supabase pin_queue table
   */
  static async enqueuePin({
    filename,
    storagePath,
    imageUrl,
    title,
    description,
    altText = '',
    tags = '',
    boardId,
    boardName
  }) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('pin_queue')
      .insert([
        {
          storage_path: storagePath,
          image_url: imageUrl,
          title: title.slice(0, 100),
          description: description.slice(0, 500),
          alt_text: altText ? altText.slice(0, 500) : '',
          tags: Array.isArray(tags) ? tags.join(', ') : tags,
          board_id: boardId,
          board_name: boardName,
          status: 'PENDING',
          tries: 0
        }
      ])
      .select();

    if (error) {
      throw new Error(`Failed to insert into pin_queue: ${error.message}`);
    }

    return data[0];
  }

  /**
   * Fetch current queue status from Supabase
   */
  static async getQueueStatus() {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('pin_queue')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) return { count: 0, items: [], error: error.message };
      return { count: data.length, items: data };
    } catch (err) {
      return { count: 0, items: [], error: err.message };
    }
  }

  /**
   * Delete image from Supabase Storage and remove row from table
   */
  static async removeCompletedPin(id, storagePath) {
    const supabase = getSupabaseClient();
    const bucket = this.getBucketName();

    if (storagePath) {
      try {
        await supabase.storage.from(bucket).remove([storagePath]);
      } catch (e) {}
    }

    if (id) {
      try {
        await supabase.from('pin_queue').delete().eq('id', id);
      } catch (e) {}
    }
  }
}
