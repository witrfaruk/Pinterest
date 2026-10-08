import fs from 'node:fs';
import ExcelJS from 'exceljs';
import { EXCEL_FILE, CSV_FILE } from '../config.js';
import { GoogleSheetsLogger } from './googleSheetsLogger.js';

// Exact 10 headers matching user's Google Spreadsheet (Sheet: "Finmunt")
const HEADERS = [
  { header: 'Date', key: 'date', width: 14 },
  { header: 'Post Name', key: 'postName', width: 28 },
  { header: 'Time', key: 'time', width: 12 },
  { header: 'Tries', key: 'tries', width: 10 },
  { header: 'Title', key: 'title', width: 35 },
  { header: 'Descritpion', key: 'description', width: 50 },
  { header: 'Alt Text', key: 'altText', width: 35 },
  { header: 'Board', key: 'board', width: 22 },
  { header: 'Board Id', key: 'boardId', width: 22 },
  { header: 'Status', key: 'status', width: 12 }
];

export class SpreadsheetLogger {
  static escapeCSV(field) {
    if (field === null || field === undefined) return '""';
    const str = String(field).replace(/"/g, '""');
    return `"${str}"`;
  }

  static initCSV() {
    if (!fs.existsSync(CSV_FILE)) {
      const headerLine = HEADERS.map(h => this.escapeCSV(h.header)).join(',') + '\n';
      fs.writeFileSync(CSV_FILE, headerLine, 'utf8');
    }
  }

  static appendCSV(row) {
    this.initCSV();
    const line = [
      this.escapeCSV(row.date),
      this.escapeCSV(row.filename || row.postName),
      this.escapeCSV(row.time),
      this.escapeCSV(row.tries || 1),
      this.escapeCSV(row.title),
      this.escapeCSV(row.description),
      this.escapeCSV(row.altText),
      this.escapeCSV(row.boardName || row.board),
      this.escapeCSV(row.boardId),
      this.escapeCSV(row.status)
    ].join(',') + '\n';

    fs.appendFileSync(CSV_FILE, line, 'utf8');
  }

  static async updateExcel(allHistory) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Pinterest Publisher Machine';
    workbook.created = new Date();

    const todayDate = new Date().toISOString().split('T')[0];

    // Sheet 1: Finmunt (Today)
    const todaySheet = workbook.addWorksheet('Finmunt');
    this.formatSheet(todaySheet, allHistory.filter(item => item.date === todayDate));

    // Sheet 2: All Uploads
    const allSheet = workbook.addWorksheet('All Uploads');
    this.formatSheet(allSheet, allHistory);

    await workbook.xlsx.writeFile(EXCEL_FILE);
  }

  static formatSheet(worksheet, dataRows) {
    worksheet.columns = HEADERS;

    const headerRow = worksheet.getRow(1);
    headerRow.height = 26;
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Segoe UI' };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF171717' }
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    dataRows.forEach((item, index) => {
      const row = worksheet.addRow({
        date: item.date,
        postName: item.filename || item.postName,
        time: item.time,
        tries: item.tries || 1,
        title: item.title,
        description: item.description,
        altText: item.altText,
        board: item.boardName || item.board,
        boardId: item.boardId,
        status: item.status
      });

      row.height = 22;
      row.alignment = { vertical: 'middle' };

      if (index % 2 === 1) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF9FAFB' }
        };
      }

      const statusCell = row.getCell('status');
      if (item.status === 'SUCCESS') {
        statusCell.font = { color: { argb: 'FF15803D' }, bold: true };
      }
    });

    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: HEADERS.length }
    };
  }

  static async recordUpload(record, allHistory) {
    try {
      // 1. Append to local CSV
      this.appendCSV(record);
      
      // 2. Update local Excel (.xlsx)
      await this.updateExcel(allHistory);

      // 3. Sync to Google Spreadsheet "Finmunt"
      await GoogleSheetsLogger.appendRow(record);
    } catch (err) {
      console.error('Error logging to spreadsheet:', err.message);
    }
  }
}
