import { randomBytes } from 'crypto';
import { Elysia, t } from 'elysia';
import type postgres from 'postgres';
import { sql } from '../db';
import { authPlugin } from '../plugins/auth';
import {
  COMPATIBILITY_EVENTS,
  canonicalJson,
  type CompatibilityEvent,
  type CompatibilityMonitorSnapshot,
  type CompatibilitySignal,
  transitionCompatibilityMonitor,
  verifyCompatibilitySignature,
} from '../lib/compatibility';
import { encryptSecret } from '../lib/encryptedSecret';
import { isPrivateUrl } from '../lib/urlSafety';
import { acceptsBearerSecret } from '../lib/internalAuth';
import { processCompatibilityWebhookBatch } from '../workers/compatibilityWebhookWorker';

interface MonitorRow {
  status: 'passing' | 'failing' | 'unknown';
  consecutiveFailures: number;
  currentIncidentId: string | null;
  lastObservedAt: string | null;
}

interface IncidentRow {
  id: string;
  monitorKey: string;
  project: string;
  severity: 'warning' | 'critical';
  status: 'open' | 'resolved';
  whatsappVersion: string | null;
  affectedCapabilities: string[];
  evidenceUrl: string | null;
  openedAt: string;
  lastObservedAt: string;
  resolvedAt: string | null;
}

async function hasWebhookEntitlement(workspaceId: string): Promise<boolean> {
  const [entitlement] = await sql`
    SELECT id
    FROM product_entitlements
    WHERE workspace_id = ${workspaceId}
      AND product = 'compatibility-monitor'
      AND entitlement = 'signed-webhooks'
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > NOW())
  `;
  return Boolean(entitlement);
}

function incidentPayload(event: CompatibilityEvent, incident: IncidentRow) {
  return {
    schemaVersion: '1',
    event,
    incident: {
      id: incident.id,
      monitorKey: incident.monitorKey,
      project: incident.project,
      severity: incident.severity,
      status: incident.status,
      whatsappVersion: incident.whatsappVersion,
      affectedCapabilities: incident.affectedCapabilities,
      evidenceUrl: incident.evidenceUrl,
      openedAt: incident.openedAt,
      lastObservedAt: incident.lastObservedAt,
      resolvedAt: incident.resolvedAt,
    },
  };
}

async function queueIncidentEvent(
  tx: postgres.TransactionSql,
  event: CompatibilityEvent,
  incident: IncidentRow
) {
  const payload = incidentPayload(event, incident);
  await tx`
    INSERT INTO compatibility_webhook_deliveries (endpoint_id, incident_id, event, payload)
    SELECT id, ${incident.id}, ${event}, ${tx.json(payload)}
    FROM compatibility_webhook_endpoints
    WHERE status = 'active'
      AND ${event} = ANY(events)
  `;
}

const signalSchema = t.Object({
  schemaVersion: t.Literal('1'),
  idempotencyKey: t.String({ minLength: 1, maxLength: 200 }),
  monitorKey: t.String({ minLength: 1, maxLength: 160 }),
  project: t.String({ minLength: 1, maxLength: 160 }),
  status: t.Union([t.Literal('passing'), t.Literal('failing'), t.Literal('unknown')]),
  severity: t.Union([t.Literal('warning'), t.Literal('critical')]),
  observedAt: t.String({ format: 'date-time' }),
  whatsappVersion: t.Optional(t.String({ maxLength: 80 })),
  affectedCapabilities: t.Array(t.String({ minLength: 1, maxLength: 120 }), { maxItems: 50 }),
  evidenceUrl: t.Optional(t.String({ format: 'uri', maxLength: 2048 })),
});

