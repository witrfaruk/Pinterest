import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { IMAGES_DIR } from '../config.js';
import { uploadHistory } from './uploadHistory.js';

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);

export class ImageScanner {
  /**
   * Scan the fixed Images folder and return all unprocessed images
   */
  static async scanPendingImages() {
    if (process.env.VERCEL) {
      return { success: true, folder: '/tmp', pending: [], totalInFolder: 0, waitingCount: 0 };
    }

    if (!fsSync.existsSync(IMAGES_DIR)) {
      await fs.mkdir(IMAGES_DIR, { recursive: true });
    }

    try {
      const entries = await fs.readdir(IMAGES_DIR, { withFileTypes: true });
      const imageFiles = [];

      for (const entry of entries) {
        if (!entry.isFile()) continue;

        const ext = path.extname(entry.name).toLowerCase();
        if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

        const fullPath = path.join(IMAGES_DIR, entry.name);
        try {
          const stats = await fs.stat(fullPath);
          imageFiles.push({
            filename: entry.name,
            fullPath,
            ext,
            size: stats.size,
            mtime: stats.mtimeMs
          });
        } catch (e) {
          // ignore unreadable file
        }
      }

      // Sort by creation/modified time (FIFO)
      imageFiles.sort((a, b) => a.mtime - b.mtime);

      // Filter out files that have already been recorded in upload history
      const pending = [];
      for (const img of imageFiles) {
        if (!uploadHistory.isAlreadyUploaded(img.filename)) {
          pending.push(img);
        }
      }

      return {
        success: true,
        folder: IMAGES_DIR,
        pending,
        totalInFolder: imageFiles.length,
        waitingCount: pending.length
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to scan ${IMAGES_DIR}: ${err.message}`,
        pending: [],
        totalInFolder: 0,
        waitingCount: 0
      };
    }
  }

  /**
   * Get the next pending image to process
   */
  static async getNextPendingImage() {
    const result = await this.scanPendingImages();
    if (!result.success || result.pending.length === 0) {
      return null;
    }
    return result.pending[0];
  }
}
