import { randomBytes, randomUUID } from 'crypto';
import { hashOpaqueToken } from './platform';

export const ACCESS_SESSION_SECONDS = 24 * 60 * 60;
export const REFRESH_SESSION_SECONDS = 30 * 24 * 60 * 60;

export interface SessionMaterial {
  sessionId: string;
  jti: string;
  refreshToken: string;
  refreshTokenHash: string;
  expiresAt: Date;
}

export function createSessionMaterial(now = new Date()): SessionMaterial {
  const refreshToken = `wppr_${randomBytes(32).toString('base64url')}`;
  return {
    sessionId: randomUUID(),
    jti: randomUUID(),
    refreshToken,
    refreshTokenHash: hashOpaqueToken(refreshToken),
    expiresAt: new Date(now.getTime() + REFRESH_SESSION_SECONDS * 1000),
  };
}

export function createRotationMaterial(): Pick<SessionMaterial, 'jti' | 'refreshToken' | 'refreshTokenHash'> {
  const refreshToken = `wppr_${randomBytes(32).toString('base64url')}`;
  return {
    jti: randomUUID(),
    refreshToken,
    refreshTokenHash: hashOpaqueToken(refreshToken),
  };
}

export function clientIpFromHeaders(headers: Headers): string | null {
  const candidate = headers.get('x-real-ip')?.trim()
    ?? headers.get('x-forwarded-for')?.split(',').at(-1)?.trim()
    ?? '';
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(candidate)) return candidate;
  if (/^[0-9a-f:]+$/i.test(candidate) && candidate.includes(':')) return candidate;
  return null;
}
