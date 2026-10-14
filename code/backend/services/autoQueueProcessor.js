import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';

import { IMAGES_DIR, getBoardsConfig } from '../config.js';
import { ImageScanner } from './imageScanner.js';
import { OllamaVisionService } from './ollamaVisionService.js';
import { BoardClassifier } from './boardClassifier.js';
import { MetadataGenerator } from './metadataGenerator.js';
import { AiVerifier } from './aiVerifier.js';
import { SupabaseSyncService } from './supabaseSyncService.js';
import { EmailAlertService } from './emailAlertService.js';

class AutoQueueProcessor extends EventEmitter {
  constructor() {
    super();
    this.isProcessing = false;
    this.watchInterval = null;
    this.queueMonitorInterval = null;
  }

  startWatcher(intervalMs = 10000) {
    if (this.watchInterval) clearInterval(this.watchInterval);
    this.watchInterval = setInterval(() => this.checkAndProcessNewImages(), intervalMs);
    console.log(`[AutoQueue] Background folder watcher started (Polling ${intervalMs / 1000}s)...`);

    // Also start proactive queue monitor (checks Supabase queue every 60s for <= 5 pins)
    this.startQueueMonitor(60000);
  }

  startQueueMonitor(intervalMs = 60000) {
    if (this.queueMonitorInterval) clearInterval(this.queueMonitorInterval);
    
    // Immediate initial check
    this.checkQueueAndAlert();
    this.queueMonitorInterval = setInterval(() => this.checkQueueAndAlert(), intervalMs);
    console.log(`[AutoQueue] Proactive Supabase queue monitor started (Checking every ${intervalMs / 1000}s)...`);
  }

  async checkQueueAndAlert() {
    try {
      const status = await SupabaseSyncService.getQueueStatus();
      if (status && typeof status.count === 'number') {
        await EmailAlertService.checkAndSendLowQueueAlert(status.count);
      }
    } catch (err) {
      // Ignore network blips during background check
    }
  }

  async checkAndProcessNewImages() {
    if (this.isProcessing) return;

    try {
      const scan = await ImageScanner.scanPendingImages();
      if (!scan.success || !scan.pending || scan.pending.length === 0) return;

      this.isProcessing = true;
      const targetImage = scan.pending[0];
      const imagePath = targetImage.fullPath || targetImage.path;

      this.emit('log', {
        type: 'info',
        step: 1,
        message: `[AutoQueue] New image detected: "${targetImage.filename}". Starting local Ollama pre-processing...`
      });

      console.log(`\n[AutoQueue] Processing "${targetImage.filename}" for Supabase Cloud Queue...`);

      // 1. Board Classification
      const selectedBoard = await BoardClassifier.selectBestBoard(imagePath);

      // 2. Multimodal Vision Analysis & Metadata Generation
      const generatedMetadata = await MetadataGenerator.generateMetadata({
        imagePath,
        boardName: selectedBoard.boardName,
        topic: selectedBoard.topic
      });

      // 3. AI Verification Loop (Step 9)
      const verification = await AiVerifier.verifyAndCorrect({
        imagePath,
        initialMetadata: generatedMetadata,
        selectedBoard
      });

      const finalMeta = verification.metadata;

      // 4. Upload to Supabase Storage (Strip all AI metadata & EXIF first)
      this.emit('log', {
        type: 'info',
        step: 4,
        message: `[AutoQueue] Stripping AI/EXIF metadata and uploading "${targetImage.filename}" to Supabase Storage...`
      });

      const { storagePath, publicUrl } = await SupabaseSyncService.uploadImage(imagePath, targetImage.filename);

      // 5. Insert into Supabase pin_queue table
      const queuedPin = await SupabaseSyncService.enqueuePin({
        filename: targetImage.filename,
        storagePath,
        imageUrl: publicUrl,
        title: finalMeta.title,
        description: finalMeta.description,
        altText: finalMeta.altText,
        tags: finalMeta.tags,
        boardId: selectedBoard.boardId,
        boardName: selectedBoard.boardName
      });

      // 6. Delete local file from Images/
      try {
        await fs.unlink(imagePath);
      } catch (e) {
        // file already unlinked or locked by sync
      }
      console.log(`[AutoQueue] ✓ "${targetImage.filename}" pushed to Supabase and deleted locally.`);

      this.emit('log', {
        type: 'success',
        step: 6,
        message: `[AutoQueue] ✓ "${targetImage.filename}" safely queued in Supabase (Ready for 24/7 cloud publish). Local file deleted.`
      });

      this.emit('queued', queuedPin);

    } catch (err) {
      console.error('[AutoQueue] Error processing image:', err.message);
      this.emit('log', {
        type: 'error',
        message: `[AutoQueue] Error processing image: ${err.message}`
      });
    } finally {
      this.isProcessing = false;
    }
  }
}

export const autoQueueProcessor = new AutoQueueProcessor();
