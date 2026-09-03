import { resolve } from 'node:path';

function positiveInt(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function secret(name: string): string {
  const value = process.env[name];
  if (!value || value.length < 32) throw new Error(`${name} must contain at least 32 characters`);
  return value;
}

export type MediaConfig = ReturnType<typeof loadConfig>;

export function loadConfig() {
  const storageKey = process.env.MEDIA_STORAGE_KEY ?? '';
  const decoded = Buffer.from(storageKey, 'base64');
  if (decoded.length !== 32) throw new Error('MEDIA_STORAGE_KEY must be a base64-encoded 32-byte key');
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  return {
    databaseUrl,
    storageKey: decoded,
    storagePath: resolve(process.env.MEDIA_STORAGE_PATH ?? './data'),
    publicUrl: (process.env.MEDIA_PUBLIC_URL ?? 'http://localhost:3100').replace(/\/$/, ''),
    resultSigningSecret: secret('MEDIA_RESULT_SIGNING_SECRET'),
    webhookSigningSecret: secret('MEDIA_WEBHOOK_SIGNING_SECRET'),
    maxBytes: positiveInt('MEDIA_MAX_BYTES', 25 * 1024 * 1024),
    maxDurationSeconds: positiveInt('MEDIA_MAX_DURATION_SECONDS', 1800),
    retentionHours: positiveInt('MEDIA_RETENTION_HOURS', 24),
    transcriptionBaseUrl: (process.env.TRANSCRIPTION_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, ''),
    transcriptionApiKey: process.env.TRANSCRIPTION_API_KEY ?? '',
    transcriptionModel: process.env.TRANSCRIPTION_MODEL ?? 'whisper-1',
    port: positiveInt('PORT', 3100),
  };
}
