import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { CONFIG } from '../config.js';

export class PinterestApiService {
  static getBaseUrl() {
    return CONFIG.pinterestUseSandbox
      ? 'https://api-sandbox.pinterest.com/v5'
      : 'https://api.pinterest.com/v5';
  }

  /**
   * Convert image into standardized high-quality JPEG or PNG for Pinterest API
   */
  static async prepareImageBuffer(imagePath) {
    const rawBuffer = await fs.readFile(imagePath);
    const ext = path.extname(imagePath).toLowerCase();

    let contentType = 'image/jpeg';
    let outputBuffer;

    if (ext === '.png') {
      contentType = 'image/png';
      outputBuffer = rawBuffer;
    } else if (ext === '.jpg' || ext === '.jpeg') {
      contentType = 'image/jpeg';
      outputBuffer = rawBuffer;
    } else {
      outputBuffer = await sharp(rawBuffer)
        .jpeg({ quality: 90 })
        .toBuffer();
      contentType = 'image/jpeg';
    }

    return {
      contentType,
      base64: outputBuffer.toString('base64')
    };
  }

  /**
   * STEP 10: Official Pinterest API v5 upload
   */
  static async createPin({ boardId, title, description, altText, imagePath, imageUrl, link = '' }) {
    const token = CONFIG.pinterestAccessToken;
    if (!token) {
      throw new Error('PINTEREST_ACCESS_TOKEN is missing in .env configuration.');
    }
    if (!boardId || boardId.includes('PLACEHOLDER')) {
      throw new Error(`Invalid Pinterest Board ID: "${boardId}". Please configure valid Pinterest Board IDs in boards.json`);
    }

    const baseUrl = this.getBaseUrl();
    let mediaSource;

    if (imageUrl) {
      mediaSource = {
        source_type: 'image_url',
        url: imageUrl
      };
    } else if (imagePath) {
      const { contentType, base64 } = await this.prepareImageBuffer(imagePath);
      mediaSource = {
        source_type: 'image_base64',
        content_type: contentType,
        data: base64
      };
    } else {
      throw new Error('Either imagePath or imageUrl must be provided to createPin.');
    }

    const payload = {
      board_id: boardId,
      title: title ? title.slice(0, 100) : '',
      description: description ? description.slice(0, 500) : '',
      alt_text: altText ? altText.slice(0, 500) : '',
      media_source: mediaSource
    };

    if (link && link.startsWith('http')) {
      payload.link = link;
    }

    const response = await fetch(`${baseUrl}/pins`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
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
      const errorMsg = responseData.message || responseData.error || `Pinterest API returned HTTP ${response.status}`;
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
      boardId: responseData.board_id || boardId,
      raw: responseData
    };
  }

  /**
   * Check connection and fetch authorized Pinterest account details
   */
  static async checkAuth() {
    const token = CONFIG.pinterestAccessToken;
    if (!token) {
      return { connected: false, reason: 'PINTEREST_ACCESS_TOKEN is not set.' };
    }
    try {
      const baseUrl = this.getBaseUrl();
      const response = await fetch(`${baseUrl}/user_account`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        return {
          connected: false,
          status: response.status,
          reason: data.message || `Pinterest returned HTTP ${response.status}`
        };
      }
      const data = await response.json();
      return {
        connected: true,
        username: data.username,
        accountType: data.account_type,
        profileImage: data.profile_image,
        about: data.about
      };
    } catch (err) {
      return { connected: false, reason: err.message };
    }
  }

  /**
   * Exchange Pinterest OAuth Authorization Code for Access Token
   */
  static async exchangeOAuthCode(code, redirectUri) {
    const appId = CONFIG.pinterestAppId;
    const appSecret = CONFIG.pinterestAppSecret;
    if (!appId || !appSecret) {
      throw new Error('PINTEREST_APP_ID or PINTEREST_APP_SECRET is missing. Please set them in your .env file.');
    }

    const authHeader = 'Basic ' + Buffer.from(`${appId}:${appSecret}`).toString('base64');
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', redirectUri);

    const baseUrl = this.getBaseUrl();
    const response = await fetch(`${baseUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || `Pinterest OAuth failed with HTTP ${response.status}`);
    }
    return data;
  }
}

