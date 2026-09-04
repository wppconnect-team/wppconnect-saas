import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { convertToPtt } from '../src/media';
import { signPayload, signResult, verifyResult } from '../src/security';
import { EncryptedStorage } from '../src/storage';
import { MediaWorker } from '../src/worker';
import type { MediaConfig } from '../src/config';
import type { MediaJob, MediaRepository, NewJob } from '../src/repository';
import { createApp } from '../src/app';

const dirs: string[] = [];
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))));

function wave(seconds = 0.2, rate = 8000): Buffer {
  const samples = Math.floor(seconds * rate);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.sin(2 * Math.PI * 440 * i / rate) * 8000, i * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(36 + data.length, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

async function encodedVariant(bytes: Buffer, extension: string, codecArgs: string[]): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'wpp-format-test-')); dirs.push(dir);
  const input = join(dir, 'source.wav');
  const output = join(dir, `source.${extension}`);
  await writeFile(input, bytes);
  const child = Bun.spawn(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', input, ...codecArgs, output], {
    stdout: 'ignore', stderr: 'pipe',
  });
  const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  if (code !== 0) throw new Error(stderr);
  return readFile(output);
}

class MemoryRepository implements MediaRepository {
  job: MediaJob | null = null;
  usage = 0;
  async authenticate(token: string) { return token === 'wpp_test_valid' ? { workspaceId: 'workspace', scopes: ['media:*'] } : null; }
  async createJob(input: NewJob) {
    if (this.job?.workspaceId === input.workspaceId && this.job.idempotencyKey === input.idempotencyKey) {
      return { job: this.job, duplicate: true };
    }
    this.job = {
      ...input, status: input.sourceType === 'upload' ? 'staging' : 'queued', sourceUrl: input.sourceUrl ?? null,
      sourceFilename: input.sourceFilename ?? null, inputMime: input.inputMime ?? null,
      inputPath: input.inputPath ?? null, outputPath: null, language: input.language ?? null,
      webhookUrl: input.webhookUrl ?? null, result: {}, errorCode: null, errorMessage: null,
      inputBytes: input.inputBytes ? String(input.inputBytes) : null, outputBytes: null, durationSeconds: null,
      retainUntil: input.retainUntil, createdAt: new Date(), completedAt: null,
    };
    return { job: this.job, duplicate: false };
  }
  async queueJob(_id: string) { if (this.job) this.job.status = 'queued'; }
  async getJob(workspaceId: string, id: string) { return this.job?.workspaceId === workspaceId && this.job.id === id ? this.job : null; }
  async getJobById(id: string) { return this.job?.id === id ? this.job : null; }
  async claimJob() { if (!this.job || this.job.status !== 'queued') return null; this.job.status = 'processing'; return this.job; }
  async updateInput(id: string, path: string, bytes: number, mime: string | null) {
    if (this.job?.id === id) { this.job.inputPath = path; this.job.inputBytes = String(bytes); this.job.inputMime = mime; }
  }
  async completeJob(id: string, data: { result: Record<string, unknown>; outputPath?: string; outputBytes?: number; durationSeconds: number }) {
    if (this.job?.id === id) {
      Object.assign(this.job, { status: 'succeeded', result: data.result, outputPath: data.outputPath ?? null,
        outputBytes: String(data.outputBytes ?? 0), durationSeconds: String(data.durationSeconds), completedAt: new Date() });
    }
  }
  async failJob(id: string, code: string, message: string) {
    if (this.job?.id === id) Object.assign(this.job, { status: 'failed', errorCode: code, errorMessage: message });
  }
  async queueWebhook() {}
  async dueWebhooks() { return []; }
  async finishWebhook() {}
  async expireJobs() { return []; }
  async recordUsage(_job: MediaJob, duration: number) { this.usage += duration; }
  async close() {}
}

async function testConfig(dir: string): Promise<MediaConfig> {
  return {
    databaseUrl: 'postgres://unused', storageKey: Buffer.alloc(32, 7), storagePath: dir,
    publicUrl: 'https://media.example.test', resultSigningSecret: 'r'.repeat(32),
    webhookSigningSecret: 'w'.repeat(32), maxBytes: 1024 * 1024, maxDurationSeconds: 10,
    retentionHours: 1, transcriptionBaseUrl: 'https://provider.example.test/v1',
    transcriptionApiKey: '', transcriptionModel: 'whisper-1', port: 3100,
  };
}

describe('media conversion', () => {
  test('converts WAV, MP3, WebM/Opus, and OGG/Opus to WhatsApp-compatible PTT', async () => {
    const source = wave();
    const inputs = [
      { name: 'voice.wav', bytes: source },
      { name: 'voice.mp3', bytes: await encodedVariant(source, 'mp3', ['-c:a', 'libmp3lame']) },
      { name: 'voice.webm', bytes: await encodedVariant(source, 'webm', ['-c:a', 'libopus']) },
      { name: 'voice.ogg', bytes: await encodedVariant(source, 'ogg', ['-c:a', 'libopus']) },
    ];
    for (const input of inputs) {
      const result = await convertToPtt(input.bytes, input.name, 10);
      expect(result.bytes.subarray(0, 4).toString()).toBe('OggS');
      expect(result.probe.codec).toBe('opus');
      expect(result.probe.format).toContain('ogg');
      expect(result.probe.durationSeconds).toBeGreaterThan(0);
    }
  });
});

