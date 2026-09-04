import { Elysia, t } from 'elysia';
import type postgres from 'postgres';
import { sql } from '../db';
import { authPlugin } from '../plugins/auth';
import { decryptSecret, encryptSecret } from '../lib/encryptedSecret';
import {
  createLicenseKey,
  createLicenseSigningKeys,
  installationHash,
  issueLicenseCredential,
  type LicenseClaims,
} from '../lib/licensing';
import { hashOpaqueToken } from '../lib/platform';
import {
  resolveSandboxBillingEvent,
  type LicenseBillingStatus,
  type SandboxBillingEventType,
} from '../lib/licenseBilling';
import {
  readLicenseUsage,
  recordLicenseUsage,
  resolveLicenseUsageWindow,
} from '../lib/licenseUsage';

type LicenseRow = {
  id: string; appId: string; planId: string; status: string; expiresAt: Date | null;
  maxInstallations: number; entitlements: Record<string, unknown>; limits: Record<string, unknown>;
  encryptedPrivateKey: string; offlineGraceSeconds: number;
};

type BillingLicenseRow = {
  id: string; appId: string; appStatus: string; status: LicenseBillingStatus;
  expiresAt: Date | null; billingInterval: 'month' | 'year';
};

type BillingEventRow = {
  id: string; licenseId: string; eventType: SandboxBillingEventType;
  previousStatus: LicenseBillingStatus; resultingStatus: LicenseBillingStatus;
  previousExpiresAt: Date | null; resultingExpiresAt: Date | null;
  occurredAt: Date; createdAt: Date;
};

function slugify(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'extension';
}

async function readLicense(appId: string, plainKey: string): Promise<LicenseRow | undefined> {
  const [license] = await sql<LicenseRow[]>`
    SELECT license.id, license.app_id AS "appId", license.plan_id AS "planId",
           license.status, license.expires_at AS "expiresAt",
           license.max_installations AS "maxInstallations",
           plan.entitlements, plan.limits,
           app.encrypted_private_key AS "encryptedPrivateKey",
           app.offline_grace_seconds AS "offlineGraceSeconds"
    FROM extension_licenses license
    JOIN extension_plans plan ON plan.id = license.plan_id
    JOIN extension_apps app ON app.id = license.app_id
    WHERE license.app_id = ${appId} AND license.key_hash = ${hashOpaqueToken(plainKey)}
    LIMIT 1
  `;
  return license;
}

function licenseIsUsable(license: LicenseRow): boolean {
  return license.status === 'active' && (!license.expiresAt || license.expiresAt.getTime() > Date.now());
}

function credential(license: LicenseRow, installHash?: string) {
  const now = Math.floor(Date.now() / 1000);
  const claims: LicenseClaims = {
    v: 1,
    appId: license.appId,
    licenseId: license.id,
    ...(installHash ? { installationHash: installHash } : {}),
    entitlements: license.entitlements,
    limits: license.limits,
    iat: now,
    exp: now + 300,
    offlineUntil: now + license.offlineGraceSeconds,
  };
  return { token: issueLicenseCredential(decryptSecret(license.encryptedPrivateKey), claims), claims };
}

async function audit(
  db: postgres.Sql,
  appId: string,
  licenseId: string | null,
  activationId: string | null,
  event: string,
  actor: string,
  metadata: Record<string, unknown> = {}
) {
  await db`
    INSERT INTO extension_license_audit_events
      (app_id, license_id, activation_id, event, actor, metadata)
    VALUES (${appId}, ${licenseId}, ${activationId}, ${event}, ${actor},
            ${db.json(metadata as Parameters<typeof sql.json>[0])})
  `;
}

const appOwnership = (workspaceId: string, appId: string) => sql`
  SELECT id FROM extension_apps WHERE id = ${appId} AND workspace_id = ${workspaceId}
`;

