/**
 * Repositories - 数据访问层接口
 * 
 * 实现Repository模式，封装数据访问逻辑。
 */
import type { User, ApiKey, Session, RegistrationRequest } from '../domain/entities.js';

export interface UserRepository {
  create(user: User): number;
  findByUsername(username: string): User | null;
  exists(): boolean;
  findFirstAdmin(): User | null;
}

export interface ApiKeyRepository {
  create(apiKey: ApiKey): [number, string];
  findByKey(key: string): Record<string, any> | null;
  listByUser(userId: number): Record<string, any>[];
  listAll(): Record<string, any>[];
  updateUsage(apiKeyId: number, inputTokens: number, outputTokens: number): void;
}

export interface SessionRepository {
  create(userId: number): Session;
  findByToken(token: string): Session | null;
  touch(token: string): void;
  delete(token: string): void;
  cleanupExpired(): void;
}

export interface RegistrationRequestRepository {
  create(request: RegistrationRequest): number;
  listPending(): Record<string, any>[];
  approve(requestId: number): void;
  reject(requestId: number): void;
}

export interface SettingRepository {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

