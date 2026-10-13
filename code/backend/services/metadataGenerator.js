import { LIMITS } from '../config.js';
import { OllamaVisionService } from './ollamaVisionService.js';

export class MetadataGenerator {
  /**
   * Programmatic safe clamping at word boundary to strictly enforce limits
   */
  static clampText(text, maxLen) {
    if (!text || typeof text !== 'string') return '';
    const clean = text.trim().replace(/\s+/g, ' ');
    if (clean.length <= maxLen) return clean;

    const truncated = clean.slice(0, maxLen);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLen * 0.7) {
      return truncated.slice(0, lastSpace).trim();
    }
    return truncated.trim();
  }

  /**
   * Programmatic validation of all metadata fields against centralized limits
   */
  static validateAndClampMetadata(metadata) {
    let title = this.clampText(metadata.title || '', LIMITS.TITLE_MAX_LENGTH);
    let description = this.clampText(metadata.description || '', LIMITS.DESCRIPTION_MAX_LENGTH);
    let altText = this.clampText(metadata.altText || metadata.alt_text || '', LIMITS.ALT_TEXT_MAX_LENGTH);
    
    let tags = [];
    if (Array.isArray(metadata.tags)) {
      tags = metadata.tags.map(t => String(t).trim().replace(/^#+/, '')).filter(Boolean);
    } else if (Array.isArray(metadata.keywords)) {
      tags = metadata.keywords.map(t => String(t).trim().replace(/^#+/, '')).filter(Boolean);
    } else if (typeof metadata.tags === 'string') {
      tags = metadata.tags.split(/[\s,]+/).map(t => t.trim().replace(/^#+/, '')).filter(Boolean);
    }

    if (!title) {
      throw new Error('Ollama failed to generate a valid title for the image');
    }

    // Ensure description incorporates hashtags if space allows
    if (!description.includes('#') && tags.length > 0) {
      const hashtagsStr = ' ' + tags.slice(0, 5).map(t => `#${t.replace(/[\s-]+/g, '')}`).join(' ');
      if (description.length + hashtagsStr.length <= LIMITS.DESCRIPTION_MAX_LENGTH) {
        description = `${description}${hashtagsStr}`;
      }
    }

    return {
      title,
      description: this.clampText(description, LIMITS.DESCRIPTION_MAX_LENGTH),
      tags: tags.slice(0, 8),
      altText: this.clampText(altText || title, LIMITS.ALT_TEXT_MAX_LENGTH)
    };
  }

  /**
   * STEP 3-7: Analyze actual image and generate Title, Description, Tags, and Alt Text
   */
  static async generateMetadata({ imagePath, boardName = '', topic = '' }) {
    const prompt = `You are an expert Pinterest SEO and copywriting assistant.
Analyze this actual image carefully.
Extract and understand:
- Main subject & visual elements
- Topic & content category: "${topic || boardName}"
- Any visible text in the image
- User intent and search context

Generate engaging, highly relevant, SEO-optimized Pinterest metadata adhering to these strict character limits:
1. Title: Catchy, descriptive, click-worthy Pinterest title (MAXIMUM ${LIMITS.TITLE_MAX_LENGTH} characters).
2. Description: Detailed, inspiring, natural description relevant to the image content (MAXIMUM ${LIMITS.DESCRIPTION_MAX_LENGTH} characters).
3. Tags: Array of 5 to 8 specific keyword tags relevant to what is shown in the image.
4. Alt Text: Accurate descriptive accessibility text of what is visually visible (MAXIMUM ${LIMITS.ALT_TEXT_MAX_LENGTH} characters).

Respond ONLY with a valid JSON object matching this exact schema:
{
  "title": "...",
  "description": "...",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "alt_text": "..."
}`;

    const raw = await OllamaVisionService.generateVisionResponse({
      imagePath,
      prompt,
      formatJson: true
    });

    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    let parsed = null;

    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }

    if (!parsed) {
      throw new Error(`Failed to parse valid JSON metadata from Ollama vision response: ${raw}`);
    }

    return this.validateAndClampMetadata(parsed);
  }

  /**
   * Rewrite only the specific incorrect metadata fields identified by AI Verification
   */
  static async rewriteIncorrectFields({ imagePath, currentMetadata, boardName, topic, issues }) {
    const prompt = `You are correcting Pinterest metadata that failed automated verification.
Analyze the image and the identified issues:

ISSUES TO FIX:
${JSON.stringify(issues, null, 2)}

CURRENT METADATA:
Title: "${currentMetadata.title}"
Description: "${currentMetadata.description}"
Tags: ${JSON.stringify(currentMetadata.tags)}
Alt Text: "${currentMetadata.altText}"
Board Topic: "${topic} (${boardName})"

INSTRUCTIONS:
- Rewrite ONLY the incorrect fields so that all issues are completely resolved.
- Ensure the metadata accurately matches the visual content of the image.
- Enforce strict limits: Title <= ${LIMITS.TITLE_MAX_LENGTH} chars, Description <= ${LIMITS.DESCRIPTION_MAX_LENGTH} chars, Alt Text <= ${LIMITS.ALT_TEXT_MAX_LENGTH} chars.

Return ONLY a valid JSON object with the complete corrected fields:
{
  "title": "...",
  "description": "...",
  "tags": ["..."],
  "alt_text": "..."
}`;

    const raw = await OllamaVisionService.generateVisionResponse({
      imagePath,
      prompt,
      formatJson: true
    });

    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    let parsed = null;

    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }

    if (!parsed) {
      throw new Error(`Failed to parse rewritten metadata from Ollama: ${raw}`);
    }

    return this.validateAndClampMetadata(parsed);
  }
}
