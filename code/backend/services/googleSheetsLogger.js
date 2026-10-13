import fs from 'node:fs';
import { google } from 'googleapis';
import { GOOGLE_SPREADSHEET_CONFIG } from '../config.js';

export class GoogleSheetsLogger {
  /**
   * Format a record row according to the exact requested Google Sheet headers:
   * Date | Post Name | Time | Tries | Title | Descritpion | Alt Text | Board | Board Id | Status
   */
  static formatRow(record) {
    return [
      record.date || new Date().toISOString().split('T')[0],
      record.filename || record.postName || '',
      record.time || new Date().toTimeString().split(' ')[0],
      record.tries || 1,
      record.title || '',
      record.description || '',
      record.altText || '',
      record.boardName || record.board || '',
      record.boardId || '',
      record.status || 'SUCCESS'
    ];
  }

  /**
   * Append row to Google Spreadsheet
   */
  static async appendRow(record) {
    const rowValues = this.formatRow(record);
    const { spreadsheetId, sheetName, serviceAccountKeyFile, webhookUrl } = GOOGLE_SPREADSHEET_CONFIG;

    // Method 1: Google Apps Script Webhook if configured
    if (webhookUrl) {
      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sheetName,
            row: rowValues
          })
        });
        if (response.ok) {
          console.log(`[Google Sheets] Successfully appended row to "${sheetName}" via Webhook.`);
          return { success: true, method: 'webhook' };
        }
      } catch (webhookErr) {
        console.warn(`[Google Sheets] Webhook append error: ${webhookErr.message}`);
      }
    }

    // Method 2: Google Service Account Key file
    if (fs.existsSync(serviceAccountKeyFile)) {
      try {
        const auth = new google.auth.GoogleAuth({
          keyFile: serviceAccountKeyFile,
          scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });

        const sheets = google.sheets({ version: 'v4', auth });
        const range = `${sheetName}!A:J`;

        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [rowValues]
          }
        });

        console.log(`[Google Sheets] Successfully appended row to "${sheetName}" in Google Spreadsheet ${spreadsheetId}.`);
        return { success: true, method: 'service_account' };
      } catch (apiErr) {
        console.warn(`[Google Sheets] Service account API error: ${apiErr.message}`);
      }
    }

    return {
      success: false,
      reason: 'Google Sheets credentials not yet configured. Local spreadsheet updated successfully.'
    };
  }
}
