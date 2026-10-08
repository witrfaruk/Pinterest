import fs from 'node:fs/promises';
import { CONFIG } from '../config.js';

export class OllamaVisionService {
  /**
   * Send multimodal prompt with base64 image to local Ollama (qwen2.5vl:3b)
   */
  static async generateVisionResponse({ imagePath, prompt, formatJson = true }) {
    const host = CONFIG.ollamaHost.replace(/\/+$/, '');
    const model = CONFIG.ollamaModel;

    const imageBuffer = await fs.readFile(imagePath);
    const base64Image = imageBuffer.toString('base64');

    const payload = {
      model,
      prompt,
      images: [base64Image],
      stream: false,
      options: {
        temperature: 0.5
      }
    };

    if (formatJson) {
      payload.format = 'json';
    }

    const response = await fetch(`${host}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120000)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return data.response || '';
  }
}
