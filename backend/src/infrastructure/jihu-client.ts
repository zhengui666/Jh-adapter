/**
 * Jihu CodeRider Client - 外部服务客户端
 * 
 * 封装与Jihu CodeRider API的交互。
 */
import axios, { AxiosInstance } from 'axios';
import type { OAuthService } from './oauth-service.js';
import { JihuAuthExpiredError } from '../domain/exceptions.js';

export class JihuClient {
  private baseUrl: string;
  private oauthService: OAuthService;
  private defaultModel: string;
  private cachedJwt: string | null = null;
  private cachedJwtExp: Date | null = null;
  private client: AxiosInstance;

  constructor(
    baseUrl: string,
    oauthService: OAuthService,
    defaultModel: string = 'maas/maas-chat-model'
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.oauthService = oauthService;
    this.defaultModel = defaultModel;
    this.client = axios.create({
      timeout: 60000,
    });
  }

  private async getJwt(): Promise<string> {
    const now = new Date();
    if (this.cachedJwt && this.cachedJwtExp && now < new Date(this.cachedJwtExp.getTime() - 60000)) {
      return this.cachedJwt;
    }

    const accessToken = await this.oauthService.getAccessToken();

    try {
      const response = await this.client.post(
        `${this.baseUrl}/api/v1/auth/jwt`,
        {},
        { headers: { 'X-Access-Token': accessToken } }
      );

      const token = response.data.token;
      const expRaw = response.data.tokenExpiresAt;
      if (!token || !expRaw) {
        throw new Error('获取 JWT 失败，返回缺少 token/tokenExpiresAt');
      }

      this.cachedJwt = token;
      this.cachedJwtExp = new Date(expRaw);
      return token;
    } catch (error: any) {
      if (error.response?.status === 400 || error.response?.status === 401) {
        throw new JihuAuthExpiredError('coderider jwt unauthorized; please run npm run oauth-setup');
      }
      throw error;
    }
  }

  private stripModelPrefix(model: string): string {
    for (const prefix of ['maas/', 'server/']) {
      if (model.startsWith(prefix)) {
        return model.slice(prefix.length);
      }
    }
    return model;
  }

  async chatCompletions(
    messages: any[],
    model?: string,
    stream: boolean = false,
    extraParams?: any
  ): Promise<any> {
    const jwt = await this.getJwt();
    const normalizedModel = this.stripModelPrefix(model || this.defaultModel);

    const payload = {
      model: normalizedModel,
      messages,
      stream,
      ...(extraParams || {}),
    };

    const url = `${this.baseUrl}/api/v1/llm/v1/chat/completions`;
    const headers = {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    };

    if (!stream) {
      const response = await this.client.post(url, payload, { headers });
      return response.data;
    } else {
      // Streaming response - 返回stream对象
      const response = await this.client.post(url, payload, {
        headers,
        responseType: 'stream',
      });
      return response.data;
    }
  }

  async getModelConfig(): Promise<any> {
    const jwt = await this.getJwt();
    const url = `${this.baseUrl}/api/v1/config`;
    const headers = { Authorization: `Bearer ${jwt}` };

    const response = await this.client.get(url, { headers });
    return response.data;
  }
}

