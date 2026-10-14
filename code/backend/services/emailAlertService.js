import nodemailer from 'nodemailer';
import '../config.js';

export class EmailAlertService {
  static lastAlertCount = null;
  static lastAlertTimestamp = 0;
  static COOLDOWN_MS = 3 * 60 * 60 * 1000; // 3 hours reminder cooldown

  static getTransporter() {
    const user = process.env.SMTP_USER || '';
    const pass = process.env.SMTP_PASS || '';

    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass }
    });
  }

  static getRecipients() {
    return process.env.ALERT_RECIPIENTS || '';
  }

  static getThreshold() {
    return parseInt(process.env.ALERT_THRESHOLD || '5', 10);
  }

  /**
   * Send an alert email if remaining pins in queue is <= threshold
   * Includes smart throttling to prevent inbox spamming while ensuring critical drop alerts get delivered.
   */
  static async checkAndSendLowQueueAlert(remainingCount, customThreshold = null, force = false) {
    const threshold = customThreshold !== null ? customThreshold : this.getThreshold();

    // If queue is healthy, reset alert tracker so next drop triggers immediately
    if (remainingCount > threshold) {
      this.lastAlertCount = null;
      return { skipped: true, reason: `Queue healthy (${remainingCount} > ${threshold})` };
    }

    const now = Date.now();
    const timeSinceLastAlert = now - this.lastAlertTimestamp;

    // Check if we should trigger:
    // 1. Force is true (manual test or explicit request)
    // 2. First time hitting low queue (lastAlertCount === null)
    // 3. Queue count dropped lower (e.g. from 5 to 4, 3, 2, 1, 0)
    // 4. Cooldown expired (more than 3 hours since last alert)
    const shouldSend = force ||
      this.lastAlertCount === null ||
      remainingCount < this.lastAlertCount ||
      timeSinceLastAlert > this.COOLDOWN_MS;

    if (!shouldSend) {
      return {
        skipped: true,
        reason: `Alert throttled. Last alerted at ${this.lastAlertCount} pins (${Math.round(timeSinceLastAlert / 60000)} mins ago)`
      };
    }

    try {
      const transporter = this.getTransporter();
      const sender = process.env.SMTP_USER || '';
      const recipients = this.getRecipients();

      if (!sender || !recipients) {
        console.warn('[EmailAlert] SMTP_USER or ALERT_RECIPIENTS missing in environment configuration.');
        return { success: false, error: 'SMTP credentials or recipients not configured' };
      }

      const isZero = remainingCount === 0;
      const subject = isZero
        ? `🚨 CRITICAL: Pinterest Queue is EMPTY (0 Pins Left)!`
        : `⚠️ Pinterest Alert: Only ${remainingCount} Pin${remainingCount === 1 ? '' : 's'} Left in Queue!`;

      const mailOptions = {
        from: `"Pinterest Automation Engine" <${sender}>`,
        to: recipients,
        subject,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff;">
            <div style="display: flex; align-items: center; margin-bottom: 24px;">
              <div style="background: #e60023; color: #ffffff; width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: bold; margin-right: 14px; text-align: center; line-height: 44px;">P</div>
              <div>
                <h2 style="margin: 0; color: #0f172a; font-size: 22px; font-weight: 700;">Pinterest Automation</h2>
                <p style="margin: 3px 0 0 0; color: #64748b; font-size: 13px;">Cloud Queue Monitor</p>
              </div>
            </div>

            <div style="background: ${isZero ? '#fef2f2' : '#fffbeb'}; border-left: 4px solid ${isZero ? '#ef4444' : '#f59e0b'}; padding: 18px; border-radius: 8px; margin-bottom: 24px;">
              <h3 style="margin: 0 0 8px 0; color: ${isZero ? '#991b1b' : '#92400e'}; font-size: 17px; font-weight: 600;">
                ${isZero ? '🚨 Queue Completely Empty!' : `⚠️ Low Queue Warning: Only ${remainingCount} Pins Remaining`}
              </h3>
              <p style="margin: 0; color: ${isZero ? '#7f1d1d' : '#78350f'}; font-size: 14px; line-height: 1.5;">
                ${isZero
                  ? 'There are <strong>0 scheduled pins</strong> remaining in Supabase Cloud. Scheduled slots cannot publish new pins until new images are added!'
                  : `The 24/7 cloud publishing queue is running low. There are only <strong>${remainingCount}</strong> scheduled pins left to publish across the daily slots.`}
              </p>
            </div>

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 18px; border-radius: 10px; margin-bottom: 24px;">
              <h4 style="margin: 0 0 12px 0; color: #1e293b; font-size: 15px; font-weight: 600;">What to do next:</h4>
              <ol style="margin: 0; padding-left: 20px; color: #475569; font-size: 14px; line-height: 1.6;">
                <li style="margin-bottom: 6px;">Drop new pin images into the <code>Images/</code> folder on your PC.</li>
                <li style="margin-bottom: 6px;">The local Ollama AI will automatically scan, categorize, write metadata, and push them to Supabase.</li>
                <li>Your scheduled publishing (17:30, 19:30, 21:30, 23:30, 01:30 IST) will continue uninterrupted.</li>
              </ol>
            </div>

            <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; color: #94a3b8; font-size: 12px; text-align: center;">
              Sent automatically to: <strong>${recipients}</strong><br/>
              Alert Threshold: &le; ${threshold} pins
            </div>
          </div>
        `
      };

      const info = await transporter.sendMail(mailOptions);
      this.lastAlertCount = remainingCount;
      this.lastAlertTimestamp = now;

      console.log(`[EmailAlert] ✓ Low queue alert sent to ${recipients} (Remaining: ${remainingCount}, Msg ID: ${info.messageId})`);
      return { success: true, messageId: info.messageId, remainingCount };
    } catch (err) {
      console.error('[EmailAlert] Failed to send email alert:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Send a test email alert to verify SMTP delivery
   */
  static async sendTestAlert() {
    return this.checkAndSendLowQueueAlert(3, 5, true);
  }
}

