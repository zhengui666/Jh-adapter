/**
 * SQLite Repository Implementations
 * 
 * 基于SQLite的Repository实现
 */
import Database from 'better-sqlite3';
import { randomBytes } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import type {
  UserRepository,
  ApiKeyRepository,
  SessionRepository,
  RegistrationRequestRepository,
  SettingRepository,
} from './repositories.js';
import type { User, ApiKey, Session, RegistrationRequest } from '../domain/entities.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_PATH = path.resolve(__dirname, '../../../jihu_proxy.db');

function getDb(): Database.Database {
  const db = new Database(DB_PATH);
  
  // 创建表结构
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      key TEXT UNIQUE NOT NULL,
      name TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS api_usage (
      api_key_id INTEGER PRIMARY KEY,
      total_input_tokens INTEGER NOT NULL DEFAULT 0,
      total_output_tokens INTEGER NOT NULL DEFAULT 0,
      total_requests INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(api_key_id) REFERENCES api_keys(id)
    );
    CREATE TABLE IF NOT EXISTS registration_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);
  
  return db;
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

export class SQLiteUserRepository implements UserRepository {
  create(user: User): number {
    const db = getDb();
    try {
      const now = new Date().toISOString();
      const stmt = db.prepare(
        'INSERT INTO users(username, password_hash, is_admin, created_at) VALUES(?,?,?,?)'
      );
      const result = stmt.run(user.username, user.passwordHash, user.isAdmin ? 1 : 0, now);
      return Number(result.lastInsertRowid);
    } finally {
      db.close();
    }
  }

  findByUsername(username: string): User | null {
    const db = getDb();
    try {
      const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
      const row = stmt.get(username) as any;
      return row ? rowToUser(row) : null;
    } finally {
      db.close();
    }
  }

  exists(): boolean {
    const db = getDb();
    try {
      const stmt = db.prepare('SELECT 1 FROM users LIMIT 1');
      return stmt.get() !== undefined;
    } finally {
      db.close();
    }
  }

  findFirstAdmin(): User | null {
    const db = getDb();
    try {
      const stmt = db.prepare('SELECT * FROM users WHERE is_admin = 1 ORDER BY id ASC LIMIT 1');
      const row = stmt.get() as any;
      return row ? rowToUser(row) : null;
    } finally {
      db.close();
    }
  }
}

export class SQLiteApiKeyRepository implements ApiKeyRepository {
  create(apiKey: ApiKey): [number, string] {
    const db = getDb();
    try {
      const now = new Date().toISOString();
      const key = apiKey.key || randomBytes(32).toString('hex');
      
      const stmt = db.prepare(
        'INSERT INTO api_keys(user_id, key, name, is_active, created_at) VALUES(?,?,?,?,?)'
      );
      const result = stmt.run(apiKey.userId, key, apiKey.name, apiKey.isActive ? 1 : 0, now);
      const apiKeyId = Number(result.lastInsertRowid);
      
      db.prepare(
        'INSERT INTO api_usage(api_key_id, total_input_tokens, total_output_tokens, total_requests, updated_at) VALUES(?,?,?,?,?)'
      ).run(apiKeyId, 0, 0, 0, now);
      
      return [apiKeyId, key];
    } finally {
      db.close();
    }
  }

  findByKey(key: string): Record<string, any> | null {
    const db = getDb();
    try {
      const stmt = db.prepare(`
        SELECT ak.*, u.username, u.is_admin 
        FROM api_keys ak JOIN users u ON ak.user_id = u.id 
        WHERE ak.key = ? AND ak.is_active = 1
      `);
      const row = stmt.get(key) as any;
      return row ? { ...row, is_admin: Boolean(row.is_admin), is_active: Boolean(row.is_active) } : null;
    } finally {
      db.close();
    }
  }

  listByUser(userId: number): Record<string, any>[] {
    const db = getDb();
    try {
      const stmt = db.prepare(`
        SELECT ak.id, ak.key, ak.name, ak.is_active, ak.created_at,
          au.total_input_tokens, au.total_output_tokens, au.total_requests
        FROM api_keys ak
        LEFT JOIN api_usage au ON ak.id = au.api_key_id
        WHERE ak.user_id = ? ORDER BY ak.created_at DESC
      `);
      return (stmt.all(userId) as any[]).map(row => ({
        ...row,
        is_active: Boolean(row.is_active),
      }));
    } finally {
      db.close();
    }
  }

