import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { CONFIG, EXCEL_FILE, CSV_FILE, IMAGES_DIR, getPublishSlots, saveEnvConfig } from './config.js';
import { ImageScanner } from './services/imageScanner.js';
import { publisherEngine } from './services/publisherEngine.js';
import { scheduler } from './services/scheduler.js';
import { uploadHistory } from './services/uploadHistory.js';
import { ActivityLogService } from './services/activityLogService.js';
import { SpreadsheetLogger } from './services/spreadsheetLogger.js';
import { PinterestApiService } from './services/pinterestApiService.js';
import { autoQueueProcessor } from './services/autoQueueProcessor.js';
import { SupabaseSyncService } from './services/supabaseSyncService.js';

import crypto from 'node:crypto';
import multer from 'multer';
import { BoardClassifier } from './services/boardClassifier.js';
import { MetadataGenerator } from './services/metadataGenerator.js';
import { AiVerifier } from './services/aiVerifier.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadsDir = process.env.VERCEL ? '/tmp/uploads' : path.join(__dirname, 'data', 'temp_uploads');
if (!fs.existsSync(uploadsDir)) {
  try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch (e) {}
}

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 30 * 1024 * 1024 } // 30MB max
});

// Authentication Helpers
export function generateAuthToken() {
  const secret = process.env.DASHBOARD_PASSWORD || 'change_me_to_your_secure_password';
  const timestamp = Date.now();
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}:${secret}`).digest('hex');
  return `${timestamp}.${signature}`;
}

export function verifyAuthToken(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [timestampStr, signature] = parts;
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) return false;

  const secret = process.env.DASHBOARD_PASSWORD || 'change_me_to_your_secure_password';
  const expectedSignature = crypto.createHmac('sha256', secret).update(`${timestamp}:${secret}`).digest('hex');
  return signature === expectedSignature;
}

export function requireAuth(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (verifyAuthToken(token)) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized: Valid dashboard authentication token required' });
}

const app = express();
app.use(cors());
app.use(express.json());

// Local preview for GitHub Pages site
const githubDir = path.resolve(__dirname, '../../github');
if (fs.existsSync(githubDir)) {
  app.use('/landing', express.static(githubDir));
  app.get('/landing', (req, res) => {
    res.sendFile(path.join(githubDir, 'index.html'));
  });
}

app.get('/', (req, res) => {
  res.json({
    name: 'Pinterest Autonomous Publishing Engine',
    status: 'online',
    mode: 'headless',
    storage: 'Supabase Cloud',
    publishSlots: getPublishSlots(),
    sourceImagesDir: IMAGES_DIR
  });
});

// Server-Sent Events (SSE) clients
const sseClients = new Set();

function broadcastSSE(eventType, data) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}

publisherEngine.on('log', logEntry => broadcastSSE('log', logEntry));
publisherEngine.on('published', async record => {
  broadcastSSE('published', record);
  try {
    const act = await ActivityLogService.getSevenDayActivity();
    broadcastSSE('activity_update', act);
  } catch (e) {}
});

autoQueueProcessor.on('log', logEntry => broadcastSSE('log', logEntry));
autoQueueProcessor.on('queued', async queuedItem => {
  broadcastSSE('queued', queuedItem);
  try {
    const act = await ActivityLogService.getSevenDayActivity();
    broadcastSSE('activity_update', act);
  } catch (e) {}
});


/**
 * SSE endpoint for live updates
 */
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  sseClients.add(res);
  res.write(`event: init\ndata: ${JSON.stringify({ ready: true })}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

/**
 * Pinterest OAuth: Start Authorization Flow
 */
app.get('/auth/pinterest', (req, res) => {
  const redirectUri = `${req.protocol}://${req.get('host')}/auth/callback`;
  const scopes = 'boards:read,boards:write,pins:read,pins:write,user_accounts:read';
  const appId = CONFIG.pinterestAppId || '1545895';
  const authUrl = `https://www.pinterest.com/oauth/?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}`;
  res.redirect(authUrl);
});

/**
 * Pinterest OAuth: Callback Handler
 */
