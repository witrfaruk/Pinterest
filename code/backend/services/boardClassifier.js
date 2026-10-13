import { getBoardsConfig } from '../config.js';
import { OllamaVisionService } from './ollamaVisionService.js';

export class BoardClassifier {
  /**
   * STEP 8: Analyze all 5 configured Pinterest boards, compare against image, select exactly ONE
   */
  static async selectBestBoard(imagePath) {
    const configuredBoards = getBoardsConfig();
    if (!configuredBoards || configuredBoards.length !== 5) {
      throw new Error('Exactly 5 boards must be configured in boards.json');
    }

    const boardsFormatted = configuredBoards.map((b, i) => 
      `BOARD ${i + 1}:\n- Board ID: "${b.id}"\n- Name: "${b.name}"\n- Topic/Category: "${b.topic}"\n- Instructions: "${b.instructions || 'N/A'}"`
    ).join('\n\n');

    const prompt = `You are an expert Pinterest content strategist.
Analyze this actual image carefully.
You must choose the single best Pinterest board for this image from ONLY the 5 configured boards below:

${boardsFormatted}

RULES:
1. Examine the visual elements, context, text, and subject matter of the image.
2. Select EXACTLY ONE of the 5 configured Board IDs that matches the image best.
3. NEVER select or invent a board ID outside the 5 listed above.

Respond ONLY with a valid JSON object matching this exact format:
{
  "selected_board_id": "<exact Board ID from the 5 configured boards>",
  "selected_board_name": "<exact Board Name>",
  "reason": "Clear explanation of why this image belongs on this board"
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
      throw new Error(`Failed to parse board classification response from Ollama: ${raw}`);
    }

    let selectedId = parsed.selected_board_id;
    let matched = configuredBoards.find(b => b.id === selectedId);

    // Matching by name or topic if exact ID string was slightly formatted
    if (!matched && parsed.selected_board_name) {
      matched = configuredBoards.find(b => 
        b.name.toLowerCase() === parsed.selected_board_name.toLowerCase() ||
        b.topic.toLowerCase() === parsed.selected_board_name.toLowerCase()
      );
    }

    if (!matched) {
      const fullText = (raw + ' ' + (parsed.reason || '')).toLowerCase();
      matched = configuredBoards.find(b => 
        fullText.includes(b.name.toLowerCase()) || 
        fullText.includes(b.topic.toLowerCase())
      );
    }

    if (!matched) {
      throw new Error(`Ollama failed to select one of the 5 configured boards. Response was: ${raw}`);
    }

    return {
      boardId: matched.id,
      boardName: matched.name,
      topic: matched.topic,
      instructions: matched.instructions,
      reason: parsed.reason || 'Image content directly aligned with board theme'
    };
  }
}
