/**
 * Core auth & API key services
 *
 * 与运行环境无关的业务用例，仅依赖领域实体和 Repository 接口。
 * Node 后端与 Cloudflare Worker 都可以直接复用这里的逻辑。
 */

import type {
  UserRepository,
  ApiKeyRepository,
  SessionRepository,
} from "../infrastructure/repositories.js";
import type { User, ApiKey, Session } from "../domain/entities.js";
import { AuthenticationError, ValidationError } from "../domain/exceptions.js";

// 跨环境的密码哈希接口，由各自环境提供实现
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, storedHash: string, legacySalt?: string): Promise<boolean>;
  validateStrength(password: string): boolean;
}

export class AuthService {
  constructor(
    private userRepo: UserRepository,
    private sessionRepo: SessionRepository,
    private passwordService: PasswordHasher,
    private legacySalt?: string,
  ) {}

  async register(username: string, password: string, _requireApproval: boolean = true): Promise<[number, boolean]> {
    if (!this.passwordService.validateStrength(password)) {
      throw new ValidationError("Password must be at least 8 characters");
    }

    if (await this.userRepo.findByUsername(username)) {
      throw new ValidationError("Username already exists");
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
      throw new AuthenticationError("Invalid username or password");
    }

    const isValid = await this.passwordService.verify(password, user.passwordHash, this.legacySalt);
    if (!isValid) {
      throw new AuthenticationError("Invalid username or password");
    }

    return await this.sessionRepo.create(user.id!);
  }

  async validateSession(token: string): Promise<Session> {
    const session = await this.sessionRepo.findByToken(token);
    if (!session) {
      throw new AuthenticationError("Invalid or expired session");
    }
    await this.sessionRepo.touch(token);
    return session;
  }
}

export class ApiKeyService {
  constructor(private apiKeyRepo: ApiKeyRepository) {}

  async create(userId: number, name?: string): Promise<[number, string]> {
    const apiKey: ApiKey = {
      id: null,
      userId,
      key: "",
      name: name || null,
      isActive: true,
      createdAt: new Date(),
    };
    return await this.apiKeyRepo.create(apiKey);
  }

  async validate(key: string): Promise<Record<string, any>> {
    const record = await this.apiKeyRepo.findByKey(key);
    if (!record) {
      throw new AuthenticationError("Invalid or inactive API key");
    }
    return record;
  }

  async listUserKeys(userId: number): Promise<Record<string, any>[]> {
    return await this.apiKeyRepo.listByUser(userId);
  }

  async updateUsage(apiKeyId: number, inputTokens: number, outputTokens: number): Promise<void> {
    await this.apiKeyRepo.updateUsage(apiKeyId, inputTokens, outputTokens);
  }

  async listAll(): Promise<Record<string, any>[]> {
    return await this.apiKeyRepo.listAll();
  }
}