describe('encrypted retention storage', () => {
  test('encrypts at rest and authenticates tampering', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wpp-storage-test-')); dirs.push(dir);
    const storage = new EncryptedStorage(dir, Buffer.alloc(32, 7));
    const path = storage.path('12345678-test', 'input');
    await storage.put(path, Buffer.from('private audio'));
    expect((await Bun.file(path).text())).not.toContain('private audio');
    expect((await storage.get(path)).toString()).toBe('private audio');
  });
});

describe('asynchronous job lifecycle', () => {
  test('moves a staged encrypted upload through queue, conversion, usage, and signed output', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wpp-worker-test-')); dirs.push(dir);
    const config = await testConfig(dir);
    const storage = new EncryptedStorage(dir, config.storageKey);
    const repo = new MemoryRepository();
    const id = '12345678-1234-4234-8234-123456789012';
    const path = storage.path(id, 'input');
    const created = await repo.createJob({ id, workspaceId: 'workspace', idempotencyKey: 'job-key-123',
      kind: 'conversion', sourceType: 'upload', sourceFilename: 'voice.wav', inputPath: path,
      inputBytes: wave().byteLength, retainUntil: new Date(Date.now() + 60_000) });
    expect(created.job.status).toBe('staging');
    await storage.put(path, wave());
    await repo.queueJob(id);
    const worker = new MediaWorker(repo, storage, config);
    expect(await worker.processOne()).toBe(true);
    expect(repo.job?.status).toBe('succeeded');
    expect(repo.job?.result).toEqual({ format: 'ogg', codec: 'opus', mimeType: 'audio/ogg; codecs=opus' });
    expect(repo.usage).toBeGreaterThan(0);
    const output = await storage.get(repo.job!.outputPath!);
    expect(output.subarray(0, 4).toString()).toBe('OggS');
  });
});

describe('HTTP contract', () => {
  test('requires API key, accepts multipart upload, and deduplicates creation', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wpp-app-test-')); dirs.push(dir);
    const config = await testConfig(dir);
    const storage = new EncryptedStorage(dir, config.storageKey);
    const repo = new MemoryRepository();
    const app = createApp(repo, storage, config);
    const unauthorized = await app.handle(new Request('http://local/v1/audio/conversions', {
      method: 'POST', headers: { 'idempotency-key': 'upload-1234' }, body: JSON.stringify({})
    }));
    expect(unauthorized.status).toBe(401);

    const upload = () => {
      const form = new FormData();
      const bytes = wave();
      const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      form.set('file', new File([body], 'voice.wav', { type: 'audio/wav' }));
      return form;
    };
    const request = () => new Request('http://local/v1/audio/conversions', {
      method: 'POST', headers: { authorization: 'Bearer wpp_test_valid', 'idempotency-key': 'upload-1234' }, body: upload(),
    });
    const created = await app.handle(request());
    expect(created.status).toBe(202);
    expect((await created.json() as { duplicate: boolean }).duplicate).toBe(false);
    expect(repo.job?.status).toBe('queued');
    expect(await storage.get(repo.job!.inputPath!)).toEqual(wave());

    const duplicate = await app.handle(request());
    expect(duplicate.status).toBe(200);
    expect((await duplicate.json() as { duplicate: boolean }).duplicate).toBe(true);
  });

  test('advertises capabilities and rejects unavailable transcription before queueing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wpp-app-test-')); dirs.push(dir);
    const config = await testConfig(dir);
    const storage = new EncryptedStorage(dir, config.storageKey);
    const repo = new MemoryRepository();
    const app = createApp(repo, storage, config);

    const health = await app.handle(new Request('http://local/health'));
    expect(health.status).toBe(200);
    expect((await health.json() as { capabilities: Record<string, boolean> }).capabilities).toEqual({
      conversion: true,
      transcription: false,
    });

    const unavailable = await app.handle(new Request('http://local/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        authorization: 'Bearer wpp_test_valid',
        'content-type': 'application/json',
        'idempotency-key': 'transcription-1234',
      },
      body: JSON.stringify({ sourceUrl: 'https://media.example.test/audio.ogg' }),
    }));
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({ error: 'Transcription is not configured in this environment' });
    expect(repo.job).toBeNull();
  });
});

describe('signatures', () => {
  test('signs webhooks and expiring download URLs', () => {
    const secret = 's'.repeat(32);
    expect(signPayload(secret, 123, '{}')).toMatch(/^t=123,v1=[a-f0-9]{64}$/);
    const expires = Math.floor(Date.now() / 1000) + 60;
    const signature = signResult(secret, 'job-id', expires);
    expect(verifyResult(secret, 'job-id', expires, signature)).toBe(true);
    expect(verifyResult(secret, 'other', expires, signature)).toBe(false);
    expect(verifyResult(secret, 'job-id', 1, signResult(secret, 'job-id', 1))).toBe(false);
  });
});
