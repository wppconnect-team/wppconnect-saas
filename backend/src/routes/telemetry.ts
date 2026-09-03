import { Elysia, t } from 'elysia';
import { sql } from '../db';
import { acceptsBearerSecret } from '../lib/internalAuth';
import { parseTelemetryBatch, type TelemetrySnapshot } from '../lib/telemetry';
import { grantsScope } from '../lib/platform';
import { apiKeyPlugin } from '../plugins/apiKeyAuth';
import { authPlugin } from '../plugins/auth';

async function bodyBytes(body: unknown, request: Request): Promise<Uint8Array> {
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  if (typeof body === 'string') return new TextEncoder().encode(body);
  if (body && typeof body === 'object') return new TextEncoder().encode(JSON.stringify(body));
  return new Uint8Array(await request.arrayBuffer());
}

function scalar(snapshot: TelemetrySnapshot, key: keyof TelemetrySnapshot['counters']) {
  return snapshot.counters[key] ?? 0;
}

export const telemetryIngestRoutes = new Elysia({ prefix: '/api/v1/telemetry' })
  .use(apiKeyPlugin)
  .post('/snapshots', async ({ body, request, apiWorkspaceId, apiScopes, set }) => {
    if (!grantsScope(apiScopes, 'telemetry:write')) {
      set.status = 403;
      return { error: 'A chave não possui o escopo telemetry:write' };
    }
    let snapshots: TelemetrySnapshot[];
    try {
      snapshots = parseTelemetryBatch(await bodyBytes(body, request), request.headers.get('content-encoding'));
    } catch (error) {
      set.status = 422;
      return { error: error instanceof Error ? error.message : String(error) };
    }

    const result = await sql.begin(async (tx) => {
      let accepted = 0;
      let duplicates = 0;
      for (const snapshot of snapshots) {
        const [row] = await tx`
          INSERT INTO telemetry_snapshots (
            workspace_id, source_id, idempotency_key, schema_version, sdk_version, wa_version,
            observed_from, observed_to, messages_sent, messages_received, messages_deleted,
            errors_total, response_latency_sum_ms, response_latency_count,
            connected_seconds, observed_seconds, function_metrics
          ) VALUES (
            ${apiWorkspaceId}, ${snapshot.sourceId}, ${snapshot.idempotencyKey}, ${snapshot.schemaVersion},
            ${snapshot.sdkVersion ?? null}, ${snapshot.waVersion ?? null}, ${snapshot.observedFrom},
            ${snapshot.observedTo}, ${scalar(snapshot, 'messages.sent')},
            ${scalar(snapshot, 'messages.received')}, ${scalar(snapshot, 'messages.deleted')},
            ${scalar(snapshot, 'errors.total')}, ${snapshot.responseLatency.sumMs},
            ${snapshot.responseLatency.count}, ${snapshot.availability.connectedSeconds},
            ${snapshot.availability.observedSeconds},
            ${tx.json(snapshot.functions as Parameters<typeof tx.json>[0])}
          ) ON CONFLICT (workspace_id, idempotency_key) DO NOTHING RETURNING id
        `;
        if (row) accepted++; else duplicates++;
      }
      return { accepted, duplicates };
    });
    set.status = result.accepted ? 202 : 200;
    return result;
  });

