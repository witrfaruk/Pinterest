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

class AutoQueueProcessor extends EventEmitter {
  constructor() {
    super();
    this.isProcessing = false;
    this.watchInterval = null;
  }

  startWatcher(intervalMs = 10000) {
    if (this.watchInterval) clearInterval(this.watchInterval);
    this.watchInterval = setInterval(() => this.checkAndProcessNewImages(), intervalMs);
    console.log(`[AutoQueue] Background folder watcher started (Polling ${intervalMs / 1000}s)...`);
  }

  async checkAndProcessNewImages() {
    if (this.isProcessing) return;

    try {
      const scan = await ImageScanner.scanPendingImages();
      if (!scan.hasImages || scan.waitingCount === 0) return;

      this.isProcessing = true;
      const targetImage = scan.nextImage;

      this.emit('log', {
        type: 'info',
        step: 1,
        message: `[AutoQueue] New image detected: "${targetImage.filename}". Starting local Ollama pre-processing...`
      });

      console.log(`\n[AutoQueue] Processing "${targetImage.filename}" for Supabase Cloud Queue...`);

      // 1. Board Classification
      const boards = getBoardsConfig();
      const boardClassification = await BoardClassifier.classifyImage(targetImage.path, boards);

      // 2. Multimodal Vision Analysis & Metadata Generation
      const generatedMetadata = await MetadataGenerator.generateMetadata(targetImage.path, boardClassification.board);

      // 3. AI Verification Loop (Step 9)
      const verified = await AiVerifier.verifyAndCorrect({
        imagePath: targetImage.path,
        metadata: generatedMetadata,
        selectedBoard: boardClassification.board
      });

      // 4. Upload to Supabase Storage
      this.emit('log', {
        type: 'info',
        step: 4,
        message: `[AutoQueue] Uploading "${targetImage.filename}" to Supabase Storage...`
      });

      const { storagePath, publicUrl } = await SupabaseSyncService.uploadImage(targetImage.path, targetImage.filename);

      // 5. Insert into Supabase pin_queue table
      const queuedPin = await SupabaseSyncService.enqueuePin({
        filename: targetImage.filename,
        storagePath,
        imageUrl: publicUrl,
        title: verified.title,
        description: verified.description,
        altText: verified.altText,
        tags: verified.tags,
        boardId: boardClassification.board.id,
        boardName: boardClassification.board.name
      });

      // 6. Delete local file from Images/
      await fs.unlink(targetImage.path);
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
