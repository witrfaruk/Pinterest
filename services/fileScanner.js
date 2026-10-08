import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { historyService } from './historyService.js';

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);

export class FileScanner {
  /**
   * Check if a folder path exists and is a directory
   */
  static async validateFolder(folderPath) {
    if (!folderPath || typeof folderPath !== 'string') {
      return { valid: false, error: 'Folder path is required' };
    }

    try {
      const stats = await fs.stat(folderPath);
      if (!stats.isDirectory()) {
        return { valid: false, error: 'Specified path is not a directory' };
      }
      return { valid: true, error: null };
    } catch (err) {
      return { valid: false, error: `Folder does not exist or cannot be accessed: ${err.message}` };
    }
  }

  /**
   * Scan folder and return all valid pending images not yet uploaded
   */
  static async scanPendingImages(folderPath) {
    const validation = await this.validateFolder(folderPath);
    if (!validation.valid) {
      return {
        valid: false,
        error: validation.error,
        pending: [],
        totalInFolder: 0,
        waitingCount: 0
      };
    }

    try {
      const entries = await fs.readdir(folderPath, { withFileTypes: true });
      const imageFiles = [];

      for (const entry of entries) {
        if (!entry.isFile()) continue;

        const ext = path.extname(entry.name).toLowerCase();
        if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

        const fullPath = path.join(folderPath, entry.name);
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

      // Sort by creation/modified time ascending (oldest first for sequential FIFO processing)
      imageFiles.sort((a, b) => a.mtime - b.mtime);

      // Filter out files that have already been recorded as uploaded in history
      const pending = [];
      for (const img of imageFiles) {
        if (!historyService.isAlreadyUploaded(img.filename)) {
          pending.push(img);
        }
      }

      return {
        valid: true,
        error: null,
        pending,
        totalInFolder: imageFiles.length,
        waitingCount: pending.length
      };
    } catch (err) {
      return {
        valid: false,
        error: `Failed to read folder contents: ${err.message}`,
        pending: [],
        totalInFolder: 0,
        waitingCount: 0
      };
    }
  }

  /**
   * Get the next pending image to process
   */
  static async getNextPendingImage(folderPath) {
    const result = await this.scanPendingImages(folderPath);
    if (!result.valid || result.pending.length === 0) {
      return null;
    }
    return result.pending[0];
  }
}