app.get('/auth/callback', async (req, res) => {
  const { code, error, error_description } = req.query;
  if (error) {
    return res.redirect(`/?auth_error=${encodeURIComponent(error_description || error)}`);
  }
  if (!code) {
    return res.redirect('/?auth_error=No+authorization+code+received');
  }

  try {
    const redirectUri = `${req.protocol}://${req.get('host')}/auth/callback`;
    const data = await PinterestApiService.exchangeOAuthCode(code, redirectUri);
    
    if (data.access_token) {
      saveEnvConfig({
        PINTEREST_ACCESS_TOKEN: data.access_token,
        PINTEREST_REFRESH_TOKEN: data.refresh_token || ''
      });
      return res.redirect('/?auth_success=1');
    } else {
      return res.redirect(`/?auth_error=${encodeURIComponent(data.message || 'Token exchange failed')}`);
    }
  } catch (err) {
    console.error('OAuth Callback Error:', err.message);
    return res.redirect(`/?auth_error=${encodeURIComponent(err.message)}`);
  }
});

/**
 * Pinterest Status & Auth Check
 */
app.get('/api/pinterest/status', requireAuth, async (req, res) => {
  try {
    const authStatus = await PinterestApiService.checkAuth();
    res.json({
      hasToken: Boolean(CONFIG.pinterestAccessToken),
      appId: CONFIG.pinterestAppId,
      ...authStatus
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Save Pinterest Token or App Credentials via API
 */
app.post('/api/settings/token', requireAuth, async (req, res) => {
  try {
    const { token, appId, appSecret } = req.body;
    const updates = {};
    if (token !== undefined) updates.PINTEREST_ACCESS_TOKEN = token.trim();
    if (appId !== undefined) updates.PINTEREST_APP_ID = appId.trim();
    if (appSecret !== undefined) updates.PINTEREST_APP_SECRET = appSecret.trim();

    saveEnvConfig(updates);
    const authStatus = await PinterestApiService.checkAuth();
    res.json({ success: true, ...authStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Disconnect Pinterest Account
 */
app.post('/api/pinterest/disconnect', requireAuth, async (req, res) => {
  try {
    saveEnvConfig({
      PINTEREST_ACCESS_TOKEN: '',
      PINTEREST_REFRESH_TOKEN: ''
    });
    res.json({ success: true, message: 'Pinterest account disconnected.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/**
 * Main Activity Log Endpoint (Rolling 7 Calendar Days)
 */
app.get('/api/activity', requireAuth, async (req, res) => {
  try {
    const scan = await ImageScanner.scanPendingImages();
    const activity = await ActivityLogService.getSevenDayActivity();
    const nextSlot = scheduler.getNextSlotInfo();

    res.json({
      success: true,
      imagesDir: IMAGES_DIR,
      waitingImagesCount: scan.waitingCount,
      publishSlots: getPublishSlots(),
      nextSlot,
      isBusy: publisherEngine.isBusy,
      activity
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Manual trigger for testing / next publishing slot
 */
app.post('/api/publish/trigger', requireAuth, async (req, res) => {
  try {
    if (publisherEngine.isBusy) {
      return res.status(409).json({ error: 'Publishing engine is currently busy.' });
    }

    publisherEngine.processPublishSlot().then(async result => {
      try {
        const act = await ActivityLogService.getSevenDayActivity();
        broadcastSSE('activity_update', act);
      } catch (e) {}
    }).catch(err => {
      console.error('Trigger execution error:', err.message);
    });

    res.json({ success: true, message: 'Publishing slot process started' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Download spreadsheet (.xlsx or .csv)
 */
app.get('/api/spreadsheet/download', async (req, res) => {
  try {
    const format = (req.query.format || 'xlsx').toLowerCase();
    await SpreadsheetLogger.updateExcel(uploadHistory.getAll());

    if (format === 'csv') {
      SpreadsheetLogger.initCSV();
      if (!fs.existsSync(CSV_FILE)) {
        return res.status(404).send('CSV log not found');
      }
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="pinterest_uploads.csv"');
      return fs.createReadStream(CSV_FILE).pipe(res);
    } else {
      if (!fs.existsSync(EXCEL_FILE)) {
        return res.status(404).send('Excel log not found');
      }
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="pinterest_uploads.xlsx"');
      return fs.createReadStream(EXCEL_FILE).pipe(res);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Supabase Queue Status Endpoint
 */
app.get('/api/supabase/queue', requireAuth, async (req, res) => {
  try {
    const queueStatus = await SupabaseSyncService.getQueueStatus();
    res.json({
      success: true,
      ...queueStatus
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Send a Test Low-Queue Email Alert
 */
app.post('/api/email/test', requireAuth, async (req, res) => {
  try {
    const result = await EmailAlertService.checkAndSendLowQueueAlert(5, 10);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Access Control Authentication Verify
 */
app.post('/api/auth/verify', (req, res) => {
  try {
    const { password } = req.body;
    const correctPassword = process.env.DASHBOARD_PASSWORD || 'change_me_to_your_secure_password';
    if (password === correctPassword) {
      const token = generateAuthToken();
      return res.json({ success: true, token, message: 'Authentication successful' });
    }
    return res.status(401).json({ success: false, error: 'Incorrect password' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * AI Pre-Analyze Uploaded Image (from phone/browser)
 */
app.post('/api/analyze/image', requireAuth, upload.single('image'), async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'No image file uploaded' });
  }

  try {
    const selectedBoard = await BoardClassifier.selectBestBoard(file.path);
    const generatedMetadata = await MetadataGenerator.generateMetadata({
      imagePath: file.path,
      boardName: selectedBoard.boardName,
      topic: selectedBoard.topic
    });

    const verification = await AiVerifier.verifyAndCorrect({
      imagePath: file.path,
      initialMetadata: generatedMetadata,
      selectedBoard
    });

    const finalMeta = verification.metadata;

    res.json({
      success: true,
      boardId: selectedBoard.boardId,
      boardName: selectedBoard.boardName,
      title: finalMeta.title,
      description: finalMeta.description,
      altText: finalMeta.altText,
      tags: finalMeta.tags
    });
  } catch (err) {
    res.status(500).json({ error: `AI analysis failed: ${err.message}` });
  } finally {
    fs.promises.unlink(file.path).catch(() => {});
  }
});

/**
 * Upload Pin to Cloud Queue (from phone or browser)
 */
app.post('/api/upload/pin', requireAuth, upload.single('image'), async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'No image file uploaded' });
  }

  try {
    const originalName = file.originalname || 'upload.png';
    let { title, description, altText, boardId, boardName, tags, autoAnalyze } = req.body;

    if (autoAnalyze === 'true' || !title || !boardId) {
      const selectedBoard = await BoardClassifier.selectBestBoard(file.path);
      const generatedMetadata = await MetadataGenerator.generateMetadata({
        imagePath: file.path,
        boardName: selectedBoard.boardName,
        topic: selectedBoard.topic
      });

      const verification = await AiVerifier.verifyAndCorrect({
        imagePath: file.path,
        initialMetadata: generatedMetadata,
        selectedBoard
      });

      const finalMeta = verification.metadata;
      title = finalMeta.title;
      description = finalMeta.description;
      altText = finalMeta.altText;
      tags = finalMeta.tags;
      boardId = selectedBoard.boardId;
      boardName = selectedBoard.boardName;
    }

    // 1. Upload to Supabase Storage
    const { storagePath, publicUrl } = await SupabaseSyncService.uploadImage(file.path, originalName);

    // 2. Insert into Supabase pin_queue table
    const queuedPin = await SupabaseSyncService.enqueuePin({
      filename: originalName,
      storagePath,
      imageUrl: publicUrl,
      title: title.slice(0, 100),
      description: description.slice(0, 500),
      altText: altText ? altText.slice(0, 500) : '',
      tags: tags || '',
      boardId,
      boardName: boardName || 'General'
    });

    broadcastSSE('queued', queuedPin);
    try {
      const act = await ActivityLogService.getSevenDayActivity();
      broadcastSSE('activity_update', act);
    } catch (e) {}

    res.json({
      success: true,
      message: 'Pin successfully queued in Supabase Cloud',
      pin: queuedPin
    });
  } catch (err) {
    console.error('Upload Pin error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    fs.promises.unlink(file.path).catch(() => {});
  }
});

// Startup check & spreadsheet initialization
SpreadsheetLogger.updateExcel(uploadHistory.getAll()).catch(() => {});

// Only start background folder watcher and express listener in non-Vercel environment
if (!process.env.VERCEL) {
  // Start background auto-queue processor watcher (Ollama -> Supabase -> Auto delete)
  autoQueueProcessor.startWatcher(5000);

  app.listen(CONFIG.port, CONFIG.host, () => {
    console.log(`\n================================================================`);
    console.log(`  Pinterest Publisher Machine (Ollama + Supabase Cloud Engine)`);
    console.log(`  Source Images:  ${IMAGES_DIR}`);
    console.log(`  Ollama Model:   ${CONFIG.ollamaModel}`);
    console.log(`  Publish Slots:  ${getPublishSlots().join(', ')}`);
    console.log(`  Supabase Cloud: ${process.env.SUPABASE_URL || 'Configured'}`);
    console.log(`  Server:         http://${CONFIG.host}:${CONFIG.port}`);
    console.log(`================================================================\n`);
  });
}

export default app;