export const licensingRoutes = new Elysia({ prefix: '/api/licensing' })
  .use(authPlugin)
  .get('/apps', async ({ workspaceId }) => ({ data: await sql`
    SELECT id, name, slug, public_key AS "publicKey", status,
           offline_grace_seconds AS "offlineGraceSeconds", created_at AS "createdAt"
    FROM extension_apps WHERE workspace_id = ${workspaceId} ORDER BY created_at DESC
  ` }))
  .post('/apps', async ({ body, workspaceId, set }) => {
    const keys = createLicenseSigningKeys();
    const [app] = await sql`
      INSERT INTO extension_apps
        (workspace_id, name, slug, public_key, encrypted_private_key, offline_grace_seconds)
      VALUES (
        ${workspaceId}, ${body.name}, ${slugify(body.slug ?? body.name)}, ${keys.publicKey},
        ${encryptSecret(keys.privateKey)}, ${body.offlineGraceSeconds ?? 86400}
      )
      RETURNING id, name, slug, public_key AS "publicKey", status,
                offline_grace_seconds AS "offlineGraceSeconds", created_at AS "createdAt"
    `;
    set.status = 201;
    return { data: app };
  }, { body: t.Object({
    name: t.String({ minLength: 2, maxLength: 160 }),
    slug: t.Optional(t.String({ minLength: 2, maxLength: 100 })),
    offlineGraceSeconds: t.Optional(t.Integer({ minimum: 0, maximum: 2592000 })),
  }) })
  .get('/apps/:appId/plans', async ({ params, workspaceId, set }) => {
    if (!(await appOwnership(workspaceId, params.appId))[0]) { set.status = 404; return { error: 'App não encontrado' }; }
    return { data: await sql`
      SELECT id, slug, name, currency, unit_amount AS "unitAmount",
             billing_interval AS "billingInterval", entitlements, limits, active
      FROM extension_plans WHERE app_id = ${params.appId} ORDER BY unit_amount, created_at
    ` };
  })
  .post('/apps/:appId/plans', async ({ params, body, workspaceId, set }) => {
    if (!(await appOwnership(workspaceId, params.appId))[0]) { set.status = 404; return { error: 'App não encontrado' }; }
    const [plan] = await sql`
      INSERT INTO extension_plans
        (app_id, slug, name, currency, unit_amount, billing_interval, entitlements, limits)
      VALUES (${params.appId}, ${slugify(body.slug)}, ${body.name}, ${body.currency.toUpperCase()},
              ${body.unitAmount}, ${body.billingInterval},
              ${sql.json(body.entitlements as Parameters<typeof sql.json>[0])},
              ${sql.json((body.limits ?? {}) as Parameters<typeof sql.json>[0])})
      RETURNING id, slug, name, currency, unit_amount AS "unitAmount",
                billing_interval AS "billingInterval", entitlements, limits
    `;
    set.status = 201;
    return { data: plan };
  }, { body: t.Object({
    slug: t.String({ minLength: 1, maxLength: 80 }), name: t.String({ minLength: 1, maxLength: 160 }),
    currency: t.String({ minLength: 3, maxLength: 3 }), unitAmount: t.Integer({ minimum: 0 }),
    billingInterval: t.Union([t.Literal('month'), t.Literal('year')]),
    entitlements: t.Record(t.String(), t.Unknown()), limits: t.Optional(t.Record(t.String(), t.Unknown())),
  }) })
  .get('/apps/:appId/licenses', async ({ params, workspaceId, set }) => {
    if (!(await appOwnership(workspaceId, params.appId))[0]) { set.status = 404; return { error: 'App não encontrado' }; }
    return { data: await sql`
      SELECT license.id, license.key_prefix AS "keyPrefix", license.status,
             license.external_customer_id AS "externalCustomerId", license.expires_at AS "expiresAt",
             license.max_installations AS "maxInstallations", plan.slug AS plan,
             COUNT(activation.id) FILTER (WHERE activation.status = 'active')::int AS "activeInstallations",
             license.created_at AS "createdAt"
      FROM extension_licenses license
      JOIN extension_plans plan ON plan.id = license.plan_id
      LEFT JOIN extension_license_activations activation ON activation.license_id = license.id
      WHERE license.app_id = ${params.appId}
      GROUP BY license.id, plan.slug ORDER BY license.created_at DESC
    ` };
  })
  .get('/apps/:appId/usage', async ({ params, query, workspaceId, set }) => {
    if (!(await appOwnership(workspaceId, params.appId))[0]) { set.status = 404; return { error: 'App não encontrado' }; }
    try {
      const window = resolveLicenseUsageWindow(query.from, query.to);
      return { data: await readLicenseUsage(sql, params.appId, window) };
    } catch (error) {
      set.status = 422;
      return { error: String(error) };
    }
  }, { query: t.Object({
    from: t.Optional(t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })),
    to: t.Optional(t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })),
  }) })
  .post('/apps/:appId/licenses', async ({ params, body, workspaceId, set }) => {
    if (!(await appOwnership(workspaceId, params.appId))[0]) { set.status = 404; return { error: 'App não encontrado' }; }
    const [plan] = await sql`SELECT id FROM extension_plans WHERE id = ${body.planId} AND app_id = ${params.appId} AND active = TRUE`;
    if (!plan) { set.status = 422; return { error: 'Plano inválido' }; }
    const key = createLicenseKey('sandbox');
    const [license] = await sql`
      INSERT INTO extension_licenses
        (app_id, plan_id, key_hash, key_prefix, external_customer_id, expires_at, max_installations, metadata)
      VALUES (${params.appId}, ${body.planId}, ${key.hash}, ${key.prefix}, ${body.externalCustomerId ?? null},
              ${body.expiresAt ? new Date(body.expiresAt) : null}, ${body.maxInstallations ?? 1},
              ${sql.json((body.metadata ?? {}) as Parameters<typeof sql.json>[0])})
      RETURNING id, key_prefix AS "keyPrefix", status, expires_at AS "expiresAt",
                max_installations AS "maxInstallations", created_at AS "createdAt"
    `;
    await audit(sql, params.appId, license.id as string, null, 'license.created', 'creator');
    set.status = 201;
    return { data: license, licenseKey: key.plain };
  }, { body: t.Object({
    planId: t.String({ format: 'uuid' }), externalCustomerId: t.Optional(t.String({ maxLength: 255 })),
    expiresAt: t.Optional(t.String({ format: 'date-time' })),
    maxInstallations: t.Optional(t.Integer({ minimum: 1, maximum: 1000 })),
    metadata: t.Optional(t.Record(t.String(), t.Unknown())),
  }) })
  .post('/licenses/:licenseId/status', async ({ params, body, workspaceId, set }) => {
    const [license] = await sql`
      UPDATE extension_licenses license SET status = ${body.status}, updated_at = NOW()
      FROM extension_apps app
      WHERE license.id = ${params.licenseId} AND app.id = license.app_id AND app.workspace_id = ${workspaceId}
      RETURNING license.id, license.app_id AS "appId", license.status
    `;
    if (!license) { set.status = 404; return { error: 'Licença não encontrada' }; }
    await audit(sql, license.appId as string, license.id as string, null, `license.${body.status}`, 'creator');
    return { data: license };
  }, { body: t.Object({ status: t.Union([
    t.Literal('active'), t.Literal('past_due'), t.Literal('cancelled'),
    t.Literal('refunded'), t.Literal('disputed'), t.Literal('revoked'),
  ]) }) })
  .get('/licenses/:licenseId/billing-events', async ({ params, workspaceId, set }) => {
    const [license] = await sql`
      SELECT license.id FROM extension_licenses license
      JOIN extension_apps app ON app.id = license.app_id
      WHERE license.id = ${params.licenseId} AND app.workspace_id = ${workspaceId}
    `;
    if (!license) { set.status = 404; return { error: 'Licença não encontrada' }; }
    return { data: await sql`
      SELECT id, event_type AS "eventType", previous_status AS "previousStatus",
             resulting_status AS "resultingStatus", previous_expires_at AS "previousExpiresAt",
             resulting_expires_at AS "resultingExpiresAt", occurred_at AS "occurredAt",
             metadata, created_at AS "createdAt"
      FROM extension_license_billing_events WHERE license_id = ${params.licenseId}
      ORDER BY occurred_at DESC, created_at DESC
      LIMIT 200
    ` };
  })
  .post('/licenses/:licenseId/sandbox-events', async ({ params, body, workspaceId, set }) => {
    const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date();
    const result = await sql.begin(async (transaction) => {
      const tx = transaction as unknown as postgres.Sql;
      await tx`SELECT pg_advisory_xact_lock(hashtext(${`${workspaceId}:${params.licenseId}`}))`;
      await tx`SELECT pg_advisory_xact_lock(hashtext(${`${workspaceId}:${body.idempotencyKey}`}))`;
      const [license] = await tx<BillingLicenseRow[]>`
        SELECT license.id, license.app_id AS "appId", app.status AS "appStatus",
               license.status, license.expires_at AS "expiresAt",
               plan.billing_interval AS "billingInterval"
        FROM extension_licenses license
        JOIN extension_apps app ON app.id = license.app_id
        JOIN extension_plans plan ON plan.id = license.plan_id
        WHERE license.id = ${params.licenseId} AND app.workspace_id = ${workspaceId}
        FOR UPDATE OF license
      `;
      if (!license) return { kind: 'not-found' as const };
      if (license.appStatus !== 'sandbox') return { kind: 'not-sandbox' as const };

      const [existing] = await tx<BillingEventRow[]>`
        SELECT id, license_id AS "licenseId", event_type AS "eventType",
               previous_status AS "previousStatus", resulting_status AS "resultingStatus",
               previous_expires_at AS "previousExpiresAt",
               resulting_expires_at AS "resultingExpiresAt", occurred_at AS "occurredAt",
               created_at AS "createdAt"
        FROM extension_license_billing_events
        WHERE app_id = ${license.appId} AND idempotency_key = ${body.idempotencyKey}
      `;
      if (existing) {
        if (existing.licenseId !== license.id || existing.eventType !== body.eventType) {
          return { kind: 'conflict' as const };
        }
        return { kind: 'ok' as const, duplicate: true, event: existing };
      }
      if (license.status === 'revoked') return { kind: 'revoked' as const };

      const transition = resolveSandboxBillingEvent({
        eventType: body.eventType,
        currentExpiresAt: license.expiresAt, occurredAt,
        billingInterval: license.billingInterval,
      });
      await tx`
        UPDATE extension_licenses
        SET status = ${transition.status}, expires_at = ${transition.expiresAt}, updated_at = NOW()
        WHERE id = ${license.id}
      `;
      const [event] = await tx<BillingEventRow[]>`
        INSERT INTO extension_license_billing_events
          (app_id, license_id, idempotency_key, event_type, previous_status, resulting_status,
           previous_expires_at, resulting_expires_at, occurred_at, metadata)
        VALUES (${license.appId}, ${license.id}, ${body.idempotencyKey}, ${body.eventType},
                ${license.status}, ${transition.status}, ${license.expiresAt}, ${transition.expiresAt},
                ${occurredAt}, ${tx.json((body.metadata ?? {}) as Parameters<typeof sql.json>[0])})
        RETURNING id, license_id AS "licenseId", event_type AS "eventType",
                  previous_status AS "previousStatus", resulting_status AS "resultingStatus",
                  previous_expires_at AS "previousExpiresAt",
                  resulting_expires_at AS "resultingExpiresAt", occurred_at AS "occurredAt",
                  created_at AS "createdAt"
      `;
      await audit(tx, license.appId, license.id, null, `billing.${body.eventType}`, 'sandbox', {
        idempotencyKey: body.idempotencyKey,
        previousStatus: license.status,
        resultingStatus: transition.status,
      });
      return { kind: 'ok' as const, duplicate: false, event };
    });

    if (result.kind === 'not-found') { set.status = 404; return { error: 'Licença não encontrada' }; }
    if (result.kind === 'not-sandbox') { set.status = 409; return { error: 'Eventos simulados são permitidos apenas em apps sandbox' }; }
    if (result.kind === 'revoked') { set.status = 409; return { error: 'Licença revogada não pode ser reativada por billing' }; }
    if (result.kind === 'conflict') { set.status = 409; return { error: 'Chave de idempotência já usada por outro evento' }; }
    set.status = result.duplicate ? 200 : 201;
    return { data: result.event, duplicate: result.duplicate };
  }, { body: t.Object({
    idempotencyKey: t.String({ minLength: 8, maxLength: 200 }),
    eventType: t.Union([
      t.Literal('purchase.completed'), t.Literal('renewal.succeeded'),
      t.Literal('payment.failed'), t.Literal('subscription.cancelled'),
      t.Literal('refund.completed'), t.Literal('dispute.opened'),
    ]),
    occurredAt: t.Optional(t.String({ format: 'date-time' })),
    metadata: t.Optional(t.Record(t.String({ maxLength: 80 }), t.Unknown())),
  }) });

