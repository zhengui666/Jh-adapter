/**
 * Dependency Injection - 依赖注入
 * 
 * 提供应用所需的依赖实例。
 */
import {
  SQLiteUserRepository,
  SQLiteApiKeyRepository,
  SQLiteSessionRepository,
  SQLiteRegistrationRequestRepository,
  SQLiteSettingRepository,
} from './sqlite-repositories.js';
import { OAuthService } from './oauth-service.js';
import { JihuClient } from './jihu-client.js';
import { PasswordService, AuthService, ApiKeyService, ChatService } from '../application/services.js';
import { CODERIDER_HOST, DEFAULT_MODEL } from './config.js';

// 单例实例
const userRepo = new SQLiteUserRepository();
const apiKeyRepo = new SQLiteApiKeyRepository();
const sessionRepo = new SQLiteSessionRepository();
const registrationRepo = new SQLiteRegistrationRequestRepository();
const settingRepo = new SQLiteSettingRepository();

const oauthService = new OAuthService(settingRepo);
const jihuClient = new JihuClient(CODERIDER_HOST, oauthService, DEFAULT_MODEL);

const passwordService = PasswordService;
const authService = new AuthService(userRepo, sessionRepo, passwordService);
const apiKeyService = new ApiKeyService(apiKeyRepo, userRepo);
const chatService = new ChatService(jihuClient);

export function getAuthService(): AuthService {
  return authService;
}

export function getApiKeyService(): ApiKeyService {
  return apiKeyService;
}

export function getChatService(): ChatService {
  return chatService;
}

export function getUserRepo() {
  return userRepo;
}

export function getApiKeyRepo(): SQLiteApiKeyRepository {
  return apiKeyRepo;
}

export function getSessionRepo() {
  return sessionRepo;
}

export function getRegistrationRepo() {
  return registrationRepo;
}

export function getSettingRepo() {
  return settingRepo;
}

export function getOAuthService(): OAuthService {
  return oauthService;
}

