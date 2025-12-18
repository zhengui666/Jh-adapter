/**
 * Application Services - 应用服务层
 * 
 * Node.js 环境特定的服务实现。
 */
import bcrypt from 'bcrypt';
import type { JihuClient } from '../infrastructure/jihu-client.js';
import type { PasswordHasher } from '../core/auth.js';

/**
 * Node 环境下的密码实现（使用 bcrypt，并向后兼容旧格式）。
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