const licenseRequest = t.Object({
  appId: t.String({ format: 'uuid' }),
  licenseKey: t.String({ minLength: 20, maxLength: 200 }),
  installationId: t.Optional(t.String({ minLength: 8, maxLength: 255 })),
  metadata: t.Optional(t.Record(t.String({ maxLength: 80 }), t.String({ maxLength: 255 }))),
});

export const publicLicensingRoutes = new Elysia({ prefix: '/api/v1/licenses' })
  .post('/verify', async ({ body, set }) => {
    const license = await readLicense(body.appId, body.licenseKey);
    if (!license || !licenseIsUsable(license)) { set.status = 403; return { valid: false, error: 'Licença inválida ou inativa' }; }
    const hash = body.installationId ? installationHash(body.appId, body.installationId) : undefined;
    if (hash) {
      const [activation] = await sql`
        SELECT id FROM extension_license_activations
        WHERE license_id = ${license.id} AND installation_hash = ${hash} AND status = 'active'
      `;
      if (!activation) { set.status = 403; return { valid: false, error: 'Instalação não ativada' }; }
    }
    await recordLicenseUsage(sql, license.appId, 'verify');
    return { valid: true, ...credential(license, hash) };
  }, { body: licenseRequest })
  .post('/activate', async ({ body, set }) => {
    if (!body.installationId) { set.status = 422; return { error: 'installationId é obrigatório' }; }
    const license = await readLicense(body.appId, body.licenseKey);
    if (!license || !licenseIsUsable(license)) { set.status = 403; return { valid: false, error: 'Licença inválida ou inativa' }; }
    const hash = installationHash(body.appId, body.installationId);
    const activation = await sql.begin(async (transaction) => {
      const tx = transaction as unknown as postgres.Sql;
      await tx`SELECT pg_advisory_xact_lock(hashtext(${license.id}))`;
      const [existing] = await tx`
        SELECT id, status FROM extension_license_activations
        WHERE license_id = ${license.id} AND installation_hash = ${hash}
      `;
      if (existing) {
        const [updated] = await tx`
          UPDATE extension_license_activations SET status = 'active', deactivated_at = NULL,
            last_heartbeat_at = NOW(),
            metadata = ${tx.json((body.metadata ?? {}) as Parameters<typeof sql.json>[0])}
          WHERE id = ${existing.id as string} RETURNING id
        `;
        await recordLicenseUsage(tx, license.appId, 'activate');
        return updated;
      }
      const [count] = await tx<{ total: number }[]>`
        SELECT COUNT(*)::int AS total FROM extension_license_activations
        WHERE license_id = ${license.id} AND status = 'active'
      `;
      if (count.total >= license.maxInstallations) return null;
      const [created] = await tx`
        INSERT INTO extension_license_activations (license_id, installation_hash, metadata)
        VALUES (${license.id}, ${hash},
                ${tx.json((body.metadata ?? {}) as Parameters<typeof sql.json>[0])}) RETURNING id
      `;
      await audit(tx, license.appId, license.id, created.id as string, 'installation.activated', 'sdk');
      await recordLicenseUsage(tx, license.appId, 'activate');
      return created;
    });
    if (!activation) { set.status = 409; return { valid: false, error: 'Limite de instalações atingido' }; }
    set.status = 201;
    return { valid: true, activationId: activation.id, ...credential(license, hash) };
  }, { body: licenseRequest })
  .post('/heartbeat', async ({ body, set }) => {
    if (!body.installationId) { set.status = 422; return { error: 'installationId é obrigatório' }; }
    const license = await readLicense(body.appId, body.licenseKey);
    if (!license || !licenseIsUsable(license)) { set.status = 403; return { valid: false, error: 'Licença inválida ou inativa' }; }
    const hash = installationHash(body.appId, body.installationId);
    const activation = await sql.begin(async (transaction) => {
      const tx = transaction as unknown as postgres.Sql;
      const [updated] = await tx`
        UPDATE extension_license_activations SET last_heartbeat_at = NOW()
        WHERE license_id = ${license.id} AND installation_hash = ${hash} AND status = 'active'
        RETURNING id
      `;
      if (updated) await recordLicenseUsage(tx, license.appId, 'heartbeat');
      return updated;
    });
    if (!activation) { set.status = 404; return { valid: false, error: 'Instalação não ativada' }; }
    return { valid: true, ...credential(license, hash) };
  }, { body: licenseRequest })
  .post('/deactivate', async ({ body, set }) => {
    if (!body.installationId) { set.status = 422; return { error: 'installationId é obrigatório' }; }
    const license = await readLicense(body.appId, body.licenseKey);
    if (!license) { set.status = 403; return { error: 'Licença inválida' }; }
    const hash = installationHash(body.appId, body.installationId);
    const activation = await sql.begin(async (transaction) => {
      const tx = transaction as unknown as postgres.Sql;
      const [updated] = await tx`
        UPDATE extension_license_activations
        SET status = 'deactivated', deactivated_at = NOW(), last_heartbeat_at = NOW()
        WHERE license_id = ${license.id} AND installation_hash = ${hash} AND status = 'active'
        RETURNING id
      `;
      if (!updated) return undefined;
      await audit(tx, license.appId, license.id, updated.id as string, 'installation.deactivated', 'sdk');
      await recordLicenseUsage(tx, license.appId, 'deactivate');
      return updated;
    });
    if (!activation) { set.status = 404; return { error: 'Instalação ativa não encontrada' }; }
    return { deactivated: true };
  }, { body: licenseRequest });
