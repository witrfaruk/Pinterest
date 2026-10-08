import fs from 'node:fs';
import crypto from 'node:crypto';
import { HISTORY_FILE } from '../config.js';

class HistoryService {
  constructor() {
    this.history = [];
    this.loadHistory();
  }

  loadHistory() {
    try {
      if (fs.existsSync(HISTORY_FILE)) {
        const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
        this.history = JSON.parse(raw);
      } else {
        this.history = [];
        this.saveHistory();
      }
    } catch (err) {
      console.error('Error loading history:', err.message);
      this.history = [];
    }
  }

  saveHistory() {
    try {
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(this.history, null, 2), 'utf8');
    } catch (err) {
      console.error('Error saving history:', err.message);
    }
  }

  /**
   * Calculate SHA-256 hash of a file buffer
   */
  calculateHash(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Check if a file or hash has already been successfully uploaded
   */
  isAlreadyUploaded(filename, fileHash = null) {
    return this.history.some(item => {
      if (item.status !== 'SUCCESS') return false;
      if (fileHash && item.fileHash && item.fileHash === fileHash) return true;
      return item.filename === filename;
    });
  }

  /**
   * Record a successful upload
   */
  recordUpload({
    filename,
    filePath = '',
    fileHash = '',
    pinId,
    pinUrl,
    title,
    description,
    boardId = '',
    status = 'SUCCESS'
  }) {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = now.toTimeString().split(' ')[0]; // HH:mm:ss

    const record = {
      id: crypto.randomUUID(),
      timestamp: now.toISOString(),
      date: dateStr,
      time: timeStr,
      filename,
      filePath,
      fileHash,
      pinId,
      pinUrl,
      title,
      description,
      boardId,
      status
    };

    this.history.unshift(record);
    this.saveHistory();
    return record;
  }

  /**
   * Get all uploads for today (local date)
   */
  getTodayUploads() {
    const today = new Date().toISOString().split('T')[0];
    return this.history.filter(item => item.date === today && item.status === 'SUCCESS');
  }

  /**
   * Get total count of uploads today
   */
  getTodayUploadCount() {
    return this.getTodayUploads().length;
  }

  /**
   * Get the most recently uploaded image record
   */
  getLastUpload() {
    return this.history.find(item => item.status === 'SUCCESS') || null;
  }

  /**
   * Get all history records
   */
  getAll() {
    return this.history;
  }
}

export const historyService = new HistoryService();
