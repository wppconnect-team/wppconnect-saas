import { gunzipSync } from 'node:zlib';

const COUNTERS = ['messages.sent', 'messages.received', 'messages.deleted', 'errors.total'] as const;
const FORBIDDEN_KEYS = /(^|_)(content|body|text|phone|number|name|jid|media|filename|url)($|_)/i;
const NAME = /^[a-zA-Z][a-zA-Z0-9._:-]{0,119}$/;

export type FunctionMetric = { name: string; calls: number; errors: number; durationMsSum: number };
export type TelemetrySnapshot = {
  schemaVersion: '1'; idempotencyKey: string; sourceId: string; sdkVersion?: string; waVersion?: string;
  observedFrom: string; observedTo: string;
  counters: Partial<Record<(typeof COUNTERS)[number], number>>;
  responseLatency: { sumMs: number; count: number; buckets?: number[]; counts?: number[] };
  availability: { connectedSeconds: number; observedSeconds: number };
  functions: FunctionMetric[];
};

function boundedInt(value: unknown, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > maximum) throw new Error(`${label} must be a bounded non-negative integer`);
  return Number(value);
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      if (FORBIDDEN_KEYS.test(key)) throw new Error(`${label} contains a forbidden identifying field`);
      throw new Error(`${label} contains unsupported field ${key}`);
    }
  }
}

export function validateSnapshot(value: unknown): TelemetrySnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Snapshot must be an object');
  const input = value as Record<string, unknown>;
  exactKeys(input, ['schemaVersion','idempotencyKey','sourceId','sdkVersion','waVersion','observedFrom','observedTo','counters','responseLatency','availability','functions'], 'snapshot');
  if (input.schemaVersion !== '1') throw new Error('Unsupported telemetry schema version');
  if (typeof input.idempotencyKey !== 'string' || input.idempotencyKey.length < 8 || input.idempotencyKey.length > 200) throw new Error('Invalid idempotencyKey');
  if (typeof input.sourceId !== 'string' || !NAME.test(input.sourceId)) throw new Error('Invalid sourceId');
  if (input.sdkVersion !== undefined && (typeof input.sdkVersion !== 'string' || input.sdkVersion.length > 40)) throw new Error('Invalid sdkVersion');
  if (input.waVersion !== undefined && (typeof input.waVersion !== 'string' || input.waVersion.length > 80)) throw new Error('Invalid waVersion');
  const from = Date.parse(String(input.observedFrom));
  const to = Date.parse(String(input.observedTo));
  const observedSeconds = Math.round((to - from) / 1000);
  if (!Number.isFinite(from) || !Number.isFinite(to) || observedSeconds < 1 || observedSeconds > 86400) throw new Error('Observation interval must be between 1 second and 24 hours');

  if (!input.counters || typeof input.counters !== 'object' || Array.isArray(input.counters)) throw new Error('counters must be an object');
  const counters = input.counters as Record<string, unknown>;
  exactKeys(counters, COUNTERS, 'counters');
  for (const key of COUNTERS) if (key in counters) boundedInt(counters[key], 1_000_000_000, key);

  if (!input.responseLatency || typeof input.responseLatency !== 'object' || Array.isArray(input.responseLatency)) throw new Error('responseLatency must be an object');
  const latency = input.responseLatency as Record<string, unknown>;
  exactKeys(latency, ['sumMs','count','buckets','counts'], 'responseLatency');
  const sumMs = Number(latency.sumMs);
  const count = boundedInt(latency.count, 1_000_000_000, 'responseLatency.count');
  if (!Number.isFinite(sumMs) || sumMs < 0 || sumMs > 1e15) throw new Error('Invalid responseLatency.sumMs');
  if (latency.buckets !== undefined || latency.counts !== undefined) {
    if (!Array.isArray(latency.buckets) || !Array.isArray(latency.counts) || latency.buckets.length !== latency.counts.length || latency.buckets.length > 30) throw new Error('Invalid latency histogram');
    latency.buckets.forEach((entry) => { if (!Number.isFinite(Number(entry)) || Number(entry) < 0) throw new Error('Invalid histogram bucket'); });
    latency.counts.forEach((entry) => boundedInt(entry, 1_000_000_000, 'histogram count'));
  }

  if (!input.availability || typeof input.availability !== 'object' || Array.isArray(input.availability)) throw new Error('availability must be an object');
  const availability = input.availability as Record<string, unknown>;
  exactKeys(availability, ['connectedSeconds','observedSeconds'], 'availability');
  const suppliedObserved = boundedInt(availability.observedSeconds, 86400, 'availability.observedSeconds');
  const connected = boundedInt(availability.connectedSeconds, 86400, 'availability.connectedSeconds');
  if (suppliedObserved !== observedSeconds || connected > suppliedObserved) throw new Error('Availability must match the observation interval');

  if (!Array.isArray(input.functions) || input.functions.length > 200) throw new Error('functions must be an array with at most 200 entries');
  const functions = input.functions.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`Invalid function metric ${index}`);
    const metric = entry as Record<string, unknown>;
    exactKeys(metric, ['name','calls','errors','durationMsSum'], `function metric ${index}`);
    if (typeof metric.name !== 'string' || !NAME.test(metric.name)) throw new Error(`Invalid function name ${index}`);
    const calls = boundedInt(metric.calls, 1_000_000_000, 'calls');
    const errors = boundedInt(metric.errors, calls, 'errors');
    const durationMsSum = Number(metric.durationMsSum);
    if (!Number.isFinite(durationMsSum) || durationMsSum < 0 || durationMsSum > 1e15) throw new Error('Invalid function duration');
    return { name: metric.name, calls, errors, durationMsSum };
  });

  return {
    schemaVersion: '1', idempotencyKey: input.idempotencyKey, sourceId: input.sourceId,
    ...(input.sdkVersion ? { sdkVersion: input.sdkVersion as string } : {}),
    ...(input.waVersion ? { waVersion: input.waVersion as string } : {}),
    observedFrom: new Date(from).toISOString(), observedTo: new Date(to).toISOString(),
    counters: counters as TelemetrySnapshot['counters'],
    responseLatency: { sumMs, count,
      ...(latency.buckets ? { buckets: latency.buckets.map(Number), counts: (latency.counts as unknown[]).map(Number) } : {}) },
    availability: { connectedSeconds: connected, observedSeconds: suppliedObserved }, functions,
  };
}

export function parseTelemetryBatch(bytes: Uint8Array, encoding: string | null): TelemetrySnapshot[] {
  if (bytes.byteLength > (encoding?.toLowerCase() === 'gzip' ? 262_144 : 1_048_576)) throw new Error('Telemetry batch exceeds its transport limit');
  const plain = encoding?.toLowerCase() === 'gzip'
    ? gunzipSync(bytes, { maxOutputLength: 1_048_577 })
    : bytes;
  if (plain.byteLength > 1_048_576) throw new Error('Expanded telemetry batch exceeds 1 MiB');
  const value = JSON.parse(new TextDecoder().decode(plain)) as Record<string, unknown>;
  exactKeys(value, ['schemaVersion','snapshots'], 'batch');
  if (value.schemaVersion !== '1' || !Array.isArray(value.snapshots) || value.snapshots.length < 1 || value.snapshots.length > 100) throw new Error('Batch must contain 1 to 100 snapshots');
  return value.snapshots.map(validateSnapshot);
}
