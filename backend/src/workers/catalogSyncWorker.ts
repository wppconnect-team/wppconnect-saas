import type postgres from 'postgres';
import { sql } from '../db';
import { canonicalJson, signCompatibilityPayload } from '../lib/compatibility';
import { decryptSecret } from '../lib/encryptedSecret';
import { fetchShopifyProducts, fetchWooProducts, WppCatalogDestination } from '../lib/catalogConnectors';
import { planCatalogSync, type CanonicalProduct, type CatalogMapping, type CatalogOperation } from '../lib/catalogSync';
import { assertPublicUrl, isPrivateUrl } from '../lib/urlSafety';

type Connection = { id:string; provider:'shopify'|'woocommerce'; storeUrl:string; encryptedSourceCredentials:string;
  wppServerUrl:string; wppSession:string; encryptedWppToken:string; webhookUrl:string|null; encryptedWebhookSecret:string|null };

async function queueWebhook(runId: string, connectionId: string) {
  await sql`INSERT INTO catalog_webhook_deliveries (run_id)
    SELECT ${runId} WHERE EXISTS (SELECT 1 FROM catalog_connections WHERE id=${connectionId} AND webhook_url IS NOT NULL)
    ON CONFLICT DO NOTHING`;
}

async function finishRun(runId: string, connectionId: string, status: 'succeeded'|'partial'|'failed', counts: Record<string, number>, error?: string) {
  await sql`UPDATE catalog_sync_runs SET status=${status}, counts=${sql.json(counts)}, error_message=${error ?? null},
    completed_at=NOW(), updated_at=NOW() WHERE id=${runId}`;
  await queueWebhook(runId, connectionId);
}

async function preview(run: { id:string; connectionId:string }, connection: Connection) {
  const credentials = JSON.parse(decryptSecret(connection.encryptedSourceCredentials)) as Record<string,string>;
  const products = connection.provider === 'shopify'
    ? await fetchShopifyProducts(connection.storeUrl, credentials)
    : await fetchWooProducts(connection.storeUrl, credentials);
  const mappings = await sql<CatalogMapping[]>`
    SELECT source_product_id AS "sourceProductId", wpp_product_id AS "wppProductId", fingerprint,
      status, image_urls AS "imageUrls" FROM catalog_product_mappings WHERE connection_id=${connection.id}`;
  const operations = planCatalogSync(products, mappings);
  await sql.begin(async (tx) => {
    for (const operation of operations) await tx`
      INSERT INTO catalog_sync_operations (run_id, source_product_id, wpp_product_id, action,
        canonical_product, fingerprint, previous_image_urls)
      VALUES (${run.id}, ${operation.sourceProductId}, ${operation.wppProductId ?? null}, ${operation.action},
        ${operation.product ? tx.json(operation.product as Parameters<typeof tx.json>[0]) : null},
        ${operation.fingerprint ?? null}, ${tx.json((operation.previousImageUrls ?? []) as Parameters<typeof tx.json>[0])})`;
  });
  const counts = Object.fromEntries(['create','update','hide','unhide','noop'].map((action) => [action, operations.filter((op) => op.action === action).length]));
  await finishRun(run.id, connection.id, 'succeeded', { total:operations.length, ...counts });
}

