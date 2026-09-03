import { sql } from '../db';
import { canonicalJson, signCompatibilityPayload } from '../lib/compatibility';
import { decryptSecret } from '../lib/encryptedSecret';

interface DeliveryJob {
  id: string;
  endpointId: string;
  url: string;
  encryptedSigningSecret: string;
  event: string;
  payload: Record<string, unknown>;
  attempts: number;
}

const RETRY_SECONDS = [30, 120, 600, 1_800, 7_200, 21_600, 43_200, 86_400];

async function claimDeliveries(limit: number): Promise<DeliveryJob[]> {
  return sql.begin(async (tx) => tx<DeliveryJob[]>`
    WITH due AS (
      SELECT delivery.id
      FROM compatibility_webhook_deliveries delivery
      JOIN compatibility_webhook_endpoints endpoint ON endpoint.id = delivery.endpoint_id
      WHERE (
          (delivery.status = 'pending' AND delivery.next_attempt_at <= NOW())
          OR (delivery.status = 'processing' AND delivery.updated_at < NOW() - INTERVAL '5 minutes')
        )
        AND endpoint.status = 'active'
      ORDER BY delivery.next_attempt_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE compatibility_webhook_deliveries delivery
    SET status = 'processing', attempts = attempts + 1, updated_at = NOW()
    FROM due, compatibility_webhook_endpoints endpoint
    WHERE delivery.id = due.id AND endpoint.id = delivery.endpoint_id
    RETURNING
      delivery.id,
      delivery.endpoint_id AS "endpointId",
      endpoint.url,
      endpoint.encrypted_signing_secret AS "encryptedSigningSecret",
      delivery.event,
      delivery.payload,
      delivery.attempts
  `);
}

async function deliver(job: DeliveryJob): Promise<void> {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const secret = decryptSecret(job.encryptedSigningSecret);
    const signature = signCompatibilityPayload(secret, timestamp, job.payload);
    const response = await fetch(job.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'WPPConnect-Compatibility-Webhook/1.0',
        'X-WPPConnect-Delivery': job.id,
        'X-WPPConnect-Event': job.event,
        'X-WPPConnect-Timestamp': String(timestamp),
        'X-WPPConnect-Signature': signature,
      },
      body: canonicalJson(job.payload),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    await sql`
      UPDATE compatibility_webhook_deliveries
      SET status = 'delivered', response_status = ${response.status},
          delivered_at = NOW(), last_error = NULL, updated_at = NOW()
      WHERE id = ${job.id}
    `;
  } catch (error) {
    const exhausted = job.attempts >= RETRY_SECONDS.length;
    const delay = RETRY_SECONDS[Math.min(job.attempts - 1, RETRY_SECONDS.length - 1)]!;
    await sql`
      UPDATE compatibility_webhook_deliveries
      SET status = ${exhausted ? 'failed' : 'pending'},
          next_attempt_at = NOW() + (${delay} * INTERVAL '1 second'),
          last_error = ${String(error).slice(0, 2000)}, updated_at = NOW()
      WHERE id = ${job.id}
    `;
  }
}

export async function processCompatibilityWebhookBatch(limit = 10): Promise<number> {
  const jobs = await claimDeliveries(limit);
  await Promise.all(jobs.map(deliver));
  return jobs.length;
}

export function startCompatibilityWebhookWorker(): () => void {
  const intervalMs = Number(process.env.COMPATIBILITY_WEBHOOK_POLL_MS ?? 5_000);
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await processCompatibilityWebhookBatch();
    } catch (error) {
      process.stderr.write(`[compatibility-webhook-worker] ${error}\n`);
    } finally {
      running = false;
    }
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
