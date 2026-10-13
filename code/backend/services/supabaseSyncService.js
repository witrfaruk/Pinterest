import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { CONFIG } from '../config.js';

let supabaseClient = null;

// High-speed In-Memory Cache (5s TTL)
let cachedQueue = null;
let cachedQueueTime = 0;
let cachedHistory = null;
let cachedHistoryTime = 0;
const CACHE_TTL_MS = 5000;

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

  static invalidateCache() {
    cachedQueue = null;
    cachedHistory = null;
    cachedQueueTime = 0;
    cachedHistoryTime = 0;
  }

  static sanitizeStorageKey(name) {
    return name
      .normalize('NFKD')
      .replace(/[^\x00-\x7F]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_');
  }

  /**
   * Completely strip all EXIF, XMP, IPTC, and AI generation signatures/prompts from the image.
   * Sharp removes all metadata by default when converting to buffer without .withMetadata().
   */
  static async stripMetadata(buffer, ext = '.jpg') {
    try {
      const pipeline = sharp(buffer).rotate(); // auto-align orientation, drop all EXIF

      if (ext === '.png') {
        return await pipeline.png({ quality: 95, compressionLevel: 8 }).toBuffer();
      } else if (ext === '.webp') {
        return await pipeline.webp({ quality: 92 }).toBuffer();
      } else {
        return await pipeline.jpeg({ quality: 95, mozjpeg: true }).toBuffer();
      }
    } catch (err) {
      console.warn('[MetadataRemover] Warning: Passing original buffer due to error:', err.message);
      return buffer;
    }
  }

  /**
   * Upload image buffer to Supabase Storage (stripped of all AI metadata) and return public URL
   */
  static async uploadImage(imagePath, filename) {
    const supabase = getSupabaseClient();
    const bucket = this.getBucketName();
    const rawBuffer = await fs.readFile(imagePath);
    const ext = path.extname(filename).toLowerCase();

    // Strip all AI generator & camera metadata
    const cleanBuffer = await this.stripMetadata(rawBuffer, ext);

    let contentType = 'image/jpeg';
    if (ext === '.png') contentType = 'image/png';
    else if (ext === '.webp') contentType = 'image/webp';

    const safeBase = this.sanitizeStorageKey(path.basename(filename, ext)) || 'image';
    const storagePath = `${Date.now()}_${safeBase}${ext}`;

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(storagePath, cleanBuffer, {
        contentType,
        upsert: true
      });

    if (error) {
      throw new Error(`Supabase Storage upload failed: ${error.message}`);
    }

    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(storagePath);

    this.invalidateCache();

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

    this.invalidateCache();
    return data[0];
  }

  /**
   * Fetch current queue status from Supabase (PENDING only, cached 5s)
   */
  static async getQueueStatus(forceFresh = false) {
    const now = Date.now();
    if (!forceFresh && cachedQueue && (now - cachedQueueTime < CACHE_TTL_MS)) {
      return cachedQueue;
    }

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('pin_queue')
        .select('*')
        .eq('status', 'PENDING')
        .order('created_at', { ascending: true });

      if (error) return { count: 0, items: [], error: error.message };
      
      cachedQueue = { count: data.length, items: data };
      cachedQueueTime = Date.now();
      return cachedQueue;
    } catch (err) {
      return { count: 0, items: [], error: err.message };
    }
  }

  /**
   * Fetch published history from Supabase (COMPLETED pins, cached 5s)
   */
  static async getPublishedHistory(forceFresh = false) {
    const now = Date.now();
    if (!forceFresh && cachedHistory && (now - cachedHistoryTime < CACHE_TTL_MS)) {
      return cachedHistory;
    }

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('pin_queue')
        .select('*')
        .eq('status', 'COMPLETED')
        .order('updated_at', { ascending: false });

      if (error) return [];
      cachedHistory = data || [];
      cachedHistoryTime = Date.now();
      return cachedHistory;
    } catch (err) {
      return [];
    }
  }

  /**
   * Mark pin as completed in Supabase and clean up storage
   */
  static async markPinCompleted(id, storagePath, pinId, pinUrl) {
    const supabase = getSupabaseClient();
    const bucket = this.getBucketName();

    if (storagePath && !storagePath.startsWith('published_')) {
      try {
        await supabase.storage.from(bucket).remove([storagePath]);
      } catch (e) {}
    }

    if (id) {
      try {
        await supabase
          .from('pin_queue')
          .update({
            status: 'COMPLETED',
            error: pinId,
            image_url: pinUrl || '',
            updated_at: new Date().toISOString()
          })
          .eq('id', id);
      } catch (e) {}
    }

    this.invalidateCache();
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

    this.invalidateCache();
  }
}
