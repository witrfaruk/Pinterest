import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export class PinterestService {
  static getBaseUrl(useSandbox = false) {
    return useSandbox ? 'https://api-sandbox.pinterest.com/v5' : 'https://api.pinterest.com/v5';
  }

  /**
   * Test user account credentials and retrieve account profile
   */
  static async verifyUserAccount(accessToken, useSandbox = false) {
    if (!accessToken) {
      return { success: false, error: 'Pinterest Access Token is required' };
    }

    const baseUrl = this.getBaseUrl(useSandbox);

    try {
      const response = await fetch(`${baseUrl}/user_account`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ message: response.statusText }));
        return {
          success: false,
          status: response.status,
          error: errData.message || `HTTP ${response.status}: Failed to authenticate with Pinterest API`
        };
      }

      const userData = await response.json();
      return {
        success: true,
        user: {
          username: userData.username,
          account_type: userData.account_type,
          profile_image: userData.profile_image,
          website_url: userData.website_url
        }
      };
    } catch (err) {
      return {
        success: false,
        error: `Network error connecting to Pinterest API: ${err.message}`
      };
    }
  }

  /**
   * Fetch list of boards for the authenticated user
   */
  static async getBoards(accessToken, useSandbox = false) {
    if (!accessToken) {
      return { success: false, error: 'Pinterest Access Token is required', boards: [] };
    }

    const baseUrl = this.getBaseUrl(useSandbox);

    try {
      const response = await fetch(`${baseUrl}/boards?page_size=100`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ message: response.statusText }));
        return {
          success: false,
          status: response.status,
          error: errData.message || `HTTP ${response.status}: Failed to fetch boards`,
          boards: []
        };
      }

      const data = await response.json();
      const boards = (data.items || []).map(b => ({
        id: b.id,
        name: b.name,
        description: b.description,
        privacy: b.privacy,
        pin_count: b.pin_count
      }));

      return { success: true, boards };
    } catch (err) {
      return {
        success: false,
        error: `Failed to fetch boards: ${err.message}`,
        boards: []
      };
    }
  }

  /**
   * Process local image to ensure high-quality compatible format (JPEG/PNG)
   */
  static async prepareImageBuffer(imagePath) {
    const rawBuffer = await fs.readFile(imagePath);
    const ext = path.extname(imagePath).toLowerCase();

    // If already JPEG or PNG and reasonable size, use as is or optimize
    let contentType = 'image/jpeg';
    let outputBuffer;

    if (ext === '.png') {
      contentType = 'image/png';
      outputBuffer = rawBuffer;
    } else if (ext === '.jpg' || ext === '.jpeg') {
      contentType = 'image/jpeg';
      outputBuffer = rawBuffer;
    } else {
      // Convert WebP, GIF, BMP, etc. into high-quality JPEG
      outputBuffer = await sharp(rawBuffer)
        .jpeg({ quality: 90 })
        .toBuffer();
      contentType = 'image/jpeg';
    }

    return {
      buffer: outputBuffer,
      contentType,
      base64: outputBuffer.toString('base64')
    };
  }

  /**
   * Create a Pin using the Official Pinterest API v5
   */
  static async createPin({
    accessToken,
    boardId,
    title,
    description,
    altText,
    imagePath,
    link = '',
    useSandbox = false
  }) {
    if (!accessToken) {
      throw new Error('Pinterest Access Token is missing.');
    }
    if (!boardId) {
      throw new Error('Pinterest Board ID is required to publish a pin.');
    }
    if (!imagePath) {
      throw new Error('Image path is required.');
    }

    const baseUrl = this.getBaseUrl(useSandbox);

    // Prepare image buffer & base64
    const { base64, contentType } = await this.prepareImageBuffer(imagePath);

    // Pinterest Pin creation payload using official image_base64 media source
    const payload = {
      board_id: boardId,
      title: title ? title.slice(0, 100) : '',
      description: description ? description.slice(0, 500) : '',
      alt_text: altText ? altText.slice(0, 500) : '',
      media_source: {
        source_type: 'image_base64',
        content_type: contentType,
        data: base64
      }
    };

    if (link && link.trim().startsWith('http')) {
      payload.link = link.trim();
    }

    const response = await fetch(`${baseUrl}/pins`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    if (!response.ok) {
      const errorMsg = responseData.message || responseData.error || `Pinterest API returned error ${response.status}`;
      const details = responseData.details ? JSON.stringify(responseData.details) : '';
      throw new Error(`${errorMsg} ${details}`.trim());
    }

    const pinId = responseData.id;
    const pinUrl = `https://www.pinterest.com/pin/${pinId}/`;

    return {
      success: true,
      pinId,
      pinUrl,
      createdAt: responseData.created_at,
      title: responseData.title || title,
      description: responseData.description || description,
      boardId: responseData.board_id || boardId,
      raw: responseData
    };
  }
}
