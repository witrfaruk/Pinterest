import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, IMAGES_DIR, HISTORY_FILE, SLOT_HISTORY_FILE, EXCEL_FILE, CSV_FILE } from '../config.js';
import { SpreadsheetLogger } from '../services/spreadsheetLogger.js';

console.log('🧹 Purging all mock data and test records...');

// 1. Reset history.json
fs.writeFileSync(HISTORY_FILE, JSON.stringify([], null, 2), 'utf8');

// 2. Reset slot_history.json
fs.writeFileSync(SLOT_HISTORY_FILE, JSON.stringify({}, null, 2), 'utf8');

// 3. Reset local spreadsheets
if (fs.existsSync(CSV_FILE)) fs.unlinkSync(CSV_FILE);
if (fs.existsSync(EXCEL_FILE)) fs.unlinkSync(EXCEL_FILE);

SpreadsheetLogger.initCSV();
await SpreadsheetLogger.updateExcel([]);

// 4. Clean any test images from Images/ folder
if (fs.existsSync(IMAGES_DIR)) {
  const files = fs.readdirSync(IMAGES_DIR);
  for (const f of files) {
    if (f.startsWith('pipeline_test') || f.startsWith('test_')) {
      fs.unlinkSync(path.join(IMAGES_DIR, f));
      console.log(`  Removed test image: ${f}`);
    }
  }
}

console.log('✅ All data and history reset to a 100% clean state.');
