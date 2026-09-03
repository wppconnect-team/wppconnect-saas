import { describe, expect, test } from 'bun:test';
import {
  createCompatibilityManifestKeys,
  issueCompatibilityManifest,
  verifyCompatibilityManifest,
  type CompatibilityManifestPayload,
} from './compatibilityManifest';

const now = Date.parse('2026-09-03T12:00:00.000Z');
const payload: CompatibilityManifestPayload = {
  v: 1,
  id: 'c889546e-bb09-4c23-ad91-760143a746ea',
  revision: 3,
  package: '@wppconnect/wa-js',
  whatsappVersion: '2.3000.1027931337',
  minimumPackageVersion: '3.20.0',
  recommendedPackageVersion: '3.21.1',
  capabilities: { sendText: 'supported', ptt: 'degraded' },
  featureFlags: { useLegacyPtt: true },
  workaroundUrl: 'https://wppconnect.io/status/ptt',
  notes: 'Temporarily prefer the legacy PTT encoder.',
  issuedAt: '2026-09-03T11:59:00.000Z',
  expiresAt: '2026-09-04T12:00:00.000Z',
};

describe('signed compatibility manifest', () => {
  test('round-trips a declarative payload with Ed25519', () => {
    const keys = createCompatibilityManifestKeys();
    const token = issueCompatibilityManifest(keys.privateKey, 'canary-2026-09', payload);
    expect(verifyCompatibilityManifest(token, keys.publicKey, now)).toEqual(payload);
  });

  test('rejects tampering and expiry', () => {
    const keys = createCompatibilityManifestKeys();
    const token = issueCompatibilityManifest(keys.privateKey, 'canary-2026-09', payload);
    expect(() => verifyCompatibilityManifest(`${token}x`, keys.publicKey, now)).toThrow('Invalid compatibility manifest signature');
    expect(() => verifyCompatibilityManifest(token, keys.publicKey, Date.parse(payload.expiresAt))).toThrow('Expired');
  });
});
