/**
 * Configuration - 配置管理
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { SettingRepository } from './repositories.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../../../');
const OAUTH_CONFIG_PATH = join(PROJECT_ROOT, 'jihu_oauth_config.json');

export { PROJECT_ROOT, OAUTH_CONFIG_PATH };

function loadOAuthConfig(): Record<string, any> {
  if (!existsSync(OAUTH_CONFIG_PATH)) {
    return {};
  }
  try {
    const content = readFileSync(OAUTH_CONFIG_PATH, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

const oauthConfig = loadOAuthConfig();

function getConfig(
  key: string,
  envKey: string,
  defaultValue?: string,
  settingRepo?: SettingRepository
): string | null {
  // 优先环境变量
  if (process.env[envKey]) {
    return process.env[envKey];
  }
  
  // 其次SQLite
  if (settingRepo) {
    const stored = settingRepo.get(key);
    if (stored !== null) {
      return stored;
    }
  }
  
  // 最后配置文件
  if (oauthConfig[key]) {
    return oauthConfig[key];
  }
  
  return defaultValue || null;
}

export const CODERIDER_HOST = process.env.CODERIDER_HOST || 'https://coderider.jihulab.com';
export const DEFAULT_MODEL = process.env.CODERIDER_MODEL || 'maas/maas-chat-model';

export function getGitLabAccessToken(settingRepo?: SettingRepository): string | null {
  return getConfig('access_token', 'GITLAB_OAUTH_ACCESS_TOKEN', undefined, settingRepo);
}

export function getGitLabRefreshToken(settingRepo?: SettingRepository): string | null {
  return getConfig('refresh_token', 'GITLAB_OAUTH_REFRESH_TOKEN', undefined, settingRepo);
}

export function getGitLabClientId(settingRepo?: SettingRepository): string | null {
  return getConfig('client_id', 'GITLAB_OAUTH_CLIENT_ID', undefined, settingRepo);
}

export function getGitLabClientSecret(settingRepo?: SettingRepository): string | null {
  return getConfig('client_secret', 'GITLAB_OAUTH_CLIENT_SECRET', undefined, settingRepo);
}

export function getGitLabRedirectUri(settingRepo?: SettingRepository): string {
  return getConfig(
    'redirect_uri',
    'GITLAB_OAUTH_REDIRECT_URI',
    'http://127.0.0.1:8000/auth/oauth-callback',
    settingRepo
  ) || 'http://127.0.0.1:8000/auth/oauth-callback';
}

export function loadOAuthConfigFromFile(): Record<string, any> {
  return oauthConfig;
}

