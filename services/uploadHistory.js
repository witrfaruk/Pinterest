import fs from 'node:fs';
import crypto from 'node:crypto';
import { HISTORY_FILE, SLOT_HISTORY_FILE, getPublishSlots } from '../config.js';

class UploadHistory {
  constructor() {
    this.history = [];
    this.slotHistory = {};
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(HISTORY_FILE)) {
        const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
        this.history = JSON.parse(raw);
      } else {
        this.history = [];
        this.saveHistory();
      }
    } catch (err) {
      console.error('Error loading history.json:', err.message);
      this.history = [];
    }

    try {
      if (fs.existsSync(SLOT_HISTORY_FILE)) {
        const raw = fs.readFileSync(SLOT_HISTORY_FILE, 'utf8');
        this.slotHistory = JSON.parse(raw);
        this.pruneOldSlotHistory();
      } else {
        this.slotHistory = {};
        this.saveSlotHistory();
      }
    } catch (err) {
      console.error('Error loading slot_history.json:', err.message);
      this.slotHistory = {};
    }
  }

  /**
   * Prune slot history older than 7 calendar days
   */
  pruneOldSlotHistory() {
    const now = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);
    const cutoffDateStr = sevenDaysAgo.toISOString().split('T')[0];

    let modified = false;
    for (const dateKey of Object.keys(this.slotHistory)) {
      if (dateKey < cutoffDateStr) {
        delete this.slotHistory[dateKey];
        modified = true;
      }
    }

    if (modified) {
      this.saveSlotHistory();
    }
  }

  saveHistory() {
    try {
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(this.history, null, 2), 'utf8');
    } catch (err) {
      console.error('Error saving history.json:', err.message);
    }
  }

  saveSlotHistory() {
    try {
      fs.writeFileSync(SLOT_HISTORY_FILE, JSON.stringify(this.slotHistory, null, 2), 'utf8');
    } catch (err) {
      console.error('Error saving slot_history.json:', err.message);
    }
  }

  calculateHash(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  isAlreadyUploaded(filename, fileHash = null) {
    return this.history.some(item => {
      if (item.status !== 'SUCCESS') return false;
      if (fileHash && item.fileHash && item.fileHash === fileHash) return true;
      return item.filename === filename;
    });
  }

  recordUpload({
    filename,
    filePath = '',
    fileHash = '',
    boardId,
    boardName,
    pinId,
    pinUrl,
    title,
    description,
    tags = [],
    altText = '',
    tries = 1,
    status = 'SUCCESS'
  }) {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0];

    const record = {
      id: crypto.randomUUID(),
      timestamp: now.toISOString(),
      date: dateStr,
      time: timeStr,
      filename,
      postName: filename,
      filePath,
      fileHash,
      tries,
      boardId,
      boardName,
      pinId,
      pinUrl,
      title,
      description,
      tags: Array.isArray(tags) ? tags.join(', ') : tags,
      altText,
      status
    };

    this.history.unshift(record);
    this.saveHistory();
    return record;
  }

  recordSlotExecution(dateStr, slotIndex, slotTime, { status, filename = null, boardName = null, pinId = null, error = null }) {
    this.pruneOldSlotHistory();

    if (!this.slotHistory[dateStr]) {
      this.slotHistory[dateStr] = {};
    }

    this.slotHistory[dateStr][slotIndex] = {
      slotIndex,
      slotTime,
      status, // 'COMPLETED', 'FAILED', 'SKIPPED'
      filename,
      boardName,
      pinId,
      error,
      updatedAt: new Date().toISOString()
    };

    this.saveSlotHistory();
  }

  getDaySlots(dateStr) {
    const slotsConfig = getPublishSlots();
    const recorded = this.slotHistory[dateStr] || {};
    
    return slotsConfig.map((time, idx) => {
      if (recorded[idx]) {
        return recorded[idx];
      }
      return {
        slotIndex: idx,
        slotTime: time,
        status: 'PENDING',
        filename: null,
        boardName: null,
        pinId: null,
        error: null
      };
    });
  }

  getUploadsForDate(dateStr) {
    return this.history.filter(item => item.date === dateStr && item.status === 'SUCCESS');
  }

  getAll() {
    return this.history;
  }
}

export const uploadHistory = new UploadHistory();
