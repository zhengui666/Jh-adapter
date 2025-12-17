/**
 * Repositories - 数据访问层接口
 * 
 * 实现Repository模式，封装数据访问逻辑。
 */
import type { User, ApiKey, Session, RegistrationRequest } from '../domain/entities.js';

export interface UserRepository {
  create(user: User): Promise<number>;
  findByUsername(username: string): Promise<User | null>;
  exists(): Promise<boolean>;
  findFirstAdmin(): Promise<User | null>;
}

export interface ApiKeyRepository {
  create(apiKey: ApiKey): Promise<[number, string]>;
  findByKey(key: string): Promise<Record<string, any> | null>;
  listByUser(userId: number): Promise<Record<string, any>[]>;
  listAll(): Promise<Record<string, any>[]>;
  updateUsage(apiKeyId: number, inputTokens: number, outputTokens: number): Promise<void>;
}

export interface SessionRepository {
  create(userId: number): Promise<Session>;
  findByToken(token: string): Promise<Session | null>;
  touch(token: string): Promise<void>;
  delete(token: string): Promise<void>;
  cleanupExpired(): Promise<void>;
}

export interface RegistrationRequestRepository {
  create(request: RegistrationRequest): Promise<number>;
  listPending(): Promise<Record<string, any>[]>;
  approve(requestId: number): Promise<void>;
  reject(requestId: number): Promise<void>;
}

export interface SettingRepository {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export interface RequestLog {
  id?: number | null;
  apiKeyId: number | null;
  method: string;
  path: string;
  requestBody: string | null;
  responseBody: string | null;
  statusCode: number;
  createdAt: Date;
}

export interface RequestLogRepository {
  create(log: RequestLog): Promise<number>;
  cleanupOlderThan(hours: number): Promise<number>; // 返回删除的记录数
}

