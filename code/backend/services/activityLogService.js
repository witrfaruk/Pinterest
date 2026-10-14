import { uploadHistory } from './uploadHistory.js';
import { getPublishSlots } from '../config.js';
import { SupabaseSyncService } from './supabaseSyncService.js';

function isSlotPassedToday(slotTimeStr) {
  const now = new Date();
  // Calculate current IST (UTC + 5:30)
  const utcNow = now.getTime() + (now.getTimezoneOffset() * 60000);
  const istNow = new Date(utcNow + (3600000 * 5.5));

  const [slotH, slotM] = slotTimeStr.split(':').map(Number);
  const slotMinutes = (slotH * 60) + slotM;
  const currentMinutes = (istNow.getHours() * 60) + istNow.getMinutes();

  // Overnight slot (01:30)
  if (slotH < 5) {
    return false;
  }

  return currentMinutes >= slotMinutes;
}

export class ActivityLogService {
  /**
   * Get exactly the rolling last 7 calendar days (Today down to 6 days ago)
   * Merges Supabase Cloud published history with local upload history.
   */
  static async getSevenDayActivity() {
    uploadHistory.pruneOldSlotHistory();

    const slotsConfig = getPublishSlots();
    const totalSlotsPerDay = slotsConfig.length;
    const days = [];

    // 1. Fetch Cloud Completed Pins from Supabase
    let cloudHistory = [];
    try {
      cloudHistory = await SupabaseSyncService.getPublishedHistory();
    } catch (e) {
      console.warn('Could not fetch cloud published history:', e.message);
    }

    const localHistory = uploadHistory.getAll() || [];

    // 2. Build unified list of real completed published pins
    const combinedPublished = [];
    const seenPinIds = new Set();

    for (const item of [...localHistory, ...cloudHistory]) {
      const pinId = item.pinId || item.pin_id || item.error;
      const title = item.title;
      const key = pinId || title;
      if (key && seenPinIds.has(key)) continue;
      if (key) seenPinIds.add(key);

      const timestampStr = item.timestamp || item.updated_at || item.created_at || new Date().toISOString();
      const dateStr = item.date || timestampStr.split('T')[0];

      combinedPublished.push({
        date: dateStr,
        timestamp: timestampStr,
        filename: item.filename || item.title || 'Pin',
        title: item.title || item.filename,
        boardName: item.boardName || item.board_name || 'General',
        pinId: pinId,
        pinUrl: item.pinUrl || item.image_url || (pinId ? `https://www.pinterest.com/pin/${pinId}/` : null),
        status: 'COMPLETED'
      });
    }

    const now = new Date();

    for (let i = 0; i < 7; i++) {
      const targetDate = new Date();
      targetDate.setDate(now.getDate() - i);
      
      const dateStr = targetDate.toISOString().split('T')[0];
      
      // Format as "October 8"
      const monthName = targetDate.toLocaleDateString('en-US', { month: 'long' });
      const dayNum = targetDate.getDate();
      const dateLabel = `${monthName} ${dayNum}`;
      const weekday = targetDate.toLocaleDateString('en-US', { weekday: 'short' });

      // Published pins on this specific calendar date
      const dayUploads = combinedPublished.filter(item => item.date === dateStr);
      const recordedDaySlots = uploadHistory.getDaySlots(dateStr);

      let usedUploadIndex = 0;

      const slots = slotsConfig.map((time, idx) => {
        // If local recorded slot execution exists and has COMPLETED
        const rec = recordedDaySlots[idx];
        if (rec && rec.status === 'COMPLETED') {
          return rec;
        }

        // For today: only mark as completed if the slot time has actually passed
        if (i === 0) {
          const hasPassed = isSlotPassedToday(time);
          if (hasPassed && dayUploads[usedUploadIndex]) {
            const u = dayUploads[usedUploadIndex];
            usedUploadIndex++;
            return {
              slotIndex: idx,
              slotTime: time,
              status: 'COMPLETED',
              filename: u.title || u.filename,
              boardName: u.boardName,
              pinId: u.pinId,
              pinUrl: u.pinUrl,
              error: null
            };
          }

          // Slot time is in the future
          return {
            slotIndex: idx,
            slotTime: time,
            status: 'PENDING',
            filename: null,
            boardName: null,
            pinId: null,
            error: null
          };
        }

        // For past days
        if (dayUploads[usedUploadIndex]) {
          const u = dayUploads[usedUploadIndex];
          usedUploadIndex++;
          return {
            slotIndex: idx,
            slotTime: time,
            status: 'COMPLETED',
            filename: u.title || u.filename,
            boardName: u.boardName,
            pinId: u.pinId,
            pinUrl: u.pinUrl,
            error: null
          };
        }

        return {
          slotIndex: idx,
          slotTime: time,
          status: 'SKIPPED',
          filename: null,
          boardName: null,
          pinId: null,
          error: null
        };
      });

      let successCount = slots.filter(s => s.status === 'COMPLETED').length;
      let failedCount = slots.filter(s => s.status === 'FAILED').length;
      let skippedCount = slots.filter(s => s.status === 'SKIPPED').length;

      days.push({
        date: dateStr,
        label: dateLabel,
        isToday: i === 0,
        weekday,
        successCount,
        totalSlots: totalSlotsPerDay,
        summaryText: `${successCount} / ${totalSlotsPerDay} successful`,
        failedCount,
        skippedCount,
        slots,
        uploads: dayUploads
      });
    }

    return {
      days,
      updatedAt: new Date().toISOString()
    };
  }
}
