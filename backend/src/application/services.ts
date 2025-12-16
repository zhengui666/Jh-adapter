/**
 * Application Services - 应用服务层
 * 
 * 实现业务用例，协调Domain实体和Infrastructure服务。
 */
import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import type {
  UserRepository,
  ApiKeyRepository,
  SessionRepository,
} from '../infrastructure/repositories.js';
import type { User, ApiKey, Session } from '../domain/entities.js';
import { AuthenticationError, ValidationError } from '../domain/exceptions.js';
import type { JihuClient } from '../infrastructure/jihu-client.js';

export class PasswordService {
  static async hash(password: string): Promise<string> {
    return await bcrypt.hash(password, 10);
  }

  static async verify(password: string, storedHash: string, legacySalt?: string): Promise<boolean> {
    try {
      if (storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$') || storedHash.startsWith('$2a$')) {
        return await bcrypt.compare(password, storedHash);
      }
      // 兼容旧格式
      if (legacySalt) {
        const crypto = await import('crypto');
        const legacy = crypto.createHash('sha256').update(legacySalt + password).digest('hex');
        return legacy === storedHash;
      }
      return false;
    } catch {
      return false;
    }
  }

  static validateStrength(password: string): boolean {
    return password.length >= 8;
  }
}

export class AuthService {
  constructor(
    private userRepo: UserRepository,
    private sessionRepo: SessionRepository,
    private passwordService: typeof PasswordService,
    private legacySalt?: string
  ) {}

  async register(username: string, password: string, requireApproval: boolean = true): Promise<[number, boolean]> {
    if (!this.passwordService.validateStrength(password)) {
      throw new ValidationError('Password must be at least 8 characters');
    }

    if (this.userRepo.findByUsername(username)) {
      throw new ValidationError('Username already exists');
    }

    const passwordHash = await this.passwordService.hash(password);
    const isAdmin = !this.userRepo.exists();

    const user: User = {
      id: null,
      username,
      passwordHash,
      isAdmin,
      createdAt: new Date(),
    };

    const userId = this.userRepo.create(user);
    return [userId, isAdmin];
  }

  async login(username: string, password: string): Promise<Session> {
    const user = this.userRepo.findByUsername(username);
    if (!user) {
      throw new AuthenticationError('Invalid username or password');
    }

    const isValid = await this.passwordService.verify(password, user.passwordHash, this.legacySalt);
    if (!isValid) {
      throw new AuthenticationError('Invalid username or password');
    }

    return this.sessionRepo.create(user.id!);
  }

  validateSession(token: string): Session {
    const session = this.sessionRepo.findByToken(token);
    if (!session) {
      throw new AuthenticationError('Invalid or expired session');
    }
    this.sessionRepo.touch(token);
    return session;
  }
}

export class ApiKeyService {
  constructor(
    private apiKeyRepo: ApiKeyRepository,
    private userRepo: UserRepository
  ) {}

  create(userId: number, name?: string): [number, string] {
    const apiKey: ApiKey = {
      id: null,
      userId,
      key: '',
      name: name || null,
      isActive: true,
      createdAt: new Date(),
    };
    return this.apiKeyRepo.create(apiKey);
  }

  validate(key: string): Record<string, any> {
    const record = this.apiKeyRepo.findByKey(key);
    if (!record) {
      throw new AuthenticationError('Invalid or inactive API key');
    }
    return record;
  }

  listUserKeys(userId: number): Record<string, any>[] {
    return this.apiKeyRepo.listByUser(userId);
  }

  updateUsage(apiKeyId: number, inputTokens: number, outputTokens: number): void {
    this.apiKeyRepo.updateUsage(apiKeyId, inputTokens, outputTokens);
  }
}

export class ChatService {
  constructor(private jihuClient: JihuClient) {}

  async chatCompletions(messages: any[], model?: string, stream: boolean = false, extraParams?: any): Promise<any> {
    try {
      return await this.jihuClient.chatCompletions(messages, model, stream, extraParams);
    } catch (error: any) {
      if (error instanceof Error && error.message.startsWith('JIHU_AUTH_EXPIRED:')) {
        throw error;
      }
      throw error;
    }
  }

  async getModels(): Promise<any> {
    try {
      return await this.jihuClient.getModelConfig();
    } catch (error: any) {
      if (error instanceof Error && error.message.startsWith('JIHU_AUTH_EXPIRED:')) {
        throw error;
      }
      throw error;
    }
  }
}

