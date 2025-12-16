/**
 * Domain Entities - 领域实体
 * 
 * 核心业务实体，包含业务逻辑和不变性约束。
 */

export interface User {
  id: number | null;
  username: string;
  passwordHash: string;
  isAdmin: boolean;
  createdAt: Date;
}

export interface ApiKey {
  id: number | null;
  userId: number;
  key: string;
  name: string | null;
  isActive: boolean;
  createdAt: Date;
}

export interface Session {
  token: string;
  userId: number;
  createdAt: Date;
  lastSeenAt: Date;
}

export interface RegistrationRequest {
  id: number | null;
  username: string;
  passwordHash: string;
  createdAt: Date;
  status: 'pending' | 'approved' | 'rejected';
}

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  accessToken: string | null;
  refreshToken: string | null;
  redirectUri: string;
}

