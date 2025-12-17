import type { PasswordHasher } from "../../backend/src/core/auth";

/**
 * Cloudflare Worker 环境下的密码实现
 *
 * 使用 Web Crypto 的 SHA-256，与之前 hand-written hashPassword/verifyPassword
 * 的行为保持一致，避免破坏现有用户数据。
 */
export class WorkerPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    const enc = new TextEncoder();
    const data = enc.encode(password);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async verify(password: string, storedHash: string): Promise<boolean> {
    const hash = await this.hash(password);
    return hash === storedHash;
  }

  validateStrength(password: string): boolean {
    return password.length >= 8;
  }
}


