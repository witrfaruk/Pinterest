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
   * Get upcoming slot description (strictly within today or tomorrow, no future date leaks)
   */
  getNextSlotInfo() {
    const slots = getPublishSlots();
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    for (let i = 0; i < slots.length; i++) {
      const [h, m] = slots[i].split(':').map(Number);
      const slotMinutes = h * 60 + m;
      if (slotMinutes > currentMinutes) {
        const diff = slotMinutes - currentMinutes;
        const diffH = Math.floor(diff / 60);
        const diffM = diff % 60;
        const countdown = diffH > 0 ? `${diffH}h ${diffM}m` : `${diffM}m`;
        return {
          slotIndex: i,
          time: slots[i],
          displayText: `Today at ${slots[i]} (in ${countdown})`
        };
      }
    }

    const firstSlot = slots[0] || '09:00';
    return {
      slotIndex: 0,
      time: firstSlot,
      displayText: `Tomorrow at ${firstSlot}`
    };
  }
}

export const scheduler = new Scheduler();
