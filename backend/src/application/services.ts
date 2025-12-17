/**
 * Application Services - 应用服务层
 * 
 * 实现业务用例，协调Domain实体和Infrastructure服务。
 */
import bcrypt from 'bcrypt';
import type {
  UserRepository,
  ApiKeyRepository,
  SessionRepository,
} from '../infrastructure/repositories.js';
import type { User, ApiKey, Session } from '../domain/entities.js';
import { AuthenticationError, ValidationError } from '../domain/exceptions.js';
import type { JihuClient } from '../infrastructure/jihu-client.js';

/**
 * 抽象密码服务接口，便于在 Node（bcrypt）与 Cloudflare（WebCrypto 等）之间复用业务逻辑。
 */
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, storedHash: string, legacySalt?: string): Promise<boolean>;
  validateStrength(password: string): boolean;
}

/**
 * 默认 Node 环境下的密码实现（使用 bcrypt，并向后兼容旧格式）。
 */
export class BcryptPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    return await bcrypt.hash(password, 10);
  }

  async verify(password: string, storedHash: string, legacySalt?: string): Promise<boolean> {
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

  validateStrength(password: string): boolean {
    return password.length >= 8;
  }
}

export class AuthService {
  constructor(
    private userRepo: UserRepository,
    private sessionRepo: SessionRepository,
    private passwordService: PasswordHasher,
    private legacySalt?: string
  ) {}

  async register(username: string, password: string, _requireApproval: boolean = true): Promise<[number, boolean]> {
    if (!this.passwordService.validateStrength(password)) {
      throw new ValidationError('Password must be at least 8 characters');
    }

    if (await this.userRepo.findByUsername(username)) {
      throw new ValidationError('Username already exists');
    }

    const passwordHash = await this.passwordService.hash(password);
    const isAdmin = !(await this.userRepo.exists());

    const user: User = {
      id: null,
      username,
      passwordHash,
      isAdmin,
      createdAt: new Date(),
    };

    const userId = await this.userRepo.create(user);
    return [userId, isAdmin];
  }

  async login(username: string, password: string): Promise<Session> {
    const user = await this.userRepo.findByUsername(username);
    if (!user) {
      throw new AuthenticationError('Invalid username or password');
    }

    const isValid = await this.passwordService.verify(password, user.passwordHash, this.legacySalt);
    if (!isValid) {
      throw new AuthenticationError('Invalid username or password');
    }

    return await this.sessionRepo.create(user.id!);
  }

  async validateSession(token: string): Promise<Session> {
    const session = await this.sessionRepo.findByToken(token);
    if (!session) {
      throw new AuthenticationError('Invalid or expired session');
    }
    await this.sessionRepo.touch(token);
    return session;
  }
}

export class ApiKeyService {
  constructor(
    private apiKeyRepo: ApiKeyRepository,
  ) {}

  async create(userId: number, name?: string): Promise<[number, string]> {
    const apiKey: ApiKey = {
      id: null,
      userId,
      key: '',
      name: name || null,
      isActive: true,
      createdAt: new Date(),
    };
    return await this.apiKeyRepo.create(apiKey);
  }

  async validate(key: string): Promise<Record<string, any>> {
    const record = await this.apiKeyRepo.findByKey(key);
    if (!record) {
      throw new AuthenticationError('Invalid or inactive API key');
    }
    return record;
  }

  async listUserKeys(userId: number): Promise<Record<string, any>[]> {
    return await this.apiKeyRepo.listByUser(userId);
  }

  async updateUsage(apiKeyId: number, inputTokens: number, outputTokens: number): Promise<void> {
    await this.apiKeyRepo.updateUsage(apiKeyId, inputTokens, outputTokens);
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

