import { randomUUID } from 'crypto';
import { Elysia, t } from 'elysia';
import { sql } from '../db';
import {
  compatibilityManifestPublicKey,
  issueCompatibilityManifest,
  type CompatibilityManifestPayload,
} from '../lib/compatibilityManifest';
import { acceptsBearerSecret } from '../lib/internalAuth';

const packagePattern = '^(@[a-z0-9._-]+/)?[a-z0-9._-]+$';
const capabilityNamePattern = '^[a-zA-Z][a-zA-Z0-9._-]{0,79}$';
const publishBodyFields = new Set([
  'whatsappVersion',
  'minimumPackageVersion',
  'recommendedPackageVersion',
  'capabilities',
  'featureFlags',
  'workaroundUrl',
  'notes',
  'expiresInSeconds',
]);

function normalizedPem(value: string): string {
  return value.replace(/\\n/g, '\n');
}

function manifestConfig() {
  const privateKey = normalizedPem(process.env.COMPATIBILITY_MANIFEST_PRIVATE_KEY ?? '');
  const keyId = process.env.COMPATIBILITY_MANIFEST_KEY_ID ?? '';
  if (!privateKey || !keyId) return null;
  return { privateKey, publicKey: compatibilityManifestPublicKey(privateKey), keyId };
}

const publishBody = t.Object({
  whatsappVersion: t.String({ minLength: 1, maxLength: 80 }),
  minimumPackageVersion: t.String({ minLength: 1, maxLength: 80 }),
  recommendedPackageVersion: t.String({ minLength: 1, maxLength: 80 }),
  capabilities: t.Record(
    t.String({ pattern: capabilityNamePattern }),
    t.Union([t.Literal('supported'), t.Literal('degraded'), t.Literal('disabled'), t.Literal('unknown')]),
  ),
  featureFlags: t.Record(t.String({ pattern: capabilityNamePattern }), t.Boolean()),
  workaroundUrl: t.Optional(t.String({ format: 'uri', maxLength: 2048 })),
  notes: t.Optional(t.String({ maxLength: 1000 })),
  expiresInSeconds: t.Integer({ minimum: 300, maximum: 604800 }),
}, { additionalProperties: true });

export const compatibilityManifestRoutes = new Elysia({ prefix: '/api/v1/compatibility' })
  .get('/manifests/:package/latest', async ({ params, set }) => {
    const [manifest] = await sql`
      SELECT payload, token, key_id AS "keyId"
      FROM compatibility_manifests
      WHERE package_name=${params.package} AND expires_at>NOW()
      ORDER BY revision DESC LIMIT 1`;
    if (!manifest) { set.status = 404; return { error: 'No active compatibility manifest' }; }
    set.headers['cache-control'] = 'public, max-age=60, stale-if-error=300';
    return { data: manifest };
  }, { params: t.Object({ package: t.String({ pattern: packagePattern, maxLength: 160 }) }) })
  .get('/keys/:keyId', async ({ params, set }) => {
    const [key] = await sql`
      SELECT key_id AS "keyId", public_key AS "publicKey"
      FROM compatibility_manifests WHERE key_id=${params.keyId}
      ORDER BY created_at DESC LIMIT 1`;
    if (!key) { set.status = 404; return { error: 'Compatibility signing key not found' }; }
    set.headers['cache-control'] = 'public, max-age=3600, immutable';
    return { data: { ...key, algorithm: 'Ed25519' } };
  }, { params: t.Object({ keyId: t.String({ pattern: '^[a-zA-Z0-9._-]{1,80}$' }) }) });

export const internalCompatibilityManifestRoutes = new Elysia({ prefix: '/api/internal/compatibility/manifests' })
  .put('/:package', async ({ request, params, body, set }) => {
    if (!acceptsBearerSecret(request.headers.get('authorization'), process.env.COMPATIBILITY_MANIFEST_ADMIN_SECRET ?? '')) {
      set.status = 401; return { error: 'Invalid compatibility manifest credential' };
    }
    const unexpectedFields = Object.keys(body).filter((field) => !publishBodyFields.has(field));
    if (unexpectedFields.length > 0) {
      set.status = 400;
      return { error: 'Compatibility manifests only accept declarative fields', unexpectedFields };
    }
    const config = manifestConfig();
    if (!config) { set.status = 503; return { error: 'Compatibility manifest signing is not configured' }; }
    if (body.workaroundUrl) {
      try {
        const url = new URL(body.workaroundUrl);
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error('unsafe');
      } catch {
        set.status = 422; return { error: 'workaroundUrl must be an absolute HTTPS URL without credentials' };
      }
    }

    const created = await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${'compatibility-manifest:' + params.package}))`;
      const [previous] = await tx<{ revision: number }[]>`
        SELECT COALESCE(MAX(revision),0)::int AS revision FROM compatibility_manifests WHERE package_name=${params.package}`;
      const now = new Date();
      const payload: CompatibilityManifestPayload = {
        v: 1,
        id: randomUUID(),
        revision: previous.revision + 1,
        package: params.package,
        whatsappVersion: body.whatsappVersion,
        minimumPackageVersion: body.minimumPackageVersion,
        recommendedPackageVersion: body.recommendedPackageVersion,
        capabilities: body.capabilities,
        featureFlags: body.featureFlags,
        ...(body.workaroundUrl ? { workaroundUrl: body.workaroundUrl } : {}),
        ...(body.notes ? { notes: body.notes } : {}),
        issuedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + body.expiresInSeconds * 1000).toISOString(),
      };
      const token = issueCompatibilityManifest(config.privateKey, config.keyId, payload);
      await tx`
        INSERT INTO compatibility_manifests
          (id,package_name,revision,key_id,public_key,payload,token,issued_at,expires_at)
        VALUES
          (${payload.id},${payload.package},${payload.revision},${config.keyId},${config.publicKey},
           ${tx.json(payload as unknown as Parameters<typeof tx.json>[0])},${token},${payload.issuedAt},${payload.expiresAt})`;
      return { payload, token, keyId: config.keyId };
    });
    set.status = 201;
    set.headers['cache-control'] = 'no-store';
    return { data: created };
  }, {
    params: t.Object({ package: t.String({ pattern: packagePattern, maxLength: 160 }) }),
    body: publishBody,
  });
