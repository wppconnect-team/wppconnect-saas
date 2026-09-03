import postgres from 'postgres';
import { hashToken } from './security';

export type JobKind = 'conversion' | 'transcription';
export type JobStatus = 'staging' | 'queued' | 'processing' | 'succeeded' | 'failed' | 'expired';

export type MediaJob = {
  id: string; workspaceId: string; idempotencyKey: string; kind: JobKind; status: JobStatus;
  sourceType: 'upload' | 'url'; sourceUrl: string | null; sourceFilename: string | null;
  inputMime: string | null; inputPath: string | null; outputPath: string | null;
  language: string | null; webhookUrl: string | null; result: Record<string, unknown>;
  errorCode: string | null; errorMessage: string | null; inputBytes: string | null;
  outputBytes: string | null; durationSeconds: string | null; retainUntil: Date;
  createdAt: Date; completedAt: Date | null;
};

export type NewJob = Pick<MediaJob, 'id' | 'workspaceId' | 'idempotencyKey' | 'kind' | 'sourceType'> & {
  sourceUrl?: string; sourceFilename?: string; inputMime?: string; inputPath?: string;
  language?: string; webhookUrl?: string; inputBytes?: number; retainUntil: Date;
};

export interface MediaRepository {
  authenticate(token: string): Promise<{ workspaceId: string; scopes: string[] } | null>;
  createJob(input: NewJob): Promise<{ job: MediaJob; duplicate: boolean }>;
  queueJob(id: string): Promise<void>;
  getJob(workspaceId: string, id: string): Promise<MediaJob | null>;
  getJobById(id: string): Promise<MediaJob | null>;
  claimJob(): Promise<MediaJob | null>;
  updateInput(id: string, inputPath: string, bytes: number, mime: string | null): Promise<void>;
  completeJob(id: string, data: { result: Record<string, unknown>; outputPath?: string; outputBytes?: number; durationSeconds: number }): Promise<void>;
  failJob(id: string, code: string, message: string): Promise<void>;
  queueWebhook(id: string, event: string): Promise<void>;
  dueWebhooks(limit: number): Promise<Array<{ id: string; event: string; attemptCount: number; job: MediaJob }>>;
  finishWebhook(id: string, result: { delivered: boolean; statusCode?: number; error?: string; retryAt?: Date }): Promise<void>;
  expireJobs(limit: number): Promise<string[]>;
  recordUsage(job: MediaJob, durationSeconds: number): Promise<void>;
  close(): Promise<void>;
}

const JOB_COLUMNS = `
  id, workspace_id AS "workspaceId", idempotency_key AS "idempotencyKey", kind, status,
  source_type AS "sourceType", source_url AS "sourceUrl", source_filename AS "sourceFilename",
  input_mime AS "inputMime", input_path AS "inputPath", output_path AS "outputPath",
  language, webhook_url AS "webhookUrl", result, error_code AS "errorCode",
  error_message AS "errorMessage", input_bytes::text AS "inputBytes",
  output_bytes::text AS "outputBytes", duration_seconds::text AS "durationSeconds",
  retain_until AS "retainUntil", created_at AS "createdAt", completed_at AS "completedAt"
`;

export class PostgresMediaRepository implements MediaRepository {
  private sql: postgres.Sql;
  constructor(databaseUrl: string) { this.sql = postgres(databaseUrl, { max: 10, idle_timeout: 20 }); }

  async authenticate(token: string) {
    if (!token.startsWith('wpp_')) return null;
    const [row] = await this.sql<{ workspaceId: string; scopes: string[] }[]>`
      UPDATE api_tokens SET last_used_at = NOW(), updated_at = NOW()
      WHERE token_hash = ${hashToken(token)} AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > NOW())
      RETURNING workspace_id AS "workspaceId", scopes`;
    return row ?? null;
  }

  async createJob(input: NewJob) {
    const [created] = await this.sql<MediaJob[]>`
      INSERT INTO media_jobs (
        id, workspace_id, idempotency_key, kind, status, source_type, source_url, source_filename,
        input_mime, input_path, language, webhook_url, input_bytes, retain_until
      ) VALUES (
        ${input.id}, ${input.workspaceId}, ${input.idempotencyKey}, ${input.kind},
        ${input.sourceType === 'upload' ? 'staging' : 'queued'}, ${input.sourceType},
        ${input.sourceUrl ?? null}, ${input.sourceFilename ?? null}, ${input.inputMime ?? null},
        ${input.inputPath ?? null}, ${input.language ?? null}, ${input.webhookUrl ?? null},
        ${input.inputBytes ?? null}, ${input.retainUntil}
      ) ON CONFLICT (workspace_id, idempotency_key) DO NOTHING
      RETURNING ${this.sql.unsafe(JOB_COLUMNS)}`;
    if (created) return { job: created, duplicate: false };
    const [existing] = await this.sql<MediaJob[]>`
      SELECT ${this.sql.unsafe(JOB_COLUMNS)} FROM media_jobs
      WHERE workspace_id = ${input.workspaceId} AND idempotency_key = ${input.idempotencyKey}`;
    if (!existing) throw new Error('Idempotent media job could not be read');
    return { job: existing, duplicate: true };
  }