export const internalCompatibilityRoutes = new Elysia({ prefix: '/api/internal/compatibility' })
  .post('/signals',
    async ({ body, request, set }) => {
      const secret = process.env.COMPATIBILITY_INGEST_SECRET ?? '';
      if (!secret) {
        set.status = 503;
        return { error: 'Compatibility ingest is not configured' };
      }

      const timestamp = Number(request.headers.get('x-wppconnect-timestamp'));
      const signature = request.headers.get('x-wppconnect-signature') ?? '';
      if (!verifyCompatibilitySignature(secret, timestamp, body, signature)) {
        set.status = 401;
        return { error: 'Invalid or expired signature' };
      }

      const signal = body as CompatibilitySignal;
      const result = await sql.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(hashtext(${signal.idempotencyKey}))`;
        await tx`SELECT pg_advisory_xact_lock(hashtext(${signal.monitorKey}))`;

        const [duplicate] = await tx<{ id: string }[]>`
          SELECT id FROM compatibility_signals
          WHERE idempotency_key = ${signal.idempotencyKey}
        `;
        if (duplicate) {
          return { duplicate: true, stale: false, event: null, incidentId: null };
        }

        const [monitor] = await tx<MonitorRow[]>`
          SELECT
            status,
            consecutive_failures AS "consecutiveFailures",
            current_incident_id AS "currentIncidentId",
            last_observed_at AS "lastObservedAt"
          FROM compatibility_monitors
          WHERE monitor_key = ${signal.monitorKey}
          FOR UPDATE
        `;

        const previous: CompatibilityMonitorSnapshot = monitor
          ? {
              status: monitor.status,
              consecutiveFailures: monitor.consecutiveFailures,
              hasOpenIncident: Boolean(monitor.currentIncidentId),
            }
          : { status: 'unknown', consecutiveFailures: 0, hasOpenIncident: false };

        await tx`
          INSERT INTO compatibility_signals (
            idempotency_key, monitor_key, project, status, severity,
            whatsapp_version, affected_capabilities, evidence_url, observed_at, payload
          ) VALUES (
            ${signal.idempotencyKey}, ${signal.monitorKey}, ${signal.project}, ${signal.status},
            ${signal.severity}, ${signal.whatsappVersion ?? null}, ${signal.affectedCapabilities},
            ${signal.evidenceUrl ?? null}, ${signal.observedAt}, ${tx.json(JSON.parse(canonicalJson(signal)))}
          )
        `;

        if (monitor?.lastObservedAt && Date.parse(signal.observedAt) <= Date.parse(monitor.lastObservedAt)) {
          return {
            duplicate: false,
            stale: true,
            event: null,
            incidentId: monitor.currentIncidentId,
          };
        }

        const transition = transitionCompatibilityMonitor(previous, signal.status);

        let incident: IncidentRow | undefined;
        let incidentId = monitor?.currentIncidentId ?? null;

        if (transition.event === 'compatibility.incident.opened') {
          [incident] = await tx<IncidentRow[]>`
            INSERT INTO compatibility_incidents (
              monitor_key, project, severity, status, whatsapp_version,
              affected_capabilities, evidence_url, opened_at, last_observed_at
            ) VALUES (
              ${signal.monitorKey}, ${signal.project}, ${signal.severity}, 'open',
              ${signal.whatsappVersion ?? null}, ${signal.affectedCapabilities},
              ${signal.evidenceUrl ?? null}, ${signal.observedAt}, ${signal.observedAt}
            )
            RETURNING
              id, monitor_key AS "monitorKey", project, severity, status,
              whatsapp_version AS "whatsappVersion",
              affected_capabilities AS "affectedCapabilities",
              evidence_url AS "evidenceUrl", opened_at AS "openedAt",
              last_observed_at AS "lastObservedAt", resolved_at AS "resolvedAt"
          `;
          incidentId = incident.id;
        } else if (transition.event === 'compatibility.incident.updated' && incidentId) {
          [incident] = await tx<IncidentRow[]>`
            UPDATE compatibility_incidents
            SET severity = ${signal.severity},
                whatsapp_version = ${signal.whatsappVersion ?? null},
                affected_capabilities = ${signal.affectedCapabilities},
                evidence_url = ${signal.evidenceUrl ?? null},
                last_observed_at = ${signal.observedAt},
                updated_at = NOW()
            WHERE id = ${incidentId} AND status = 'open'
            RETURNING
              id, monitor_key AS "monitorKey", project, severity, status,
              whatsapp_version AS "whatsappVersion",
              affected_capabilities AS "affectedCapabilities",
              evidence_url AS "evidenceUrl", opened_at AS "openedAt",
              last_observed_at AS "lastObservedAt", resolved_at AS "resolvedAt"
          `;
        } else if (transition.event === 'compatibility.incident.resolved' && incidentId) {
          [incident] = await tx<IncidentRow[]>`
            UPDATE compatibility_incidents
            SET status = 'resolved', resolved_at = ${signal.observedAt},
                last_observed_at = ${signal.observedAt}, updated_at = NOW()
            WHERE id = ${incidentId} AND status = 'open'
            RETURNING
              id, monitor_key AS "monitorKey", project, severity, status,
              whatsapp_version AS "whatsappVersion",
              affected_capabilities AS "affectedCapabilities",
              evidence_url AS "evidenceUrl", opened_at AS "openedAt",
              last_observed_at AS "lastObservedAt", resolved_at AS "resolvedAt"
          `;
          incidentId = null;
        }

        await tx`
          INSERT INTO compatibility_monitors (
            monitor_key, project, status, consecutive_failures,
            current_incident_id, last_idempotency_key, last_observed_at
          ) VALUES (
            ${signal.monitorKey}, ${signal.project}, ${transition.status},
            ${transition.consecutiveFailures}, ${incidentId}, ${signal.idempotencyKey},
            ${signal.observedAt}
          )
          ON CONFLICT (monitor_key) DO UPDATE SET
            project = EXCLUDED.project,
            status = EXCLUDED.status,
            consecutive_failures = EXCLUDED.consecutive_failures,
            current_incident_id = EXCLUDED.current_incident_id,
            last_idempotency_key = EXCLUDED.last_idempotency_key,
            last_observed_at = EXCLUDED.last_observed_at,
            updated_at = NOW()
        `;

        if (transition.event && incident) {
          await queueIncidentEvent(tx, transition.event, incident);
        }

        return {
          duplicate: false,
          stale: false,
          event: transition.event,
          incidentId: incident?.id ?? null,
        };
      });

      set.status = result.duplicate ? 200 : 202;
      return result;
    },
    { body: signalSchema }
  )
  .get('/deliveries/drain', async ({ request, set }) => {
    if (!acceptsBearerSecret(request.headers.get('authorization'), process.env.CRON_SECRET ?? '')) {
      set.status = 401;
      return { error: 'Invalid cron credential' };
    }
    const processed = await processCompatibilityWebhookBatch(25);
    return { processed };
  });

export const compatibilityRoutes = new Elysia({ prefix: '/api/compatibility' })
  .use(authPlugin)
  .get('/incidents',
    async ({ query }) => {
      const rows = await sql`
        SELECT
          id, monitor_key AS "monitorKey", project, severity, status,
          whatsapp_version AS "whatsappVersion",
          affected_capabilities AS "affectedCapabilities",
          evidence_url AS "evidenceUrl", opened_at AS "openedAt",
          last_observed_at AS "lastObservedAt", resolved_at AS "resolvedAt"
        FROM compatibility_incidents
        WHERE (${query.status ?? null}::text IS NULL OR status = ${query.status ?? null}::text)
        ORDER BY last_observed_at DESC
        LIMIT ${query.limit ?? 50}
      `;
      return { data: rows };
    },
    {
      query: t.Object({
        status: t.Optional(t.Union([t.Literal('open'), t.Literal('resolved')])),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 200 })),
      }),
    }
  )
  .get('/webhooks', async ({ workspaceId, set }) => {
    if (!(await hasWebhookEntitlement(workspaceId))) {
      set.status = 403;
      return { error: 'Recurso não habilitado para este workspace' };
    }
    const rows = await sql`
      SELECT id, url, description, events, status, created_at AS "createdAt"
      FROM compatibility_webhook_endpoints
      WHERE workspace_id = ${workspaceId}
      ORDER BY created_at DESC
    `;
    return { data: rows };
  })
  .get('/webhooks/:id/deliveries',
    async ({ params, query, workspaceId, set }) => {
      if (!(await hasWebhookEntitlement(workspaceId))) {
        set.status = 403;
        return { error: 'Recurso não habilitado para este workspace' };
      }
      const [endpoint] = await sql`
        SELECT id
        FROM compatibility_webhook_endpoints
        WHERE id = ${params.id} AND workspace_id = ${workspaceId}
      `;
      if (!endpoint) {
        set.status = 404;
        return { error: 'Webhook de compatibilidade não encontrado' };
      }

      const rows = await sql`
        SELECT
          id, incident_id AS "incidentId", event, status, attempts,
          response_status AS "responseStatus", last_error AS "lastError",
          next_attempt_at AS "nextAttemptAt", delivered_at AS "deliveredAt",
          created_at AS "createdAt"
        FROM compatibility_webhook_deliveries
        WHERE endpoint_id = ${params.id}
        ORDER BY created_at DESC
        LIMIT ${query.limit ?? 50}
      `;
      return { data: rows };
    },
    {
      query: t.Object({
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 200 })),
      }),
    }
  )
  .post('/webhooks',
    async ({ body, workspaceId, set }) => {
      if (!(await hasWebhookEntitlement(workspaceId))) {
        set.status = 403;
        return { error: 'Recurso não habilitado para este workspace' };
      }
      if (isPrivateUrl(body.url)) {
        set.status = 422;
        return { error: 'URL inválida. Endereços de rede privada não são permitidos.' };
      }

      const signingSecret = `whsec_${randomBytes(32).toString('base64url')}`;
      let encryptedSecret: string;
      try {
        encryptedSecret = encryptSecret(signingSecret);
      } catch (error) {
        set.status = 503;
        return { error: 'Webhook encryption is not configured', detail: String(error) };
      }

      const [endpoint] = await sql`
        INSERT INTO compatibility_webhook_endpoints (
          workspace_id, url, description, events, encrypted_signing_secret
        ) VALUES (
          ${workspaceId}, ${body.url}, ${body.description ?? ''}, ${body.events}, ${encryptedSecret}
        )
        RETURNING id, url, description, events, status, created_at AS "createdAt"
      `;
      set.status = 201;
      return { data: { ...endpoint, signingSecret } };
    },
    {
      body: t.Object({
        url: t.String({ format: 'uri', maxLength: 2048 }),
        description: t.Optional(t.String({ maxLength: 120 })),
        events: t.Array(t.Union(COMPATIBILITY_EVENTS.map((event) => t.Literal(event))), {
          minItems: 1,
          maxItems: COMPATIBILITY_EVENTS.length,
          uniqueItems: true,
        }),
      }),
    }
  )
  .delete('/webhooks/:id', async ({ params, workspaceId, set }) => {
    if (!(await hasWebhookEntitlement(workspaceId))) {
      set.status = 403;
      return { error: 'Recurso não habilitado para este workspace' };
    }
    const [endpoint] = await sql`
      UPDATE compatibility_webhook_endpoints
      SET status = 'disabled', updated_at = NOW()
      WHERE id = ${params.id} AND workspace_id = ${workspaceId}
      RETURNING id
    `;
    if (!endpoint) {
      set.status = 404;
      return { error: 'Webhook de compatibilidade não encontrado' };
    }
    set.status = 204;
    return null;
  })
  .post('/deliveries/:id/replay', async ({ params, workspaceId, set }) => {
    if (!(await hasWebhookEntitlement(workspaceId))) {
      set.status = 403;
      return { error: 'Recurso não habilitado para este workspace' };
    }
    const [delivery] = await sql`
      UPDATE compatibility_webhook_deliveries delivery
      SET status = 'pending', attempts = 0, next_attempt_at = NOW(),
          response_status = NULL, last_error = NULL, delivered_at = NULL,
          updated_at = NOW()
      FROM compatibility_webhook_endpoints endpoint
      WHERE delivery.id = ${params.id}
        AND endpoint.id = delivery.endpoint_id
        AND endpoint.workspace_id = ${workspaceId}
        AND endpoint.status = 'active'
        AND delivery.status IN ('delivered', 'failed')
      RETURNING delivery.id
    `;
    if (!delivery) {
      set.status = 404;
      return { error: 'Entrega finalizada e elegível para replay não encontrada' };
    }
    set.status = 202;
    return { data: { id: delivery.id, status: 'pending' } };
  });
