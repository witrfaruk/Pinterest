import { uploadHistory } from './uploadHistory.js';
import { getPublishSlots } from '../config.js';

export class ActivityLogService {
  /**
   * Get exactly the rolling last 7 calendar days (Today down to 6 days ago)
   * Automatically drops any older day. Never displays future dates.
   */
  static getSevenDayActivity() {
    uploadHistory.pruneOldSlotHistory();

    const slotsConfig = getPublishSlots();
    const totalSlotsPerDay = slotsConfig.length;
    const days = [];

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

      const dayUploads = uploadHistory.getUploadsForDate(dateStr);
      const daySlots = uploadHistory.getDaySlots(dateStr);

      let successCount = 0;
      let failedCount = 0;
      let skippedCount = 0;

      daySlots.forEach(slot => {
        if (slot.status === 'COMPLETED') successCount++;
        else if (slot.status === 'FAILED') failedCount++;
        else if (slot.status === 'SKIPPED') skippedCount++;
      });

      if (dayUploads.length > successCount) {
        successCount = dayUploads.length;
      }

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
        slots: daySlots,
        uploads: dayUploads
      });
    }

    return {
      days,
      updatedAt: new Date().toISOString()
    };
  }
}