export const telemetryRoutes = new Elysia({ prefix: '/api/telemetry' })
  .use(authPlugin)
  .get('/summary', async ({ workspaceId, query }) => {
    const since = new Date(Date.now() - Number(query.days ?? 7) * 86_400_000);
    const [totals] = await sql<{
      sent: string; received: string; deleted: string; errors: string;
      latencySum: number; latencyCount: string; connected: string; observed: string; snapshots: string;
    }[]>`
      SELECT COALESCE(SUM(messages_sent),0)::text AS sent,
        COALESCE(SUM(messages_received),0)::text AS received,
        COALESCE(SUM(messages_deleted),0)::text AS deleted,
        COALESCE(SUM(errors_total),0)::text AS errors,
        COALESCE(SUM(response_latency_sum_ms),0)::float8 AS "latencySum",
        COALESCE(SUM(response_latency_count),0)::text AS "latencyCount",
        COALESCE(SUM(connected_seconds),0)::text AS connected,
        COALESCE(SUM(observed_seconds),0)::text AS observed,
        COUNT(*)::text AS snapshots
      FROM telemetry_snapshots WHERE workspace_id=${workspaceId} AND observed_to >= ${since}`;
    const functions = await sql`
      SELECT metric->>'name' AS name,
        SUM((metric->>'calls')::bigint)::text AS calls,
        SUM((metric->>'errors')::bigint)::text AS errors,
        SUM((metric->>'durationMsSum')::float8)::float8 AS "durationMsSum"
      FROM telemetry_snapshots snapshot,
        LATERAL jsonb_array_elements(snapshot.function_metrics) metric
      WHERE snapshot.workspace_id=${workspaceId} AND snapshot.observed_to >= ${since}
      GROUP BY metric->>'name' ORDER BY SUM((metric->>'errors')::bigint) DESC,
        SUM((metric->>'calls')::bigint) DESC LIMIT 50`;
    const latencyCount = Number(totals.latencyCount);
    const observed = Number(totals.observed);
    return { data: {
      periodDays: Number(query.days ?? 7), snapshots: Number(totals.snapshots),
      messages: { sent: Number(totals.sent), received: Number(totals.received), deleted: Number(totals.deleted) },
      errors: Number(totals.errors), averageResponseMs: latencyCount ? totals.latencySum / latencyCount : null,
      availabilityPercent: observed ? Number(totals.connected) / observed * 100 : null, functions,
    } };
  }, { query: t.Object({ days: t.Optional(t.Numeric({ minimum: 1, maximum: 365 })) }) })
  .get('/settings', async ({ workspaceId }) => {
    const [settings] = await sql`
      INSERT INTO telemetry_settings (workspace_id) VALUES (${workspaceId})
      ON CONFLICT (workspace_id) DO UPDATE SET workspace_id=EXCLUDED.workspace_id
      RETURNING retention_days AS "retentionDays", updated_at AS "updatedAt"`;
    return { data: settings };
  })
  .put('/settings', async ({ workspaceId, body }) => {
    const [settings] = await sql`
      INSERT INTO telemetry_settings (workspace_id, retention_days) VALUES (${workspaceId}, ${body.retentionDays})
      ON CONFLICT (workspace_id) DO UPDATE SET retention_days=EXCLUDED.retention_days, updated_at=NOW()
      RETURNING retention_days AS "retentionDays", updated_at AS "updatedAt"`;
    return { data: settings };
  }, { body: t.Object({ retentionDays: t.Integer({ minimum: 1, maximum: 365 }) }) })
  .get('/export', async ({ workspaceId, query }) => {
    const since = new Date(Date.now() - Number(query.days ?? 30) * 86_400_000);
    const rows = await sql`
      SELECT id, source_id AS "sourceId", sdk_version AS "sdkVersion", wa_version AS "waVersion",
        observed_from AS "observedFrom", observed_to AS "observedTo", messages_sent AS "messagesSent",
        messages_received AS "messagesReceived", messages_deleted AS "messagesDeleted",
        errors_total AS "errorsTotal", response_latency_sum_ms AS "responseLatencySumMs",
        response_latency_count AS "responseLatencyCount", connected_seconds AS "connectedSeconds",
        observed_seconds AS "observedSeconds", function_metrics AS functions
      FROM telemetry_snapshots WHERE workspace_id=${workspaceId} AND observed_to >= ${since}
      ORDER BY observed_to DESC LIMIT 10000`;
    return { schemaVersion: '1', exportedAt: new Date().toISOString(), data: rows };
  }, { query: t.Object({ days: t.Optional(t.Numeric({ minimum: 1, maximum: 365 })) }) });

export const internalTelemetryRoutes = new Elysia({ prefix: '/api/internal/telemetry' })
  .get('/retention', async ({ request, set }) => {
    if (!acceptsBearerSecret(request.headers.get('authorization'), process.env.CRON_SECRET ?? '')) {
      set.status = 401; return { error: 'Invalid cron credential' };
    }
    const deleted = await sql`
      DELETE FROM telemetry_snapshots snapshot
      USING telemetry_settings settings
      WHERE settings.workspace_id=snapshot.workspace_id
        AND snapshot.observed_to < NOW() - settings.retention_days * INTERVAL '1 day'
      RETURNING snapshot.id`;
    const defaults = await sql`
      DELETE FROM telemetry_snapshots snapshot
      WHERE snapshot.observed_to < NOW() - INTERVAL '30 days'
        AND NOT EXISTS (SELECT 1 FROM telemetry_settings settings WHERE settings.workspace_id=snapshot.workspace_id)
      RETURNING snapshot.id`;
    return { deleted: deleted.length + defaults.length };
  });