  listAll(): Record<string, any>[] {
    const db = getDb();
    try {
      const stmt = db.prepare(`
        SELECT ak.id, ak.key, ak.name, ak.is_active, ak.created_at,
          u.username, u.is_admin,
          au.total_input_tokens, au.total_output_tokens, au.total_requests
        FROM api_keys ak
        JOIN users u ON ak.user_id = u.id
        LEFT JOIN api_usage au ON ak.id = au.api_key_id
        ORDER BY ak.created_at DESC
      `);
      return (stmt.all() as any[]).map(row => ({
        ...row,
        is_admin: Boolean(row.is_admin),
        is_active: Boolean(row.is_active),
      }));
    } finally {
      db.close();
    }
  }

  updateUsage(apiKeyId: number, inputTokens: number, outputTokens: number): void {
    const db = getDb();
    try {
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE api_usage SET
          total_input_tokens = total_input_tokens + ?,
          total_output_tokens = total_output_tokens + ?,
          total_requests = total_requests + 1,
          updated_at = ?
        WHERE api_key_id = ?
      `).run(inputTokens, outputTokens, now, apiKeyId);
    } finally {
      db.close();
    }
  }
}

export class SQLiteSessionRepository implements SessionRepository {
  create(userId: number): Session {
    const db = getDb();
    try {
      const token = randomBytes(32).toString('base64url');
      const now = new Date().toISOString();
      db.prepare(
        'INSERT INTO sessions(token, user_id, created_at, last_seen_at) VALUES(?,?,?,?)'
      ).run(token, userId, now, now);
      
      return {
        token,
        userId,
        createdAt: new Date(now),
        lastSeenAt: new Date(now),
      };
    } finally {
      db.close();
    }
  }

  findByToken(token: string): Session | null {
    const db = getDb();
    try {
      const stmt = db.prepare('SELECT * FROM sessions WHERE token = ?');
      const row = stmt.get(token) as any;
      if (!row) return null;
      
      return {
        token: row.token,
        userId: row.user_id,
        createdAt: new Date(row.created_at),
        lastSeenAt: new Date(row.last_seen_at),
      };
    } finally {
      db.close();
    }
  }

  touch(token: string): void {
    const db = getDb();
    try {
      const now = new Date().toISOString();
      db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token = ?').run(now, token);
    } finally {
      db.close();
    }
  }

  delete(token: string): void {
    const db = getDb();
    try {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    } finally {
      db.close();
    }
  }

  cleanupExpired(): void {
    const db = getDb();
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      db.prepare('DELETE FROM sessions WHERE last_seen_at < ?').run(cutoff.toISOString());
    } finally {
      db.close();
    }
  }
}

export class SQLiteRegistrationRequestRepository implements RegistrationRequestRepository {
  create(request: RegistrationRequest): number {
    const db = getDb();
    try {
      const now = new Date().toISOString();
      const stmt = db.prepare(
        'INSERT INTO registration_requests(username, password_hash, status, created_at) VALUES(?,?,?,?)'
      );
      const result = stmt.run(request.username, request.passwordHash, request.status, now);
      return Number(result.lastInsertRowid);
    } finally {
      db.close();
    }
  }

  listPending(): Record<string, any>[] {
    const db = getDb();
    try {
      const stmt = db.prepare(
        "SELECT * FROM registration_requests WHERE status = 'pending' ORDER BY created_at DESC"
      );
      return stmt.all() as Record<string, any>[];
    } finally {
      db.close();
    }
  }

  approve(requestId: number): void {
    const db = getDb();
    try {
      const stmt = db.prepare('SELECT * FROM registration_requests WHERE id = ?');
      const req = stmt.get(requestId) as any;
      if (!req) return;

      db.prepare(
        'INSERT INTO users(username, password_hash, is_admin, created_at) VALUES(?,?,?,?)'
      ).run(req.username, req.password_hash, 0, req.created_at);
      
      db.prepare("UPDATE registration_requests SET status = 'approved' WHERE id = ?").run(requestId);
    } finally {
      db.close();
    }
  }

  reject(requestId: number): void {
    const db = getDb();
    try {
      db.prepare("UPDATE registration_requests SET status = 'rejected' WHERE id = ?").run(requestId);
    } finally {
      db.close();
    }
  }
}

export class SQLiteSettingRepository implements SettingRepository {
  get(key: string): string | null {
    const db = getDb();
    try {
      const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
      const row = stmt.get(key) as any;
      return row?.value || null;
    } finally {
      db.close();
    }
  }

  set(key: string, value: string): void {
    const db = getDb();
    try {
      db.prepare(
        'INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      ).run(key, value);
    } finally {
      db.close();
    }
  }
}