  async queueJob(id: string) {
    await this.sql`UPDATE media_jobs SET status='queued', updated_at=NOW() WHERE id=${id} AND status='staging'`;
  }

  async getJob(workspaceId: string, id: string) {
    const [row] = await this.sql<MediaJob[]>`SELECT ${this.sql.unsafe(JOB_COLUMNS)} FROM media_jobs WHERE id = ${id} AND workspace_id = ${workspaceId}`;
    return row ?? null;
  }
  async getJobById(id: string) {
    const [row] = await this.sql<MediaJob[]>`SELECT ${this.sql.unsafe(JOB_COLUMNS)} FROM media_jobs WHERE id = ${id}`;
    return row ?? null;
  }

  async claimJob() {
    return this.sql.begin(async (tx) => {
      const [candidate] = await tx<{ id: string }[]>`
        SELECT id FROM media_jobs WHERE status = 'queued' ORDER BY created_at
        FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!candidate) return null;
      const [job] = await tx<MediaJob[]>`
        UPDATE media_jobs SET status = 'processing', attempts = attempts + 1,
          processing_started_at = NOW(), updated_at = NOW()
        WHERE id = ${candidate.id} RETURNING ${tx.unsafe(JOB_COLUMNS)}`;
      return job ?? null;
    });
  }

  async updateInput(id: string, inputPath: string, bytes: number, mime: string | null) {
    await this.sql`UPDATE media_jobs SET input_path=${inputPath}, input_bytes=${bytes},
      input_mime=COALESCE(input_mime, ${mime}), updated_at=NOW() WHERE id=${id}`;
  }
  async completeJob(id: string, data: { result: Record<string, unknown>; outputPath?: string; outputBytes?: number; durationSeconds: number }) {
    await this.sql`UPDATE media_jobs SET status='succeeded', result=${this.sql.json(data.result as Parameters<typeof this.sql.json>[0])},
      output_path=${data.outputPath ?? null}, output_bytes=${data.outputBytes ?? null},
      duration_seconds=${data.durationSeconds}, completed_at=NOW(), updated_at=NOW()
      WHERE id=${id}`;
  }
  async failJob(id: string, code: string, message: string) {
    await this.sql`UPDATE media_jobs SET status='failed', error_code=${code},
      error_message=${message.slice(0, 2000)}, completed_at=NOW(), updated_at=NOW() WHERE id=${id}`;
  }
  async queueWebhook(id: string, event: string) {
    await this.sql`INSERT INTO media_webhook_deliveries (job_id, event) VALUES (${id}, ${event}) ON CONFLICT DO NOTHING`;
  }
  async dueWebhooks(limit: number) {
    const rows = await this.sql<Array<{ id: string; event: string; attemptCount: number; jobId: string }>>`
      UPDATE media_webhook_deliveries delivery
      SET next_attempt_at = NOW() + INTERVAL '5 minutes', updated_at = NOW()
      WHERE delivery.id IN (
        SELECT id FROM media_webhook_deliveries
        WHERE status IN ('pending','failed') AND next_attempt_at <= NOW() AND attempt_count < 8
        ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT ${limit}
      )
      RETURNING delivery.id, delivery.event, delivery.attempt_count AS "attemptCount",
                delivery.job_id AS "jobId"`;
    const output: Array<{ id: string; event: string; attemptCount: number; job: MediaJob }> = [];
    for (const row of rows) {
      const job = await this.getJobById(row.jobId);
      if (job) output.push({ id: row.id, event: row.event, attemptCount: row.attemptCount, job });
    }
    return output;
  }
  async finishWebhook(id: string, result: { delivered: boolean; statusCode?: number; error?: string; retryAt?: Date }) {
    await this.sql`UPDATE media_webhook_deliveries SET
      status=${result.delivered ? 'delivered' : 'failed'}, attempt_count=attempt_count+1,
      last_status_code=${result.statusCode ?? null}, last_error=${result.error?.slice(0, 2000) ?? null},
      next_attempt_at=${result.retryAt ?? new Date()}, delivered_at=${result.delivered ? new Date() : null}, updated_at=NOW()
      WHERE id=${id}`;
  }
  async expireJobs(limit: number) {
    const rows = await this.sql<{ id: string }[]>`
      UPDATE media_jobs SET status='expired', input_path=NULL, output_path=NULL, result='{}', updated_at=NOW()
      WHERE id IN (SELECT id FROM media_jobs WHERE retain_until < NOW() AND status <> 'expired' LIMIT ${limit})
      RETURNING id`;
    return rows.map((row) => row.id);
  }
  async recordUsage(job: MediaJob, durationSeconds: number) {
    await this.sql`INSERT INTO usage_events (workspace_id, product, meter, quantity, idempotency_key, dimensions, occurred_at)
      VALUES (${job.workspaceId}, 'media-api', 'audio.seconds', ${Math.max(1, Math.ceil(durationSeconds))},
        ${`media:${job.id}`}, ${this.sql.json({ kind: job.kind })}, NOW()) ON CONFLICT DO NOTHING`;
  }
  async close() { await this.sql.end(); }
}
