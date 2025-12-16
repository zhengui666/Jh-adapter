/**
 * Cloudflare D1 Repository Implementations
 *
 * 基于 D1 的 Repository 实现，尽量与 SQLite 行为保持一致。
 */

import type {
  UserRepository,
  ApiKeyRepository,
  SessionRepository,
  RegistrationRequestRepository,
  SettingRepository,
} from '../../backend/src/infrastructure/repositories.js';
import type { User, ApiKey, Session, RegistrationRequest } from '../../backend/src/domain/entities.js';

export interface D1Env {
  DB: D1Database;
}

function rowToUser(row: any): User {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    isAdmin: Boolean(row.is_admin),
    createdAt: new Date(row.created_at),
  };
}

export class D1UserRepository implements UserRepository {
  constructor(private db: D1Database) {}

  async create(user: User): Promise<number> {
    const now = new Date().toISOString();
    const result = await this.db
      .prepare(
        'INSERT INTO users(username, password_hash, is_admin, created_at) VALUES(?,?,?,?) RETURNING id'
      )
      .bind(user.username, user.passwordHash, user.isAdmin ? 1 : 0, now)
      .first<any>();
    return Number(result.id);
  }

  async findByUsername(username: string): Promise<User | null> {
    const row = await this.db
      .prepare('SELECT * FROM users WHERE username = ?')
      .bind(username)
      .first<any>();
    return row ? rowToUser(row) : null;
  }

  async exists(): Promise<boolean> {
    const row = await this.db.prepare('SELECT 1 AS v FROM users LIMIT 1').first<any>();
    return row !== null && row !== undefined;
  }

  async findFirstAdmin(): Promise<User | null> {
    const row = await this.db
      .prepare('SELECT * FROM users WHERE is_admin = 1 ORDER BY id ASC LIMIT 1')
      .first<any>();
    return row ? rowToUser(row) : null;
  }
}

export class D1ApiKeyRepository implements ApiKeyRepository {
  constructor(private db: D1Database) {}

  async create(apiKey: ApiKey): Promise<[number, string]> {
    const now = new Date().toISOString();
    const key = apiKey.key || crypto.randomUUID().replace(/-/g, '');

    const inserted = await this.db
      .prepare(
        'INSERT INTO api_keys(user_id, key, name, is_active, created_at) VALUES(?,?,?,?,?) RETURNING id'
      )
      .bind(apiKey.userId, key, apiKey.name, apiKey.isActive ? 1 : 0, now)
      .first<any>();
    const apiKeyId = Number(inserted.id);

    await this.db
      .prepare(
        'INSERT INTO api_usage(api_key_id, total_input_tokens, total_output_tokens, total_requests, updated_at) VALUES(?,?,?,?,?)'
      )
      .bind(apiKeyId, 0, 0, 0, now)
      .run();

    return [apiKeyId, key];
  }

  async findByKey(key: string): Promise<Record<string, any> | null> {
    const row = await this.db
      .prepare(
        `
        SELECT ak.*, u.username, u.is_admin
        FROM api_keys ak JOIN users u ON ak.user_id = u.id
        WHERE ak.key = ? AND ak.is_active = 1
      `
      )
      .bind(key)
      .first<any>();
    return row
      ? {
          ...row,
          is_admin: Boolean(row.is_admin),
          is_active: Boolean(row.is_active),
        }
      : null;
  }

  async listByUser(userId: number): Promise<Record<string, any>[]> {
    const rows = await this.db
      .prepare(
        `
        SELECT ak.id, ak.key, ak.name, ak.is_active, ak.created_at,
          au.total_input_tokens, au.total_output_tokens, au.total_requests
        FROM api_keys ak
        LEFT JOIN api_usage au ON ak.id = au.api_key_id
        WHERE ak.user_id = ? ORDER BY ak.created_at DESC
      `
      )
      .bind(userId)
      .all<any>();
    return (rows.results || []).map((row: any) => ({
      ...row,
      is_active: Boolean(row.is_active),
    }));
  }

