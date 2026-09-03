import { describe, expect, test } from 'bun:test';
import {
  createLicenseKey,
  createLicenseSigningKeys,
  installationHash,
  issueLicenseCredential,
  verifyLicenseCredential,
} from './licensing';

describe('extension licensing credentials', () => {
  test('signs locally verifiable, short-lived entitlements', () => {
    const keys = createLicenseSigningKeys();
    const now = Date.now();
    const claims = {
      v: 1 as const, appId: 'app', licenseId: 'license',
      installationHash: installationHash('app', 'device'),
      entitlements: { pro: true }, limits: { seats: 3 },
      iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 300,
      offlineUntil: Math.floor(now / 1000) + 86400,
    };
    const token = issueLicenseCredential(keys.privateKey, claims);
    expect(verifyLicenseCredential(token, keys.publicKey, now)).toEqual(claims);
    expect(() => verifyLicenseCredential(`${token}x`, keys.publicKey, now)).toThrow('Invalid license signature');
    expect(() => verifyLicenseCredential(token, keys.publicKey, now + 301_000)).toThrow('Expired');
  });

  test('stores only a hash and stable visible prefix for license keys', () => {
    const key = createLicenseKey('active');
    expect(key.plain.startsWith('lic_live_')).toBe(true);
    expect(key.hash).toHaveLength(64);
    expect(key.hash).not.toContain(key.plain);
    expect(installationHash('one', 'device')).not.toBe(installationHash('two', 'device'));
  });
});
