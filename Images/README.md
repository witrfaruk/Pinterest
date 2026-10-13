# 📸 Pin Images Drop Folder

Drop your pin images (`.png`, `.jpg`, `.jpeg`, `.webp`) directly into this directory.

---

### ⚡ Autonomous Processing Pipeline

1. **Auto-Detection**: The local watcher scans this folder every 5 seconds.
2. **Metadata Scrubbing**: All AI generator tags, EXIF, IPTC, camera, and GPS metadata are stripped cleanly via Sharp.
3. **AI Vision Analysis**: Ollama Vision models analyze the image contents to generate engaging titles, descriptions, and hashtags.
4. **Cloud Queue**: The prepared pin and optimized image are uploaded to Supabase Storage & `pin_queue`.
5. **Auto-Cleanup**: Once successfully queued in the cloud, the local image file is automatically cleaned from this folder to save disk space.
6. **Scheduled Publishing**: Supabase pg_cron publishes each pin at your designated time slots (17:30, 19:30, 21:30, 23:30, 01:30 IST) 24/7 without needing your PC on.
