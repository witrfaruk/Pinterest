import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { EXCEL_FILE, CSV_FILE } from '../config.js';

const HEADERS = [
  { header: 'Date', key: 'date', width: 14 },
  { header: 'Time', key: 'time', width: 12 },
  { header: 'Filename', key: 'filename', width: 28 },
  { header: 'Pinterest Pin ID', key: 'pinId', width: 22 },
  { header: 'Pinterest Title', key: 'title', width: 35 },
  { header: 'Pinterest Description', key: 'description', width: 55 },
  { header: 'Pinterest URL', key: 'pinUrl', width: 45 },
  { header: 'Status', key: 'status', width: 12 }
];

export class SpreadsheetService {
  /**
   * Escape CSV field
   */
  static escapeCSV(field) {
    if (field === null || field === undefined) return '""';
    const str = String(field).replace(/"/g, '""');
    return `"${str}"`;
  }

  /**
   * Initialize CSV file if it doesn't exist
   */
  static initCSV() {
    if (!fs.existsSync(CSV_FILE)) {
      const headerLine = HEADERS.map(h => this.escapeCSV(h.header)).join(',') + '\n';
      fs.writeFileSync(CSV_FILE, headerLine, 'utf8');
    }
  }

  /**
   * Append a row to CSV file
   */
  static appendCSV(row) {
    this.initCSV();
    const line = [
      this.escapeCSV(row.date),
      this.escapeCSV(row.time),
      this.escapeCSV(row.filename),
      this.escapeCSV(row.pinId),
      this.escapeCSV(row.title),
      this.escapeCSV(row.description),
      this.escapeCSV(row.pinUrl),
      this.escapeCSV(row.status)
    ].join(',') + '\n';

    fs.appendFileSync(CSV_FILE, line, 'utf8');
  }

  /**
   * Rebuild or update Excel spreadsheet with All Uploads and Today's Uploads sheets
   */
  static async updateExcel(allHistory) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Pinterest Publisher Machine';
    workbook.lastModifiedBy = 'Pinterest Publisher Machine';
    workbook.created = new Date();
    workbook.modified = new Date();

    const todayDate = new Date().toISOString().split('T')[0];

    // Sheet 1: Today's Uploads
    const todaySheet = workbook.addWorksheet('Today');
    this.formatSheet(todaySheet, allHistory.filter(item => item.date === todayDate));

    // Sheet 2: All Uploads
    const allSheet = workbook.addWorksheet('All Uploads');
    this.formatSheet(allSheet, allHistory);

    await workbook.xlsx.writeFile(EXCEL_FILE);
  }

  /**
   * Format worksheet styling and populate rows
   */
  static formatSheet(worksheet, dataRows) {
    worksheet.columns = HEADERS;

    // Style Header Row
    const headerRow = worksheet.getRow(1);
    headerRow.height = 28;
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Segoe UI' };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F2937' } // Dark charcoal
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Add Data Rows
    dataRows.forEach((item, index) => {
      const row = worksheet.addRow({
        date: item.date,
        time: item.time,
        filename: item.filename,
        pinId: item.pinId,
        title: item.title,
        description: item.description,
        pinUrl: item.pinUrl,
        status: item.status
      });

      row.height = 24;
      row.alignment = { vertical: 'middle', wrapText: false };

      // Zebra striping
      if (index % 2 === 1) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF9FAFB' }
        };
      }

      // Format Pinterest URL cell as clickable link
      if (item.pinUrl) {
        const urlCell = row.getCell('pinUrl');
        urlCell.value = {
          text: item.pinUrl,
          hyperlink: item.pinUrl
        };
        urlCell.font = { color: { argb: 'FF2563EB' }, underline: true };
      }

      // Status color
      const statusCell = row.getCell('status');
      if (item.status === 'SUCCESS') {
        statusCell.font = { color: { argb: 'FF059669' }, bold: true };
      }
    });

    // Add auto-filter
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: HEADERS.length }
    };
  }

  /**
   * Record a new successful upload in both CSV and Excel
   */
  static async recordUpload(record, allHistory) {
    try {
      this.appendCSV(record);
      await this.updateExcel(allHistory);
    } catch (err) {
      console.error('Error recording to spreadsheet:', err.message);
    }
  }
}
