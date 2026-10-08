import { getPublishSlots } from '../config.js';
import { publisherEngine } from './publisherEngine.js';

class Scheduler {
  constructor() {
    this.intervalId = null;
    this.lastTriggeredKey = null;
    this.init();
  }

  init() {
    this.intervalId = setInterval(() => this.checkSchedule(), 15000);
    console.log(`[Scheduler] 5 Publishing Slots initialized: ${getPublishSlots().join(', ')}`);
  }

  checkSchedule() {
    const slots = getPublishSlots();
    const now = new Date();
    const currentHour = String(now.getHours()).padStart(2, '0');
    const currentMinute = String(now.getMinutes()).padStart(2, '0');
    const todayDateStr = now.toISOString().split('T')[0];

    slots.forEach((slotTime, index) => {
      const [slotH, slotM] = slotTime.split(':');
      if (currentHour === slotH && currentMinute === slotM) {
        const triggerKey = `${todayDateStr}_${index}_${slotTime}`;
        if (this.lastTriggeredKey !== triggerKey) {
          this.lastTriggeredKey = triggerKey;
          console.log(`[Scheduler] Triggering Slot ${index + 1} (${slotTime}) at ${now.toLocaleTimeString()}`);
          publisherEngine.processPublishSlot(index, slotTime).catch(err => {
            console.error(`[Scheduler] Slot ${index + 1} execution error:`, err.message);
          });
        }
      }
    });
  }

  /**
   * Get upcoming slot description (strictly today or tomorrow, with exact countdown)
   */
  getNextSlotInfo() {
    const slots = getPublishSlots();
    if (!slots.length) {
      return { slotIndex: 0, time: '--:--', displayText: 'No slots scheduled' };
    }

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Find all remaining slots today
    const upcomingToday = [];
    slots.forEach((time, index) => {
      const [h, m] = time.split(':').map(Number);
      const slotMinutes = h * 60 + m;
      if (slotMinutes > currentMinutes) {
        upcomingToday.push({
          slotIndex: index,
          time,
          minutesUntil: slotMinutes - currentMinutes
        });
      }
    });

    if (upcomingToday.length > 0) {
      upcomingToday.sort((a, b) => a.minutesUntil - b.minutesUntil);
      const next = upcomingToday[0];
      const diffH = Math.floor(next.minutesUntil / 60);
      const diffM = next.minutesUntil % 60;
      const countdown = diffH > 0 ? `${diffH}h ${diffM}m` : `${diffM}m`;
      return {
        slotIndex: next.slotIndex,
        time: next.time,
        displayText: `Today at ${next.time} (in ${countdown})`
      };
    }

    // Wrap around to earliest slot tomorrow
    const tomorrowSlots = slots.map((time, index) => {
      const [h, m] = time.split(':').map(Number);
      return { slotIndex: index, time, slotMinutes: h * 60 + m };
    }).sort((a, b) => a.slotMinutes - b.slotMinutes);

    const firstTomorrow = tomorrowSlots[0];
    const diff = (24 * 60 - currentMinutes) + firstTomorrow.slotMinutes;
    const diffH = Math.floor(diff / 60);
    const diffM = diff % 60;
    const countdown = diffH > 0 ? `${diffH}h ${diffM}m` : `${diffM}m`;

    return {
      slotIndex: firstTomorrow.slotIndex,
      time: firstTomorrow.time,
      displayText: `Tomorrow at ${firstTomorrow.time} (in ${countdown})`
    };
  }
}

export const scheduler = new Scheduler();

