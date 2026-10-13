import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const codeDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(__dirname, '../..');

// Load .env from code directory (or root/local fallback)
const envPath = [
  path.join(codeDir, '.env'),
  path.join(rootDir, '.env'),
  path.join(__dirname, '.env')
].find(p => fs.existsSync(p)) || path.join(codeDir, '.env');
dotenv.config({ path: envPath });

// Fixed Core Image Source Folder (Root /Images, or /tmp on Vercel Serverless)
export const IMAGES_DIR = process.env.VERCEL
  ? '/tmp/Images'
  : (process.env.IMAGES_DIR || (fs.existsSync(path.resolve(rootDir, 'Images'))
      ? path.resolve(rootDir, 'Images')
      : (fs.existsSync(path.resolve(codeDir, 'Images'))
          ? path.resolve(codeDir, 'Images')
          : path.resolve(rootDir, 'Images'))));

if (!fs.existsSync(IMAGES_DIR)) {
  try { fs.mkdirSync(IMAGES_DIR, { recursive: true }); } catch (e) {}
}

// Persistent Data Directory (Inside backend/data, or /tmp on Vercel)
export const DATA_DIR = process.env.VERCEL ? '/tmp/data' : path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
}

export const BOARDS_CONFIG_FILE = fs.existsSync(path.join(__dirname, 'boards.json'))
  ? path.join(__dirname, 'boards.json')
  : path.join(rootDir, 'boards.json');
export const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
export const SLOT_HISTORY_FILE = path.join(DATA_DIR, 'slot_history.json');
export const EXCEL_FILE = path.join(DATA_DIR, 'pinterest_uploads.xlsx');
export const CSV_FILE = path.join(DATA_DIR, 'pinterest_uploads.csv');

// Centralized Character Limits for Pinterest Metadata
export const LIMITS = {
  TITLE_MAX_LENGTH: 100,
  DESCRIPTION_MAX_LENGTH: 500,
  TAGS_MAX_LENGTH: 500,
  ALT_TEXT_MAX_LENGTH: 500,
  MAX_RETRIES_PER_IMAGE: 10
};

// Google Spreadsheet Configuration
export const GOOGLE_SPREADSHEET_CONFIG = {
  spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID || '',
  sheetName: process.env.GOOGLE_SHEET_NAME || 'Finmunt',
  serviceAccountKeyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || (fs.existsSync(path.join(rootDir, 'google_service_account.json')) ? path.join(rootDir, 'google_service_account.json') : path.join(__dirname, 'google_service_account.json')),
  webhookUrl: process.env.GOOGLE_SHEET_WEBHOOK_URL || ''
};


/**
 * Load the 5 configured Pinterest boards
 */
export function getBoardsConfig() {
  try {
    if (fs.existsSync(BOARDS_CONFIG_FILE)) {
      const raw = fs.readFileSync(BOARDS_CONFIG_FILE, 'utf8');
      const boards = JSON.parse(raw);
      if (Array.isArray(boards) && boards.length === 5) {
        return boards;
      }
    }
  } catch (err) {
    console.error('Error loading boards.json:', err.message);
  }

  // Exactly 5 boards
  return [
    {
      id: "1152640167071860781",
      name: "Make Money",
      topic: "Make Money",
      url: "https://www.pinterest.com/Finmunt/make-money/",
      instructions: "Side hustles, online income, freelancing, earning extra cash, passive income streams, work from home jobs, monetization, digital marketing, ecommerce."
    },
    {
      id: "1152640167071860782",
      name: "Save Money",
      topic: "Save Money",
      url: "https://www.pinterest.com/Finmunt/save-money/",
      instructions: "Money-saving hacks, frugal living tips, cutting expenses, grocery budgeting, frugal lifestyle, emergency funds, deals and discount strategies."
    },
    {
      id: "1152640167071860784",
      name: "Budgeting",
      topic: "Budgeting",
      url: "https://www.pinterest.com/Finmunt/budgeting/",
      instructions: "Budget planners, monthly budget systems (50/30/20 rule, zero-based budget, cash envelopes), expense tracking, family and personal financial planning."
    },
    {
      id: "1152640167071860785",
      name: "Investing",
      topic: "Investing",
      url: "https://www.pinterest.com/Finmunt/investing/",
      instructions: "Stock market basics, index funds, ETFs, dividend investing, real estate, compound interest, retirement accounts (401k, Roth IRA), long-term wealth building."
    },
    {
      id: "1152640167071860786",
      name: "Debt & Credit",
      topic: "Debt & Credit",
      url: "https://www.pinterest.com/Finmunt/debt-credit/",
      instructions: "Credit score improvement hacks, debt payoff strategies (debt snowball and avalanche), credit card management, loans, achieving debt freedom."
    }
  ];
}

/**
 * Get 5 publishing time slots (24h format HH:mm)
 */
export function getPublishSlots() {
  const envSlots = process.env.PUBLISH_SLOTS || '17:30,19:30,21:30,23:30,01:30';
  return envSlots.split(',').map(s => s.trim()).filter(Boolean).slice(0, 5);
}


/**
 * Save updated key-values into .env file and in-memory CONFIG
 */
export function saveEnvConfig(updates = {}) {
  const envPath = [
    path.join(codeDir, '.env'),
    path.join(rootDir, '.env'),
    path.join(__dirname, '.env')
  ].find(p => fs.existsSync(p)) || path.join(codeDir, '.env');
  let content = '';
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf8');
  }

  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }
  }

  fs.writeFileSync(envPath, content.trim() + '\n', 'utf8');

  // Update in-memory CONFIG
  if (updates.PINTEREST_ACCESS_TOKEN !== undefined) {
    CONFIG.pinterestAccessToken = updates.PINTEREST_ACCESS_TOKEN;
  }
  if (updates.PINTEREST_APP_ID !== undefined) {
    CONFIG.pinterestAppId = updates.PINTEREST_APP_ID;
  }
  if (updates.PINTEREST_APP_SECRET !== undefined) {
    CONFIG.pinterestAppSecret = updates.PINTEREST_APP_SECRET;
  }
}

/**
 * Runtime configuration
 */
export const CONFIG = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '127.0.0.1',
  pinterestAppId: process.env.PINTEREST_APP_ID || '',
  pinterestAppSecret: process.env.PINTEREST_APP_SECRET || '',
  pinterestAccessToken: process.env.PINTEREST_ACCESS_TOKEN || '',
  pinterestRefreshToken: process.env.PINTEREST_REFRESH_TOKEN || '',
  pinterestUseSandbox: process.env.PINTEREST_USE_SANDBOX === 'true',

  ollamaHost: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'qwen2.5vl:3b',
  deleteAfterUpload: process.env.DELETE_AFTER_UPLOAD !== 'false'
};

