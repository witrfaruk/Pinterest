import fs from 'node:fs/promises';

export class OllamaService {
  /**
   * Get list of available local Ollama models
   */
  static async listModels(host = 'http://127.0.0.1:11434') {
    try {
      const normalizedHost = host.replace(/\/+$/, '');
      const response = await fetch(`${normalizedHost}/api/tags`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(4000)
      });

      if (!response.ok) {
        throw new Error(`Ollama returned status ${response.status}`);
      }

      const data = await response.json();
      const models = (data.models || []).map(m => ({
        name: m.name,
        size: m.size,
        modified_at: m.modified_at,
        isVision: /vision|llava|bakllava|moondream/i.test(m.name)
      }));

      return { success: true, models, host: normalizedHost };
    } catch (err) {
      return {
        success: false,
        error: `Could not connect to Ollama at ${host}: ${err.message}`,
        models: []
      };
    }
  }

  /**
   * Clamp string to max characters, trimming cleanly at word boundaries if possible
   */
  static clampText(text, maxLen) {
    if (!text || typeof text !== 'string') return '';
    const clean = text.trim().replace(/\s+/g, ' ');
    if (clean.length <= maxLen) return clean;
    
    // Trim back to nearest space
    const truncated = clean.slice(0, maxLen);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLen * 0.7) {
      return truncated.slice(0, lastSpace).trim();
    }
    return truncated.trim();
  }

  /**
   * Parse Ollama response and extract structured metadata
   */
  static parseMetadataResponse(rawText) {
    let parsed = null;

    // Remove markdown code fences if present (```json ... ``` or ``` ...)
    const cleaned = rawText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      // If direct JSON parse fails, try extracting first JSON object from text
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch (innerErr) {
          // JSON parsing failed
        }
      }
    }

    if (!parsed) {
      // Fallback: extract title, description, tags from lines
      const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
      let title = lines[0] || 'Inspiring Visual Idea';
      let description = lines.slice(1).join(' ') || 'Beautiful inspiration and ideas for your home and lifestyle.';
      
      return {
        title: this.clampText(title, 100),
        description: this.clampText(description, 500),
        tags: ['#inspiration', '#aesthetic', '#ideas'],
        alt_text: this.clampText(title, 500)
      };
    }

    // Extract fields
    let title = (parsed.title || parsed.pin_title || '').trim();
    let description = (parsed.description || parsed.pin_description || '').trim();
    let altText = (parsed.alt_text || parsed.altText || parsed.alt || '').trim();
    let tags = [];

    if (Array.isArray(parsed.tags)) {
      tags = parsed.tags.map(t => (t.startsWith('#') ? t : `#${t}`.replace(/\s+/g, '')));
    } else if (typeof parsed.tags === 'string') {
      tags = parsed.tags.split(/[\s,]+/).map(t => (t.startsWith('#') ? t : `#${t}`));
    }

    if (!title) {
      title = 'Inspiring Creative Idea';
    }

    // If description does not include tags and tags exist, append a few tags up to 500 limit
    if (tags.length > 0 && !description.includes('#')) {
      const tagString = ' ' + tags.slice(0, 5).join(' ');
      if (description.length + tagString.length <= 500) {
        description = `${description}${tagString}`;
      }
    }

    if (!altText) {
      altText = `Visual showing ${title.toLowerCase()}`;
    }

    // Strictly enforce Pinterest Limits:
    // Title: Max 100 chars
    // Description: Max 500 chars
    // Alt Text: Max 500 chars
    return {
      title: this.clampText(title, 100),
      description: this.clampText(description, 500),
      tags: tags.slice(0, 10),
      alt_text: this.clampText(altText, 500)
    };
  }

  /**
   * Analyze image using local Ollama model and generate Pinterest metadata
   */
  static async generatePinterestMetadata({
    imagePath,
    host = 'http://127.0.0.1:11434',
    model = 'llama3.2-vision'
  }) {
    const normalizedHost = host.replace(/\/+$/, '');

    // Read image file into base64
    const imageBuffer = await fs.readFile(imagePath);
    const base64Image = imageBuffer.toString('base64');

    const prompt = `You are an expert Pinterest SEO and copywriting assistant.
Analyze this image carefully. Generate high-engagement, click-worthy, SEO-optimized Pinterest metadata.

Pinterest strict constraints:
1. Title: Catchy, keyword-rich, natural title (MAXIMUM 100 characters).
2. Description: Compelling, engaging Pinterest description highlighting the aesthetic, details, and context. Include 3-5 relevant hashtags (MAXIMUM 500 characters).
3. Tags: An array of 5-8 relevant searchable keyword tags.
4. Alt Text: Clear, descriptive accessibility text describing what is visually shown in the image (MAXIMUM 500 characters).

Return ONLY a valid JSON object matching this exact format:
{
  "title": "Your Pinterest Title Here (max 100 chars)",
  "description": "Your engaging Pinterest description with hashtags here (max 500 chars)",
  "tags": ["#tag1", "#tag2", "#tag3", "#tag4"],
  "alt_text": "Detailed accessibility description of the image (max 500 chars)"
}`;

    const payload = {
      model,
      prompt,
      images: [base64Image],
      stream: false,
      format: 'json',
      options: {
        temperature: 0.7
      }
    };

    try {
      const response = await fetch(`${normalizedHost}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Ollama API error (HTTP ${response.status}): ${errText}`);
      }

      const data = await response.json();
      const rawResponse = data.response || '';
      
      const metadata = this.parseMetadataResponse(rawResponse);
      return {
        success: true,
        metadata,
        raw: rawResponse
      };
    } catch (err) {
      // If the model does not support vision or Ollama failed, provide clean fallback metadata
      console.error(`Ollama generation error with model ${model}:`, err.message);
      throw err;
    }
  }
}
