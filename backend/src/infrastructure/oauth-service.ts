/**
 * OAuth Service - OAuth认证服务
 * 
 * 封装GitLab OAuth token管理逻辑
 */
import axios from 'axios';
import type { SettingRepository } from './repositories.js';
import { JihuAuthExpiredError } from '../domain/exceptions.js';
import {
  getGitLabAccessToken,
  getGitLabRefreshToken,
  getGitLabClientId,
  getGitLabClientSecret,
  getGitLabRedirectUri,
  loadOAuthConfigFromFile,
} from './config.js';
import { triggerOAuthSetupAsync } from './oauth-flow.js';

export class OAuthService {
  private settingRepo: SettingRepository;
  private cachedAccessToken: string | null = null;

  constructor(settingRepo: SettingRepository) {
    this.settingRepo = settingRepo;
  }

  async getAccessToken(): Promise<string> {
    // 每次都重新从配置文件读取最新的token
    const freshConfig = loadOAuthConfigFromFile();
    const freshAccessToken =
      process.env.GITLAB_OAUTH_ACCESS_TOKEN ||
      this.settingRepo.get('access_token') ||
      freshConfig.access_token;

    if (freshAccessToken) {
      this.cachedAccessToken = freshAccessToken;
      return freshAccessToken;
    }

    // 如果没有access_token，尝试使用refresh_token刷新
    const freshRefreshToken =
      process.env.GITLAB_OAUTH_REFRESH_TOKEN ||
      this.settingRepo.get('refresh_token') ||
      freshConfig.refresh_token;

    if (!freshRefreshToken) {
      throw new Error('缺少 GitLab OAuth access_token，请先运行 npm run oauth-setup');
    }

    const clientId = getGitLabClientId(this.settingRepo);
    const clientSecret = getGitLabClientSecret(this.settingRepo);
    if (!clientId || !clientSecret) {
      throw new Error('使用 refresh_token 需要提供 GITLAB_OAUTH_CLIENT_ID/GITLAB_OAUTH_CLIENT_SECRET');
    }

    const tokenUrl = 'https://jihulab.com/oauth/token';
    const redirectUri = getGitLabRedirectUri(this.settingRepo) || freshConfig.redirect_uri || 'urn:ietf:wg:oauth:2.0:oob';

    try {
      const response = await axios.post(tokenUrl, {
        grant_type: 'refresh_token',
        refresh_token: freshRefreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      });

      this.cachedAccessToken = response.data.access_token;
      return this.cachedAccessToken;
    } catch (error: any) {
      if (error.response?.status === 400 || error.response?.status === 401) {
        triggerOAuthSetupAsync();
        throw new JihuAuthExpiredError('refresh token invalid or expired; please run npm run oauth-setup');
      }
      throw error;
    }
  }

  clearCache(): void {
    this.cachedAccessToken = null;
  }
}