async function applyOperation(connection: Connection, operation: CatalogOperation & { id:string; attempts:number }) {
  const destination = new WppCatalogDestination(connection.wppServerUrl, connection.wppSession, decryptSecret(connection.encryptedWppToken));
  let wppId = operation.wppProductId;
  if (operation.action === 'create') wppId = await destination.create(operation.product!);
  else if (operation.action === 'update') await destination.update(wppId!, operation.product!, operation.previousImageUrls ?? []);
  else if (operation.action === 'hide') await destination.setHidden(wppId!, true);
  else if (operation.action === 'unhide') await destination.setHidden(wppId!, false);

  await sql.begin(async (tx) => {
    if (operation.action === 'create' || operation.action === 'update') {
      const product = operation.product!;
      await tx`INSERT INTO catalog_product_mappings
        (connection_id, source_product_id, wpp_product_id, fingerprint, image_urls, status)
        VALUES (${connection.id}, ${operation.sourceProductId}, ${wppId!}, ${operation.fingerprint!},
          ${tx.json(product.images as Parameters<typeof tx.json>[0])}, 'active')
        ON CONFLICT (connection_id, source_product_id) DO UPDATE SET wpp_product_id=EXCLUDED.wpp_product_id,
          fingerprint=EXCLUDED.fingerprint, image_urls=EXCLUDED.image_urls,
          last_synced_at=NOW(), updated_at=NOW()`;
    } else if (operation.action === 'hide' || operation.action === 'unhide') {
      await tx`UPDATE catalog_product_mappings SET status=${operation.action === 'hide' ? 'archived' : 'active'},
        last_synced_at=NOW(), updated_at=NOW() WHERE connection_id=${connection.id} AND source_product_id=${operation.sourceProductId}`;
    }
    await tx`UPDATE catalog_sync_operations SET status='succeeded', attempts=attempts+1,
      wpp_product_id=${wppId ?? null}, completed_at=NOW(), error_message=NULL WHERE id=${operation.id}`;
  });
}

async function apply(run: {id:string;connectionId:string}, connection: Connection, limit: number) {
  const operations = await sql<Array<CatalogOperation & {id:string;attempts:number}>>`
    SELECT id, source_product_id AS "sourceProductId", wpp_product_id AS "wppProductId", action,
      canonical_product AS product, fingerprint, previous_image_urls AS "previousImageUrls", attempts
    FROM catalog_sync_operations WHERE run_id=${run.id} AND status='pending'
    ORDER BY created_at LIMIT ${limit}`;
  for (const operation of operations) {
    try { await applyOperation(connection, operation); }
    catch (error) {
      const terminal = operation.attempts + 1 >= 5;
      await sql`UPDATE catalog_sync_operations SET attempts=attempts+1, status=${terminal ? 'failed' : 'pending'},
        error_message=${String(error).slice(0,2000)}, completed_at=${terminal ? new Date() : null} WHERE id=${operation.id}`;
    }
  }
  const [counts] = await sql<{pending:number;succeeded:number;failed:number}[]>`
    SELECT COUNT(*) FILTER (WHERE status='pending')::int AS pending,
      COUNT(*) FILTER (WHERE status='succeeded')::int AS succeeded,
      COUNT(*) FILTER (WHERE status='failed')::int AS failed
    FROM catalog_sync_operations WHERE run_id=${run.id}`;
  if (!counts.pending) {
    await finishRun(run.id, connection.id, counts.failed ? 'partial' : 'succeeded', counts);
    if (counts.succeeded > 0) await sql`INSERT INTO usage_events
      (workspace_id,product,meter,quantity,idempotency_key,dimensions,occurred_at)
      SELECT workspace_id,'catalog-sync','products.applied',${counts.succeeded},${`catalog:${run.id}`},
        ${sql.json({connectionId:connection.id})},NOW() FROM catalog_connections WHERE id=${connection.id}
      ON CONFLICT DO NOTHING`;
  }
  else await sql`UPDATE catalog_sync_runs SET status='queued', counts=${sql.json(counts)}, updated_at=NOW() WHERE id=${run.id}`;
}

