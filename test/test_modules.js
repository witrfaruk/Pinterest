import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

import { LIMITS, getBoardsConfig, GOOGLE_SPREADSHEET_CONFIG } from '../config.js';
import { MetadataGenerator } from '../services/metadataGenerator.js';
import { GoogleSheetsLogger } from '../services/googleSheetsLogger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_DIR = path.join(__dirname, 'test_sandbox');

async function runTests() {
  console.log('🧪 Starting Isolated Verification Test Suite...\n');

  if (!fsSync.existsSync(TEST_DIR)) {
    fsSync.mkdirSync(TEST_DIR, { recursive: true });
  }

  // Test 1: Real 5 Boards & Limits
  console.log('Test 1: Verifying 5 Boards and Centralized Limits...');
  const boards = getBoardsConfig();
  assert.strictEqual(boards.length, 5, 'Must have exactly 5 boards configured');
  assert.strictEqual(LIMITS.TITLE_MAX_LENGTH, 100, 'Title limit must be 100');
  assert.strictEqual(LIMITS.DESCRIPTION_MAX_LENGTH, 500, 'Description limit must be 500');
  assert.strictEqual(LIMITS.ALT_TEXT_MAX_LENGTH, 500, 'Alt text limit must be 500');
  assert.strictEqual(LIMITS.MAX_RETRIES_PER_IMAGE, 10, 'Max retry limit must be 10');
  assert.strictEqual(GOOGLE_SPREADSHEET_CONFIG.spreadsheetId, '1mjlVzJsARnpRHLQV3FMdLQUtEQSUl02J2V1spmnDKLc');
  assert.strictEqual(GOOGLE_SPREADSHEET_CONFIG.sheetName, 'Finmunt');
  console.log('  ✓ 5 Real Boards and Configuration limits verified.');

  // Test 2: Programmatic Clamping & Limits Validation
  console.log('\nTest 2: Programmatic character limit enforcement...');
  const sampleData = {
    title: 'How to Build Real Passive Income Streams in 2026 With Tested Online Business Models',
    description: 'Practical guide detailing steps to build sustainable passive income. '.repeat(10),
    tags: ['passiveincome', 'money', 'business', 'onlineincome'],
    altText: 'A detailed financial growth chart showing passive income streams'
  };

  const clamped = MetadataGenerator.validateAndClampMetadata(sampleData);
  assert.ok(clamped.title.length <= 100, `Title exceeds limit: ${clamped.title.length}`);
  assert.ok(clamped.description.length <= 500, `Description exceeds limit: ${clamped.description.length}`);
  assert.ok(clamped.altText.length <= 500, `Alt text exceeds limit: ${clamped.altText.length}`);
  assert.ok(Array.isArray(clamped.tags) && clamped.tags.length <= 8, 'Tags count within limits');
  console.log('  ✓ Programmatic metadata limits strictly enforced.');

  // Test 3: Google Spreadsheet Row Formatting (10 exact columns)
  console.log('\nTest 3: Google Spreadsheet exact 10-column mapping...');
  const testRecord = {
    date: '2026-10-08',
    filename: 'sample_budget.png',
    time: '12:00:00',
    tries: 1,
    title: '5 Budgeting Rules for 2026',
    description: 'Learn the 50/30/20 rule #budgeting #money',
    altText: 'A visual budget breakdown pie chart',
    boardName: 'Budgeting',
    boardId: '1152640167071860784',
    status: 'SUCCESS'
  };

  const row = GoogleSheetsLogger.formatRow(testRecord);
  assert.strictEqual(row.length, 10, 'Must have exactly 10 columns');
  assert.strictEqual(row[0], '2026-10-08', 'Col 1: Date');
  assert.strictEqual(row[1], 'sample_budget.png', 'Col 2: Post Name');
  assert.strictEqual(row[2], '12:00:00', 'Col 3: Time');
  assert.strictEqual(row[3], 1, 'Col 4: Tries');
  assert.strictEqual(row[4], '5 Budgeting Rules for 2026', 'Col 5: Title');
  assert.strictEqual(row[5], 'Learn the 50/30/20 rule #budgeting #money', 'Col 6: Descritpion');
  assert.strictEqual(row[6], 'A visual budget breakdown pie chart', 'Col 7: Alt Text');
  assert.strictEqual(row[7], 'Budgeting', 'Col 8: Board');
  assert.strictEqual(row[8], '1152640167071860784', 'Col 9: Board Id');
  assert.strictEqual(row[9], 'SUCCESS', 'Col 10: Status');
  console.log('  ✓ Google Sheet Row mapping validated for "Finmunt".');

  // Clean test sandbox
  if (fsSync.existsSync(TEST_DIR)) {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  }

  console.log('\n✨ All automated tests passed with clean isolation!\n');
}

runTests().catch(err => {
  console.error('\n❌ Test failure:', err);
  process.exit(1);
});
