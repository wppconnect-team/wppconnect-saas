import { describe, expect, test } from 'bun:test';
import {
  REFRESH_SESSION_SECONDS,
  clientIpFromHeaders,
  createRotationMaterial,
  createSessionMaterial,
} from './authSession';
import { hashOpaqueToken } from './platform';

describe('rotating sessions', () => {
  test('stores only a hash and expires refresh credentials after the configured window', () => {
    const now = new Date('2026-09-03T00:00:00.000Z');
    const session = createSessionMaterial(now);
    expect(session.refreshToken.startsWith('wppr_')).toBe(true);
    expect(session.refreshTokenHash).toBe(hashOpaqueToken(session.refreshToken));
    expect(session.refreshTokenHash).not.toContain(session.refreshToken);
    expect(session.expiresAt.getTime() - now.getTime()).toBe(REFRESH_SESSION_SECONDS * 1000);

    const rotated = createRotationMaterial();
    expect(rotated.jti).not.toBe(session.jti);
    expect(rotated.refreshTokenHash).not.toBe(session.refreshTokenHash);
  });

  test('accepts address-shaped proxy values and drops untrusted text', () => {
    expect(clientIpFromHeaders(new Headers({ 'x-real-ip': '203.0.113.10' }))).toBe('203.0.113.10');
    expect(clientIpFromHeaders(new Headers({ 'x-forwarded-for': '10.0.0.1, 2001:db8::1' })))
      .toBe('2001:db8::1');
    expect(clientIpFromHeaders(new Headers({ 'x-real-ip': 'unknown' }))).toBeNull();
  });
});