export async function processCatalogSyncBatch(operationLimit = 20): Promise<number> {
  const run = await sql.begin(async (tx) => {
    const [candidate] = await tx<{id:string;connectionId:string;mode:'preview'|'apply'}[]>`
      SELECT run.id, run.connection_id AS "connectionId", run.mode FROM catalog_sync_runs run
      JOIN catalog_connections connection ON connection.id=run.connection_id AND connection.status='active'
      WHERE run.status='queued' OR (run.status='running' AND run.updated_at < NOW()-INTERVAL '2 minutes')
      ORDER BY run.created_at FOR UPDATE SKIP LOCKED LIMIT 1`;
    if (!candidate) return null;
    await tx`UPDATE catalog_sync_runs SET status='running', started_at=COALESCE(started_at,NOW()), updated_at=NOW() WHERE id=${candidate.id}`;
    return candidate;
  });
  if (!run) return 0;
  const [connection] = await sql<Connection[]>`
    SELECT id, provider, store_url AS "storeUrl", encrypted_source_credentials AS "encryptedSourceCredentials",
      wpp_server_url AS "wppServerUrl", wpp_session AS "wppSession", encrypted_wpp_token AS "encryptedWppToken",
      webhook_url AS "webhookUrl", encrypted_webhook_secret AS "encryptedWebhookSecret"
    FROM catalog_connections WHERE id=${run.connectionId}`;
  try {
    if (run.mode === 'preview') await preview(run, connection);
    else await apply(run, connection, operationLimit);
  } catch (error) {
    await finishRun(run.id, run.connectionId, 'failed', {}, String(error).slice(0,2000));
  }
  return 1;
}

export async function processCatalogWebhookBatch(limit = 20): Promise<number> {
  const deliveries = await sql<Array<{id:string;attempts:number;runId:string;url:string;secret:string}>>`
    UPDATE catalog_webhook_deliveries delivery SET next_attempt_at=NOW()+INTERVAL '5 minutes', updated_at=NOW()
    FROM catalog_sync_runs run, catalog_connections connection
    WHERE delivery.id IN (SELECT id FROM catalog_webhook_deliveries WHERE status IN ('pending','failed') AND next_attempt_at<=NOW() AND attempts<8 ORDER BY next_attempt_at LIMIT ${limit})
      AND run.id=delivery.run_id AND connection.id=run.connection_id
    RETURNING delivery.id, delivery.attempts, run.id AS "runId", connection.webhook_url AS url,
      connection.encrypted_webhook_secret AS secret`;
  for (const delivery of deliveries) {
    const [run] = await sql`SELECT id, mode, status, counts, error_message AS error, completed_at AS "completedAt" FROM catalog_sync_runs WHERE id=${delivery.runId}`;
    const payload = { schemaVersion:'1', event:'catalog.sync.completed', id:delivery.id, run };
    const timestamp = Math.floor(Date.now()/1000);
    try {
      if (!delivery.url || isPrivateUrl(delivery.url)) throw new Error('Unsafe catalog webhook URL');
      await assertPublicUrl(delivery.url);
      const response = await fetch(delivery.url, {method:'POST',signal:AbortSignal.timeout(10_000),headers:{'content-type':'application/json',
        'idempotency-key':delivery.id,'x-wppconnect-timestamp':String(timestamp),
        'x-wppconnect-signature':signCompatibilityPayload(decryptSecret(delivery.secret),timestamp,payload)},body:canonicalJson(payload)});
      if (!response.ok) throw Object.assign(new Error(`Webhook returned ${response.status}`),{status:response.status});
      await sql`UPDATE catalog_webhook_deliveries SET status='delivered',attempts=attempts+1,response_status=${response.status},delivered_at=NOW(),updated_at=NOW() WHERE id=${delivery.id}`;
    } catch (error) {
      const delay = Math.min(3600, 15 * 2 ** delivery.attempts);
      await sql`UPDATE catalog_webhook_deliveries SET status='failed',attempts=attempts+1,
        response_status=${error && typeof error==='object' && 'status' in error ? Number(error.status) : null},last_error=${String(error).slice(0,2000)},
        next_attempt_at=NOW()+(${delay} * INTERVAL '1 second'),updated_at=NOW() WHERE id=${delivery.id}`;
    }
  }
  return deliveries.length;
}

let worker: ReturnType<typeof setInterval> | undefined;
export function startCatalogSyncWorker() {
  if (worker) return;
  worker=setInterval(() => void processCatalogSyncBatch().then(() => processCatalogWebhookBatch()).catch(console.error), 3000);
}
