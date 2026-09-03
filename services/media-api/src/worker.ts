import type { MediaConfig } from './config';
import { convertToPtt, probeFile, transcribeAudio, withPlainInput } from './media';
import type { MediaJob, MediaRepository } from './repository';
import { downloadBounded } from './remote';
import { assertPublicHttpsUrl, signPayload, signResult } from './security';
import { EncryptedStorage } from './storage';

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) return String(error.code);
  const message = String(error).toLowerCase();
  if (message.includes('duration')) return 'duration_limit';
  if (message.includes('size limit') || message.includes('exceeds')) return 'size_limit';
  if (message.includes('ffmpeg') || message.includes('ffprobe')) return 'invalid_media';
  return 'processing_failed';
}

export function publicJob(job: MediaJob, config: MediaConfig) {
  const expires = Math.min(Math.floor(job.retainUntil.getTime() / 1000), Math.floor(Date.now() / 1000) + 900);
  const resultUrl = job.status === 'succeeded' && job.outputPath
    ? `${config.publicUrl}/v1/jobs/${job.id}/content?expires=${expires}&signature=${signResult(config.resultSigningSecret, job.id, expires)}`
    : null;
  return {
    id: job.id, kind: job.kind, status: job.status, result: job.result,
    error: job.errorCode ? { code: job.errorCode, message: job.errorMessage } : null,
    inputBytes: job.inputBytes ? Number(job.inputBytes) : null,
    outputBytes: job.outputBytes ? Number(job.outputBytes) : null,
    durationSeconds: job.durationSeconds ? Number(job.durationSeconds) : null,
    resultUrl, retainUntil: job.retainUntil, createdAt: job.createdAt, completedAt: job.completedAt,
  };
}

export class MediaWorker {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(private repo: MediaRepository, private storage: EncryptedStorage, private config: MediaConfig) {}

  async processOne(): Promise<boolean> {
    const job = await this.repo.claimJob();
    if (!job) return false;
    try {
      let input: Buffer;
      if (job.inputPath) input = await this.storage.get(job.inputPath);
      else if (job.sourceUrl) {
        const downloaded = await downloadBounded(job.sourceUrl, this.config.maxBytes);
        input = downloaded.bytes;
        const path = this.storage.path(job.id, 'input');
        await this.storage.put(path, input);
        await this.repo.updateInput(job.id, path, input.byteLength, downloaded.mime);
      } else throw new Error('Job has no input');
      if (input.byteLength > this.config.maxBytes) throw new Error('Source exceeds the configured size limit');

      if (job.kind === 'conversion') {
        const converted = await convertToPtt(input, job.sourceFilename ?? 'input.bin', this.config.maxDurationSeconds);
        const outputPath = this.storage.path(job.id, 'output');
        await this.storage.put(outputPath, converted.bytes);
        await this.repo.completeJob(job.id, {
          outputPath, outputBytes: converted.bytes.byteLength, durationSeconds: converted.probe.durationSeconds,
          result: { format: 'ogg', codec: 'opus', mimeType: 'audio/ogg; codecs=opus' },
        });
        try { await this.repo.recordUsage(job, converted.probe.durationSeconds); }
        catch (error) { console.error('Could not record conversion usage', error); }
      } else {
        const probe = await withPlainInput(input, job.sourceFilename ?? 'input.bin', (path) => probeFile(path));
        if (probe.durationSeconds > this.config.maxDurationSeconds) throw new Error('Audio exceeds the configured duration limit');
        const result = await transcribeAudio(input, job.sourceFilename ?? 'audio.ogg', {
          baseUrl: this.config.transcriptionBaseUrl, apiKey: this.config.transcriptionApiKey,
          model: this.config.transcriptionModel, language: job.language ?? undefined,
        });
        await this.repo.completeJob(job.id, { result, durationSeconds: probe.durationSeconds });
        try { await this.repo.recordUsage(job, probe.durationSeconds); }
        catch (error) { console.error('Could not record transcription usage', error); }
      }
      if (job.webhookUrl) {
        try { await this.repo.queueWebhook(job.id, 'media.job.succeeded'); }
        catch (error) { console.error('Could not queue success webhook', error); }
      }
    } catch (error) {
      await this.repo.failJob(job.id, errorCode(error), error instanceof Error ? error.message : String(error));
      if (job.webhookUrl) {
        try { await this.repo.queueWebhook(job.id, 'media.job.failed'); }
        catch (webhookError) { console.error('Could not queue failure webhook', webhookError); }
      }
    }
    return true;
  }

  async deliverWebhooks(): Promise<number> {
    const due = await this.repo.dueWebhooks(20);
    for (const delivery of due) {
      const body = JSON.stringify({ id: delivery.id, event: delivery.event, data: publicJob(delivery.job, this.config) });
      const timestamp = Math.floor(Date.now() / 1000);
      try {
        await assertPublicHttpsUrl(delivery.job.webhookUrl!);
        const response = await fetch(delivery.job.webhookUrl!, {
          method: 'POST', signal: AbortSignal.timeout(10_000),
          headers: { 'content-type': 'application/json', 'idempotency-key': delivery.id,
            'x-wppconnect-signature': signPayload(this.config.webhookSigningSecret, timestamp, body) },
          body,
        });
        if (!response.ok) throw Object.assign(new Error(`Webhook returned ${response.status}`), { status: response.status });
        await this.repo.finishWebhook(delivery.id, { delivered: true, statusCode: response.status });
      } catch (error) {
        const retrySeconds = Math.min(3600, 2 ** delivery.attemptCount * 15);
        await this.repo.finishWebhook(delivery.id, { delivered: false,
          statusCode: error && typeof error === 'object' && 'status' in error ? Number(error.status) : undefined,
          error: String(error), retryAt: new Date(Date.now() + retrySeconds * 1000) });
      }
    }
    return due.length;
  }

  async cleanup(): Promise<number> {
    const ids = await this.repo.expireJobs(100);
    await Promise.all(ids.map((id) => this.storage.removeJob(id)));
    return ids.length;
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      for (let i = 0; i < 4 && await this.processOne(); i++);
      await this.deliverWebhooks();
      await this.cleanup();
    } finally { this.running = false; }
  }
  start() { this.timer = setInterval(() => void this.tick(), 1000); void this.tick(); }
  stop() { if (this.timer) clearInterval(this.timer); }
}
