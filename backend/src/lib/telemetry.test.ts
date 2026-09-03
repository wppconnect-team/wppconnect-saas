import { describe, expect, test } from 'bun:test';
import { gzipSync } from 'node:zlib';
import { parseTelemetryBatch, validateSnapshot } from './telemetry';

const snapshot = () => ({
  schemaVersion: '1', idempotencyKey: 'snapshot-123', sourceId: 'server-a', sdkVersion: '0.1.0', waVersion: '2.3000.1',
  observedFrom: '2026-09-03T10:00:00.000Z', observedTo: '2026-09-03T10:01:00.000Z',
  counters: { 'messages.sent': 4, 'messages.received': 3, 'messages.deleted': 1, 'errors.total': 2 },
  responseLatency: { sumMs: 1200, count: 4, buckets: [100, 500], counts: [1, 3] },
  availability: { connectedSeconds: 58, observedSeconds: 60 },
  functions: [{ name: 'sendText', calls: 4, errors: 1, durationMsSum: 900 }],
});

describe('privacy-safe telemetry contract', () => {
  test('normalizes a bounded aggregate snapshot', () => {
    const parsed = validateSnapshot(snapshot());
    expect(parsed.counters['messages.deleted']).toBe(1);
    expect(parsed.functions[0]).toEqual({ name: 'sendText', calls: 4, errors: 1, durationMsSum: 900 });
  });

  test('rejects content, identity, and unrecognized fields at every level', () => {
    for (const patch of [
      { messageContent: 'secret' }, { phone: '5511' }, { jid: 'user@c.us' }, { mediaUrl: 'https://x' }, { arbitrary: true },
    ]) expect(() => validateSnapshot({ ...snapshot(), ...patch })).toThrow();
    expect(() => validateSnapshot({ ...snapshot(), counters: { ...snapshot().counters, phone: 1 } })).toThrow(/forbidden/);
    expect(() => validateSnapshot({ ...snapshot(), functions: [{ ...snapshot().functions[0], name: '551199999999@c.us' }] })).toThrow();
  });

  test('accepts gzip batches and enforces interval invariants', () => {
    const body = Buffer.from(JSON.stringify({ schemaVersion: '1', snapshots: [snapshot()] }));
    expect(parseTelemetryBatch(gzipSync(body), 'gzip')).toHaveLength(1);
    expect(() => validateSnapshot({ ...snapshot(), availability: { connectedSeconds: 61, observedSeconds: 60 } })).toThrow();
  });
});
