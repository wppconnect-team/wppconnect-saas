import { randomUUID } from 'node:crypto';
import { Elysia } from 'elysia';
import type { MediaConfig } from './config';
import type { JobKind, MediaRepository } from './repository';
import { assertPublicHttpsUrl, verifyResult } from './security';
import { EncryptedStorage } from './storage';
import { publicJob } from './worker';

function bearer(request: Request): string {
  const header = request.headers.get('authorization') ?? '';
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
}

function grants(scopes: string[], required: string): boolean {
  const namespace = required.split(':')[0];
  return scopes.includes('*') || scopes.includes(required) || scopes.includes(`${namespace}:*`);
}

async function authorize(request: Request, repo: MediaRepository, required: string) {
  const context = await repo.authenticate(bearer(request));
  if (!context) return { status: 401 as const, error: 'Invalid, expired, or revoked API key' };
  if (!grants(context.scopes, required)) return { status: 403 as const, error: `API key does not grant ${required}` };
  return { status: 200 as const, ...context };
}

type ParsedInput = {
  bytes?: Buffer; sourceUrl?: string; filename?: string; mime?: string;
  language?: string; webhookUrl?: string;
};

async function parseInput(request: Request, maxBytes: number): Promise<ParsedInput> {
  const contentType = request.headers.get('content-type') ?? '';
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (contentType.includes('multipart/form-data')) {
    if (declared > maxBytes + 1_048_576) throw new Error('Request exceeds the configured size limit');
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new Error('The multipart field file is required');
    if (file.size <= 0 || file.size > maxBytes) throw new Error('Uploaded file has an invalid size');
    return {
      bytes: Buffer.from(await file.arrayBuffer()), filename: file.name, mime: file.type || undefined,
      language: String(form.get('language') ?? '') || undefined,
      webhookUrl: String(form.get('webhookUrl') ?? '') || undefined,
    };
  }
  if (declared > 65_536) throw new Error('JSON request exceeds 64 KiB');
  const json = await request.json() as Record<string, unknown>;
  if (typeof json.sourceUrl !== 'string' || !json.sourceUrl) throw new Error('sourceUrl is required for JSON requests');
  return {
    sourceUrl: json.sourceUrl, filename: typeof json.filename === 'string' ? json.filename : undefined,
    mime: typeof json.mimeType === 'string' ? json.mimeType : undefined,
    language: typeof json.language === 'string' ? json.language : undefined,
    webhookUrl: typeof json.webhookUrl === 'string' ? json.webhookUrl : undefined,
  };
}

export function createApp(repo: MediaRepository, storage: EncryptedStorage, config: MediaConfig) {
  async function createJob(request: Request, kind: JobKind, set: { status?: number | string }) {
    const auth = await authorize(request, repo, 'media:write');
    if (auth.status !== 200) { set.status = auth.status; return { error: auth.error }; }
    const idempotencyKey = request.headers.get('idempotency-key')?.trim() ?? '';
    if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
      set.status = 400; return { error: 'Idempotency-Key must contain between 8 and 200 characters' };
    }
    try {
      const input = await parseInput(request, config.maxBytes);
      if (input.sourceUrl) await assertPublicHttpsUrl(input.sourceUrl);
      if (input.webhookUrl) await assertPublicHttpsUrl(input.webhookUrl);
      const id = randomUUID();
      const inputPath = input.bytes ? storage.path(id, 'input') : undefined;
      const created = await repo.createJob({
        id, workspaceId: auth.workspaceId, idempotencyKey, kind,
        sourceType: input.bytes ? 'upload' : 'url', sourceUrl: input.sourceUrl,
        sourceFilename: input.filename, inputMime: input.mime, inputPath,
        inputBytes: input.bytes?.byteLength, language: input.language, webhookUrl: input.webhookUrl,
        retainUntil: new Date(Date.now() + config.retentionHours * 3_600_000),
      });
      if (!created.duplicate && input.bytes && inputPath) {
        try { await storage.put(inputPath, input.bytes); }
        catch (error) {
          await repo.failJob(id, 'storage_failed', String(error));
          throw error;
        }
        await repo.queueJob(id);
        created.job.status = 'queued';
      }
      set.status = created.duplicate ? 200 : 202;
      return { duplicate: created.duplicate, data: publicJob(created.job, config) };
    } catch (error) {
      set.status = 422;
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  return new Elysia()
    .get('/health', () => ({ status: 'ok', service: 'wppconnect-media-api', timestamp: new Date().toISOString() }))
    .post('/v1/audio/conversions', ({ request, set }) => createJob(request, 'conversion', set))
    .post('/v1/audio/transcriptions', ({ request, set }) => createJob(request, 'transcription', set))
    .get('/v1/jobs/:id', async ({ request, params, set }) => {
      const auth = await authorize(request, repo, 'media:read');
      if (auth.status !== 200) { set.status = auth.status; return { error: auth.error }; }
      const job = await repo.getJob(auth.workspaceId, params.id);
      if (!job) { set.status = 404; return { error: 'Job not found' }; }
      return { data: publicJob(job, config) };
    })
    .get('/v1/jobs/:id/content', async ({ params, query, set }) => {
      const expires = Number(query.expires);
      if (!query.signature || !verifyResult(config.resultSigningSecret, params.id, expires, query.signature)) {
        set.status = 403; return { error: 'Invalid or expired result URL' };
      }
      const job = await repo.getJobById(params.id);
      if (!job || job.status !== 'succeeded' || !job.outputPath || job.retainUntil.getTime() <= Date.now()) {
        set.status = 404; return { error: 'Result not found' };
      }
      const bytes = await storage.get(job.outputPath);
      const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      return new Response(body, { headers: {
        'content-type': 'audio/ogg; codecs=opus', 'content-length': String(bytes.byteLength),
        'content-disposition': `attachment; filename="${job.id}.ogg"`, 'cache-control': 'private, no-store',
      } });
    })
    .onError(({ code, error, set }) => {
      if (code === 'NOT_FOUND') { set.status = 404; return { error: 'Route not found' }; }
      console.error(error); set.status = 500; return { error: 'Internal server error' };
    });
}
