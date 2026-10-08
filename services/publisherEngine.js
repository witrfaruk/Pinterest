import fs from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { LIMITS, CONFIG } from '../config.js';
import { ImageScanner } from './imageScanner.js';
import { BoardClassifier } from './boardClassifier.js';
import { MetadataGenerator } from './metadataGenerator.js';
import { AiVerifier } from './aiVerifier.js';
import { PinterestApiService } from './pinterestApiService.js';
import { uploadHistory } from './uploadHistory.js';
import { SpreadsheetLogger } from './spreadsheetLogger.js';

class PublisherEngine extends EventEmitter {
  constructor() {
    super();
    this.isBusy = false;
  }

  log(msg, type = 'info') {
    const entry = {
      timestamp: new Date().toLocaleTimeString(),
      date: new Date().toISOString().split('T')[0],
      message: msg,
      type
    };
    console.log(`[${entry.timestamp}] [${type.toUpperCase()}] ${msg}`);
    this.emit('log', entry);
  }

  /**
   * Execute the exact 12-step pipeline for a publishing slot with up to 10 retry attempts
   */
  async processPublishSlot(slotIndex = null, slotTime = null) {
    if (this.isBusy) {
      throw new Error('Publisher engine is currently busy executing another pipeline.');
    }

    const todayDate = new Date().toISOString().split('T')[0];
    this.isBusy = true;

    try {
      // STEP 1: Start the publishing process
      this.log(`[STEP 1] Starting publishing process (Slot: ${slotTime || 'Manual Trigger'})...`, 'info');

      // STEP 2: Fetch next unprocessed image
      const nextImage = await ImageScanner.getNextPendingImage();
      if (!nextImage) {
        this.log(`[STEP 2] No images available in Images folder. Slot marked as SKIPPED.`, 'warning');
        if (slotIndex !== null) {
          uploadHistory.recordSlotExecution(todayDate, slotIndex, slotTime, {
            status: 'SKIPPED',
            error: 'No images available in Images folder'
          });
        }
        return { success: false, status: 'SKIPPED', reason: 'No images available' };
      }

      const { fullPath, filename } = nextImage;
      this.log(`[STEP 2] Fetched image: "${filename}".`, 'info');

      // Deduplication check
      const fileBuffer = await fs.readFile(fullPath);
      const fileHash = uploadHistory.calculateHash(fileBuffer);
      if (uploadHistory.isAlreadyUploaded(filename, fileHash)) {
        this.log(`Image "${filename}" has already been published. Skipping.`, 'warning');
        return { success: false, status: 'SKIPPED', reason: 'Already uploaded' };
      }

      // Execute with STEP 12 Failure Retry System (Maximum 10 attempts)
      let attempt = 0;
      let lastError = null;
      let uploadSuccess = false;
      let pinResult = null;
      let finalRecord = null;

      while (attempt < LIMITS.MAX_RETRIES_PER_IMAGE && !uploadSuccess) {
        attempt++;
        this.log(`--- Publishing Attempt ${attempt} / ${LIMITS.MAX_RETRIES_PER_IMAGE} for "${filename}" ---`, 'info');

        try {
          // STEP 8: Board Analysis & Selection from the 5 configured boards
          this.log(`[STEP 8] Analyzing all 5 configured Pinterest boards for "${filename}"...`, 'info');
          const selectedBoard = await BoardClassifier.selectBestBoard(fullPath);
          this.log(`[STEP 8] Selected Board: "${selectedBoard.boardName}" (${selectedBoard.boardId}). Reason: ${selectedBoard.reason}`, 'info');

          // STEP 3-7: Ollama analyzes image & generates Title, Description, Tags, Alt Text
          this.log(`[STEPS 3-7] Ollama vision analyzing image & generating Title, Description, Tags, and Alt Text...`, 'info');
          let metadata = await MetadataGenerator.generateMetadata({
            imagePath: fullPath,
            boardName: selectedBoard.boardName,
            topic: selectedBoard.topic
          });
          this.log(`[STEPS 4-7] Generated Title: "${metadata.title}" (${metadata.title.length} chars)`, 'info');

          // STEP 9: AI Verification & Correction Loop
          this.log(`[STEP 9] Sending to separate AI Verifier (image + metadata + board)...`, 'info');
          const verification = await AiVerifier.verifyAndCorrect({
            imagePath: fullPath,
            initialMetadata: metadata,
            selectedBoard
          });

          if (!verification.verified) {
            throw new Error(`AI Verification failed: ${verification.notes}`);
          }

          metadata = verification.metadata;
          this.log(`[STEP 9] AI Verification PASSED. Verified Title: "${metadata.title}"`, 'success');

          // STEP 10: Pinterest Upload
          this.log(`[STEP 10] Uploading to Pinterest API board ID: ${selectedBoard.boardId}...`, 'info');
          pinResult = await PinterestApiService.createPin({
            boardId: selectedBoard.boardId,
            title: metadata.title,
            description: metadata.description,
            altText: metadata.altText,
            imagePath: fullPath
          });

          if (!pinResult || !pinResult.pinId) {
            throw new Error('Pinterest API did not return a valid Pin ID.');
          }

          this.log(`[STEP 11] Pinterest confirmed successful Pin creation! Pin ID: ${pinResult.pinId} (${pinResult.pinUrl})`, 'success');

          // STEP 11: Save Record in History
          finalRecord = uploadHistory.recordUpload({
            filename,
            postName: filename,
            filePath: fullPath,
            fileHash,
            tries: attempt,
            boardId: selectedBoard.boardId,
            boardName: selectedBoard.boardName,
            pinId: pinResult.pinId,
            pinUrl: pinResult.pinUrl,
            title: metadata.title,
            description: metadata.description,
            tags: metadata.tags,
            altText: metadata.altText,
            status: 'SUCCESS'
          });

          // Record slot execution
          if (slotIndex !== null) {
            uploadHistory.recordSlotExecution(todayDate, slotIndex, slotTime, {
              status: 'COMPLETED',
              filename,
              boardName: selectedBoard.boardName,
              pinId: pinResult.pinId
            });
          }

          // Save to Spreadsheet (.xlsx and .csv)
          await SpreadsheetLogger.recordUpload(finalRecord, uploadHistory.getAll());
          this.log(`[STEP 11] Recorded in spreadsheet (pinterest_uploads.xlsx / .csv)`, 'info');

          // STEP 11: Delete original local image ONLY after confirmed upload
          if (CONFIG.deleteAfterUpload) {
            try {
              await fs.unlink(fullPath);
              this.log(`[STEP 11] Successfully deleted local image: ${filename}`, 'info');
            } catch (delErr) {
              this.log(`Warning: Failed to delete local image: ${delErr.message}`, 'warning');
            }
          }

          uploadSuccess = true;
          this.emit('published', finalRecord);
          break;

        } catch (attemptErr) {
          lastError = attemptErr;
          this.log(`[STEP 12] Attempt ${attempt} failed: ${attemptErr.message}`, 'warning');
          
          if (attempt < LIMITS.MAX_RETRIES_PER_IMAGE) {
            this.log(`[STEP 12] Retrying (${attempt + 1}/${LIMITS.MAX_RETRIES_PER_IMAGE}) after 3s delay...`, 'info');
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        }
      }

      // If all 10 attempts fail
      if (!uploadSuccess) {
        this.log(`[STEP 12] All ${LIMITS.MAX_RETRIES_PER_IMAGE} attempts failed for "${filename}". Image kept intact.`, 'error');
        
        if (slotIndex !== null) {
          uploadHistory.recordSlotExecution(todayDate, slotIndex, slotTime, {
            status: 'FAILED',
            filename,
            error: lastError ? lastError.message : 'Exceeded 10 retry attempts'
          });
        }

        return {
          success: false,
          status: 'FAILED',
          filename,
          error: lastError ? lastError.message : 'Exceeded 10 retry attempts'
        };
      }

      return {
        success: true,
        status: 'COMPLETED',
        record: finalRecord
      };

    } finally {
      this.isBusy = false;
    }
  }
}

export const publisherEngine = new PublisherEngine();
