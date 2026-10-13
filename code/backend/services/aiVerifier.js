import { LIMITS } from '../config.js';
import { OllamaVisionService } from './ollamaVisionService.js';
import { MetadataGenerator } from './metadataGenerator.js';

export class AiVerifier {
  /**
   * STEP 9: Verify image, metadata, and board selection via a separate Ollama vision call
   */
  static async verifyMetadata({ imagePath, metadata, selectedBoard }) {
    const { title, description, tags, altText } = metadata;
    const { boardId, boardName, topic } = selectedBoard;

    // 1. Programmatic character limit check first
    const limitIssues = [];
    if (title.length > LIMITS.TITLE_MAX_LENGTH) {
      limitIssues.push(`Title exceeds ${LIMITS.TITLE_MAX_LENGTH} characters (is ${title.length})`);
    }
    if (description.length > LIMITS.DESCRIPTION_MAX_LENGTH) {
      limitIssues.push(`Description exceeds ${LIMITS.DESCRIPTION_MAX_LENGTH} characters (is ${description.length})`);
    }
    if (altText.length > LIMITS.ALT_TEXT_MAX_LENGTH) {
      limitIssues.push(`Alt text exceeds ${LIMITS.ALT_TEXT_MAX_LENGTH} characters (is ${altText.length})`);
    }

    const prompt = `You are a strict Pinterest Quality & Accuracy Verification Auditor.
Examine this actual image and verify the proposed Pinterest publication details:

PROPOSED PUBLICATION DETAILS:
- Title: "${title}"
- Description: "${description}"
- Tags: ${JSON.stringify(tags)}
- Alt Text: "${altText}"
- Target Board: "${boardName}" (Topic: ${topic})

VERIFICATION CHECKLIST:
1. Does the title accurately and truthfully represent the image without hallucination?
2. Does the description accurately represent what is shown in the image?
3. Are the keywords / tags relevant to what is shown?
4. Is the alt text accurate for accessibility?
5. Is the selected board category ("${boardName}") appropriate for this image?
6. Does every field respect its character limit (Title <= ${LIMITS.TITLE_MAX_LENGTH}, Description <= ${LIMITS.DESCRIPTION_MAX_LENGTH}, Alt Text <= ${LIMITS.ALT_TEXT_MAX_LENGTH})?
7. Is there any hallucinated, fake, or non-existent information?
8. Is there any misleading or spammy content?
9. Does the metadata genuinely match the visual content?

Respond ONLY with a valid JSON object matching this exact schema:
{
  "status": "PASS" or "FAIL",
  "issues": [
    "Specific issue description if any field failed"
  ],
  "failed_fields": ["title", "description", "tags", "alt_text", "board"],
  "notes": "Short summary explanation"
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
      throw new Error(`Failed to parse AI Verifier response from Ollama: ${raw}`);
    }

    let isPass = (parsed.status || '').toUpperCase() === 'PASS';
    const issues = [...limitIssues, ...(parsed.issues || [])];
    const failedFields = parsed.failed_fields || [];

    if (limitIssues.length > 0) {
      isPass = false;
    }

    return {
      status: isPass ? 'PASS' : 'FAIL',
      issues,
      failedFields,
      notes: parsed.notes || (isPass ? 'All verification checks passed' : 'Verification issues identified')
    };
  }

  /**
   * Complete Verification & Self-Correction Loop
   * If verification returns FAIL, rewrite only incorrect metadata and re-verify
   */
  static async verifyAndCorrect({ imagePath, initialMetadata, selectedBoard, maxCorrectionAttempts = 3 }) {
    let currentMetadata = { ...initialMetadata };
    let attempt = 0;

    while (attempt < maxCorrectionAttempts) {
      attempt++;
      console.log(`[AI Verification] Verification attempt ${attempt}/${maxCorrectionAttempts}...`);

      const result = await this.verifyMetadata({
        imagePath,
        metadata: currentMetadata,
        selectedBoard
      });

      if (result.status === 'PASS') {
        console.log(`[AI Verification] Result: PASS (All checks verified successfully)`);
        return {
          verified: true,
          metadata: currentMetadata,
          attempts: attempt,
          notes: result.notes
        };
      }

      console.log(`[AI Verification] Result: FAIL. Issues: ${result.issues.join('; ')}`);
      console.log(`[AI Verification] Rewriting incorrect metadata fields...`);

      currentMetadata = await MetadataGenerator.rewriteIncorrectFields({
        imagePath,
        currentMetadata,
        boardName: selectedBoard.boardName,
        topic: selectedBoard.topic,
        issues: result.issues
      });
    }

    // Final strict verification check after all correction attempts
    const finalResult = await this.verifyMetadata({
      imagePath,
      metadata: currentMetadata,
      selectedBoard
    });

    if (finalResult.status !== 'PASS') {
      throw new Error(`Image failed AI verification after ${maxCorrectionAttempts} correction attempts: ${finalResult.issues.join('; ')}`);
    }

    return {
      verified: true,
      metadata: currentMetadata,
      attempts: attempt,
      notes: finalResult.notes
    };
  }
}
