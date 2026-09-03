import { describe, expect, test } from 'bun:test';
import {
  canonicalJson,
  signCompatibilityPayload,
  transitionCompatibilityMonitor,
  verifyCompatibilitySignature,
} from './compatibility';
import { decryptSecret, encryptSecret } from './encryptedSecret';
import { isPrivateUrl } from './urlSafety';

describe('compatibility monitor transitions', () => {
  test('opens only after two consecutive failures', () => {
    const first = transitionCompatibilityMonitor(
      { status: 'passing', consecutiveFailures: 0, hasOpenIncident: false },
      'failing'
    );
    expect(first).toEqual({ status: 'failing', consecutiveFailures: 1, event: null });

    const second = transitionCompatibilityMonitor(
      { ...first, hasOpenIncident: false },
      'failing'
    );
    expect(second.event).toBe('compatibility.incident.opened');
  });

  test('updates an open incident and resolves it after a passing signal', () => {
    const updated = transitionCompatibilityMonitor(
      { status: 'failing', consecutiveFailures: 2, hasOpenIncident: true },
      'failing'
    );
    expect(updated.event).toBe('compatibility.incident.updated');
    expect(updated.consecutiveFailures).toBe(3);

    const resolved = transitionCompatibilityMonitor(
      { status: 'failing', consecutiveFailures: 3, hasOpenIncident: true },
      'passing'
    );
    expect(resolved).toEqual({
      status: 'passing',
      consecutiveFailures: 0,
      event: 'compatibility.incident.resolved',
    });
  });

  test('does not let an infrastructure-unknown signal change incident state', () => {
    const transition = transitionCompatibilityMonitor(
      { status: 'failing', consecutiveFailures: 1, hasOpenIncident: false },
      'unknown'
    );
    expect(transition).toEqual({
      status: 'failing',
      consecutiveFailures: 1,
      event: null,
    });
  });
});

describe('compatibility webhook signatures', () => {
  test('uses canonical object ordering and rejects stale timestamps', () => {
    const timestamp = 1_800_000_000;
    const left = { project: 'wa-js', status: 'failing', nested: { b: 2, a: 1 } };
    const right = { nested: { a: 1, b: 2 }, status: 'failing', project: 'wa-js' };
    expect(canonicalJson(left)).toBe(canonicalJson(right));

    const signature = signCompatibilityPayload('secret', timestamp, left);
    expect(verifyCompatibilitySignature('secret', timestamp, right, signature, timestamp)).toBe(true);
    expect(verifyCompatibilitySignature('secret', timestamp, right, signature, timestamp + 301)).toBe(false);
  });

  test('encrypts stored endpoint secrets and detects tampering', () => {
    process.env.WEBHOOK_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    const encrypted = encryptSecret('whsec_example');
    expect(encrypted).not.toContain('whsec_example');
    expect(decryptSecret(encrypted)).toBe('whsec_example');

    const parts = encrypted.split('.');
    parts[2] = `${parts[2]![0] === 'A' ? 'B' : 'A'}${parts[2]!.slice(1)}`;
    expect(() => decryptSecret(parts.join('.'))).toThrow();
  });
});

describe('compatibility webhook URL safety', () => {
  test('accepts public HTTP endpoints and rejects local or metadata targets', () => {
    expect(isPrivateUrl('https://hooks.example.com/wppconnect')).toBe(false);
    expect(isPrivateUrl('http://127.0.0.1:3000/hook')).toBe(true);
    expect(isPrivateUrl('http://10.0.0.2/hook')).toBe(true);
    expect(isPrivateUrl('http://169.254.169.254/latest/meta-data')).toBe(true);
    expect(isPrivateUrl('file:///etc/passwd')).toBe(true);
  });
});
