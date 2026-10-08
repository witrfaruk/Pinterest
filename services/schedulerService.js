import { getSettings } from '../config.js';
import { publisherEngine } from './publisherEngine.js';

class SchedulerService {
  constructor() {
    this.timerId = null;
    this.nextPublishTime = null;
    this.checkInterval = null;
    this.init();
  }

  init() {
    // Check every 30 seconds if time has arrived
    this.checkInterval = setInterval(() => {
      this.tick();
    }, 30000);

    this.updateSchedule();
  }

  /**
   * Calculate next run Date object for a given "HH:mm" time string in local time
   */
  calculateNextRun(timeString) {
    if (!timeString || !timeString.includes(':')) return null;

    const [hours, minutes] = timeString.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return null;

    const now = new Date();
    const target = new Date();
    target.setHours(hours, minutes, 0, 0);

    // If target time today has already passed, schedule for tomorrow
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }

    return target;
  }

  /**
   * Update the scheduler when settings change
   */
  updateSchedule() {
    const settings = getSettings();
    if (!settings.scheduleEnabled || !settings.scheduledTime) {
      this.nextPublishTime = null;
      return;
    }

    this.nextPublishTime = this.calculateNextRun(settings.scheduledTime);
  }

  /**
   * Periodic tick check
   */
  async tick() {
    const settings = getSettings();
    if (!settings.scheduleEnabled || !settings.scheduledTime) {
      this.nextPublishTime = null;
      return;
    }

    const now = new Date();
    const [targetHour, targetMinute] = settings.scheduledTime.split(':').map(Number);

    // Check if current minute matches target
    if (now.getHours() === targetHour && now.getMinutes() === targetMinute) {
      // Prevent running multiple times in the same minute
      const lastRunKey = `${now.toDateString()} ${targetHour}:${targetMinute}`;
      if (this.lastExecutedKey !== lastRunKey) {
        this.lastExecutedKey = lastRunKey;
        publisherEngine.log(`Scheduled publish triggered at ${settings.scheduledTime}`, 'info');

        try {
          await publisherEngine.processNext();
        } catch (err) {
          publisherEngine.log(`Scheduled publish encountered error: ${err.message}`, 'error');
        }

        // Recalculate next run (tomorrow)
        this.nextPublishTime = this.calculateNextRun(settings.scheduledTime);
      }
    } else {
      // Update next publish time display
      if (!this.nextPublishTime || this.nextPublishTime <= now) {
        this.nextPublishTime = this.calculateNextRun(settings.scheduledTime);
      }
    }
  }

  /**
   * Get human-readable description of next scheduled publish
   */
  getNextScheduledInfo() {
    const settings = getSettings();
    if (!settings.scheduleEnabled) {
      return {
        enabled: false,
        time: settings.scheduledTime || '14:00',
        nextRun: null,
        displayText: 'Disabled (Manual Mode)'
      };
    }

    if (!this.nextPublishTime) {
      this.nextPublishTime = this.calculateNextRun(settings.scheduledTime);
    }

    if (!this.nextPublishTime) {
      return {
        enabled: true,
        time: settings.scheduledTime,
        nextRun: null,
        displayText: 'Invalid time configuration'
      };
    }

    const now = new Date();
    const isToday = this.nextPublishTime.toDateString() === now.toDateString();
    const timeFormatted = this.nextPublishTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const diffMs = this.nextPublishTime.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    let countdown = '';
    if (diffHours > 0) {
      countdown = `in ${diffHours}h ${diffMinutes}m`;
    } else {
      countdown = `in ${diffMinutes}m`;
    }

    const dayPrefix = isToday ? 'Today' : 'Tomorrow';
    const displayText = `${dayPrefix} at ${timeFormatted} (${countdown})`;

    return {
      enabled: true,
      time: settings.scheduledTime,
      nextRun: this.nextPublishTime.toISOString(),
      displayText
    };
  }
}

export const schedulerService = new SchedulerService();
