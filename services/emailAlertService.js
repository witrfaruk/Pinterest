import nodemailer from 'nodemailer';

export class EmailAlertService {
  static getTransporter() {
    const user = process.env.SMTP_USER || 'farukhetro@gmail.com';
    const pass = process.env.SMTP_PASS || 'rvsrlaksnuyrzgvy';

    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass }
    });
  }

  static getRecipients() {
    return process.env.ALERT_RECIPIENTS || 'mdarif59gdis@gmail.com,arif.pvt.9@gmail.com,farukflare@gmail.com';
  }

  /**
   * Send an alert email if remaining pins in queue is <= threshold
   */
  static async checkAndSendLowQueueAlert(remainingCount, threshold = 5) {
    if (remainingCount > threshold) return;

    try {
      const transporter = this.getTransporter();
      const sender = process.env.SMTP_USER || 'farukhetro@gmail.com';
      const recipients = this.getRecipients();

      const mailOptions = {
        from: `"Finmunt Pinterest Engine" <${sender}>`,
        to: recipients,
        subject: `⚠️ Finmunt Pinterest Alert: Only ${remainingCount} Pin${remainingCount === 1 ? '' : 's'} Left in Queue!`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff;">
            <div style="display: flex; align-items: center; margin-bottom: 24px;">
              <div style="background: #e60023; color: #ffffff; width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: bold; margin-right: 14px; text-align: center; line-height: 44px;">P</div>
              <div>
                <h2 style="margin: 0; color: #0f172a; font-size: 22px; font-weight: 700;">Finmunt Pinterest Automation</h2>
                <p style="margin: 3px 0 0 0; color: #64748b; font-size: 13px;">Cloud Queue Monitor</p>
              </div>
            </div>

            <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 18px; border-radius: 8px; margin-bottom: 24px;">
              <h3 style="margin: 0 0 8px 0; color: #991b1b; font-size: 17px; font-weight: 600;">Low Queue Warning: Only ${remainingCount} Pins Remaining</h3>
              <p style="margin: 0; color: #7f1d1d; font-size: 14px; line-height: 1.5;">
                The 24/7 cloud publishing queue for <strong>@Finmunt</strong> is running low. There are only <strong>${remainingCount}</strong> scheduled pins left to publish across the daily slots.
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
              Sent automatically to: <strong>${recipients}</strong>
            </div>
          </div>
        `
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`[EmailAlert] ✓ Low queue alert sent to ${recipients} (ID: ${info.messageId})`);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      console.error('[EmailAlert] Failed to send email alert:', err.message);
      return { success: false, error: err.message };
    }
  }
}
