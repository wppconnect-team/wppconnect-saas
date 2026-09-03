import { createHmac, timingSafeEqual } from 'crypto';

export const COMPATIBILITY_EVENTS = [
  'compatibility.incident.opened',
  'compatibility.incident.updated',
  'compatibility.incident.resolved',
] as const;

export type CompatibilityEvent = (typeof COMPATIBILITY_EVENTS)[number];
export type CompatibilitySignalStatus = 'passing' | 'failing' | 'unknown';

export interface CompatibilitySignal {
  schemaVersion: '1';
  idempotencyKey: string;
  monitorKey: string;
  project: string;
  status: CompatibilitySignalStatus;
  severity: 'warning' | 'critical';
  observedAt: string;
  whatsappVersion?: string;
  affectedCapabilities: string[];
  evidenceUrl?: string;
}

export interface CompatibilityMonitorSnapshot {
  status: CompatibilitySignalStatus;
  consecutiveFailures: number;
  hasOpenIncident: boolean;
}

export interface CompatibilityTransition {
  status: CompatibilitySignalStatus;
  consecutiveFailures: number;
  event: CompatibilityEvent | null;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)])
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function signCompatibilityPayload(
  secret: string,
  timestamp: number,
  payload: unknown
): string {
  const message = `${timestamp}.${canonicalJson(payload)}`;
  return `sha256=${createHmac('sha256', secret).update(message).digest('hex')}`;
}

export function verifyCompatibilitySignature(
  secret: string,
  timestamp: number,
  payload: unknown,
  signature: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  maxSkewSeconds = 300
): boolean {
  if (!Number.isInteger(timestamp) || Math.abs(nowSeconds - timestamp) > maxSkewSeconds) {
    return false;
  }

  const expected = signCompatibilityPayload(secret, timestamp, payload);
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signature);
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

export function transitionCompatibilityMonitor(
  previous: CompatibilityMonitorSnapshot,
  signalStatus: CompatibilitySignalStatus
): CompatibilityTransition {
  if (signalStatus === 'unknown') {
    return {
      status: previous.status,
      consecutiveFailures: previous.consecutiveFailures,
      event: null,
    };
  }

  if (signalStatus === 'passing') {
    return {
      status: 'passing',
      consecutiveFailures: 0,
      event: previous.hasOpenIncident ? 'compatibility.incident.resolved' : null,
    };
  }

  const consecutiveFailures = previous.consecutiveFailures + 1;
  const event = previous.hasOpenIncident
    ? 'compatibility.incident.updated'
    : consecutiveFailures >= 2
      ? 'compatibility.incident.opened'
      : null;

  return { status: 'failing', consecutiveFailures, event };
}
