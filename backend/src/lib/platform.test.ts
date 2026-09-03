import { describe, expect, test } from 'bun:test';
import {
  assertUsageQuantity,
  createApiCredential,
  grantsScope,
  hashOpaqueToken,
  normalizeScopes,
} from './platform';

describe('platform credentials', () => {
  test('generates a non-recoverable API credential with a visible prefix', () => {
    const credential = createApiCredential('production');
    expect(credential.plain.startsWith('wpp_live_')).toBe(true);
    expect(credential.prefix).toBe(credential.plain.slice(0, 18));
    expect(credential.hash).toBe(hashOpaqueToken(credential.plain));
    expect(credential.hash).not.toContain(credential.plain);
  });

  test('normalizes scopes and supports exact, product wildcard, and global grants', () => {
    expect(normalizeScopes([' media:read ', 'media:read', '', 'media:write']))
      .toEqual(['media:read', 'media:write']);
    expect(grantsScope(['media:*'], 'media:transcriptions:create')).toBe(true);
    expect(grantsScope(['media:read'], 'media:write')).toBe(false);
    expect(grantsScope(['*'], 'catalog:sync')).toBe(true);
  });
});

describe('usage validation', () => {
  test('accepts bounded positive integers and rejects invalid quantities', () => {
    expect(assertUsageQuantity(1)).toBe(1);
    expect(assertUsageQuantity(1_000_000_000)).toBe(1_000_000_000);
    for (const value of [0, -1, 1.5, Number.NaN, 1_000_000_001]) {
      expect(() => assertUsageQuantity(value)).toThrow();
    }
  });
});