  async listAll(): Promise<Record<string, any>[]> {
    const rows = await this.db
      .prepare(
        `
        SELECT ak.id, ak.key, ak.name, ak.is_active, ak.created_at,
          u.username, u.is_admin,
          au.total_input_tokens, au.total_output_tokens, au.total_requests
        FROM api_keys ak
        JOIN users u ON ak.user_id = u.id
        LEFT JOIN api_usage au ON ak.id = au.api_key_id
        ORDER BY ak.created_at DESC
      `
      )
      .all<any>();
    return (rows.results || []).map((row: any) => ({
      ...row,
      is_admin: Boolean(row.is_admin),
      is_active: Boolean(row.is_active),
    }));
  }

  async updateUsage(apiKeyId: number, inputTokens: number, outputTokens: number): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `
        UPDATE api_usage SET
          total_input_tokens = total_input_tokens + ?,
          total_output_tokens = total_output_tokens + ?,
          total_requests = total_requests + 1,
          updated_at = ?
        WHERE api_key_id = ?
      `
      )
      .bind(inputTokens, outputTokens, now, apiKeyId)
      .run();
  }
}

export class D1SessionRepository implements SessionRepository {
  constructor(private db: D1Database) {}

  async create(userId: number): Promise<Session> {
    const token = crypto.randomUUID().replace(/-/g, '');
    const now = new Date().toISOString();
    await this.db
      .prepare(
        'INSERT INTO sessions(token, user_id, created_at, last_seen_at) VALUES(?,?,?,?)'
      )
      .bind(token, userId, now, now)
      .run();

    return {
      token,
      userId,
      createdAt: new Date(now),
      lastSeenAt: new Date(now),
    };
  }

  async findByToken(token: string): Promise<Session | null> {
    const row = await this.db
      .prepare('SELECT * FROM sessions WHERE token = ?')
      .bind(token)
      .first<any>();
    if (!row) return null;

    return {
      token: row.token,
      userId: row.user_id,
      createdAt: new Date(row.created_at),
      lastSeenAt: new Date(row.last_seen_at),
    };
  }

  async touch(token: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare('UPDATE sessions SET last_seen_at = ? WHERE token = ?')
      .bind(now, token)
      .run();
  }

  async delete(token: string): Promise<void> {
    await this.db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
  }

  async cleanupExpired(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    await this.db
      .prepare('DELETE FROM sessions WHERE last_seen_at < ?')
      .bind(cutoff.toISOString())
      .run();
  }
}

export class D1RegistrationRequestRepository implements RegistrationRequestRepository {
  constructor(private db: D1Database) {}

  async create(request: RegistrationRequest): Promise<number> {
    const now = request.createdAt?.toISOString?.() || new Date().toISOString();
    const row = await this.db
      .prepare(
        'INSERT INTO registration_requests(username, password_hash, status, created_at) VALUES(?,?,?,?) RETURNING id'
      )
      .bind(request.username, request.passwordHash, request.status, now)
      .first<any>();
    return Number(row.id);
  }

  async listPending(): Promise<Record<string, any>[]> {
    const rows = await this.db
      .prepare(
        "SELECT * FROM registration_requests WHERE status = 'pending' ORDER BY created_at DESC"
      )
      .all<any>();
    return rows.results || [];
  }

  async approve(requestId: number): Promise<void> {
    const req = await this.db
      .prepare('SELECT * FROM registration_requests WHERE id = ?')
      .bind(requestId)
      .first<any>();
    if (!req) return;

    await this.db
      .prepare(
        'INSERT INTO users(username, password_hash, is_admin, created_at) VALUES(?,?,?,?)'
      )
      .bind(req.username, req.password_hash, 0, req.created_at)
      .run();

    await this.db
      .prepare("UPDATE registration_requests SET status = 'approved' WHERE id = ?")
      .bind(requestId)
      .run();
  }

  async reject(requestId: number): Promise<void> {
    await this.db
      .prepare("UPDATE registration_requests SET status = 'rejected' WHERE id = ?")
      .bind(requestId)
      .run();
  }
}

export class D1SettingRepository implements SettingRepository {
  constructor(private db: D1Database) {}

  async get(key: string): Promise<string | null> {
    const row = await this.db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .bind(key)
      .first<any>();
    return row?.value || null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.db
      .prepare(
        'INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      .bind(key, value)
      .run();
  }
}


