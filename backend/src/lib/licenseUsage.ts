import type postgres from 'postgres';

export type LicenseUsageOperation = 'verify' | 'activate' | 'heartbeat' | 'deactivate';

export type LicenseUsageWindow = {
  from: string;
  to: string;
};

export type LicenseUsageSummary = {
  window: LicenseUsageWindow;
  current: {
    activeLicenses: string;
    activeInstallations: string;
  };
  operations: {
    verifications: string;
    activations: string;
    heartbeats: string;
    deactivations: string;
  };
  daily: Array<{
    date: string;
    verifications: string;
    activations: string;
    heartbeats: string;
    deactivations: string;
  }>;
};

const DAY_MS = 86_400_000;

function utcDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Data inválida');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('Data inválida');
  }
  return date;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function resolveLicenseUsageWindow(
  from?: string,
  to?: string,
  now = new Date(),
): LicenseUsageWindow {
  const today = utcDate(dateOnly(now));
  const end = to ? utcDate(to) : today;
  const start = from ? utcDate(from) : new Date(end.getTime() - 29 * DAY_MS);
  const days = Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;
  if (days < 1) throw new Error('A data inicial deve ser anterior ou igual à data final');
  if (days > 366) throw new Error('O período máximo para consulta é de 366 dias');
  return { from: dateOnly(start), to: dateOnly(end) };
}

export async function recordLicenseUsage(
  db: postgres.Sql,
  appId: string,
  operation: LicenseUsageOperation,
  occurredAt = new Date(),
): Promise<void> {
  const counts = {
    verify: operation === 'verify' ? 1 : 0,
    activate: operation === 'activate' ? 1 : 0,
    heartbeat: operation === 'heartbeat' ? 1 : 0,
    deactivate: operation === 'deactivate' ? 1 : 0,
  };
  await db`
    INSERT INTO extension_license_usage_daily (
      app_id, usage_date, verification_count, activation_count,
      heartbeat_count, deactivation_count, first_recorded_at, last_recorded_at
    ) VALUES (
      ${appId}, ${dateOnly(occurredAt)}, ${counts.verify}, ${counts.activate},
      ${counts.heartbeat}, ${counts.deactivate}, ${occurredAt}, ${occurredAt}
    )
    ON CONFLICT (app_id, usage_date) DO UPDATE SET
      verification_count = extension_license_usage_daily.verification_count + EXCLUDED.verification_count,
      activation_count = extension_license_usage_daily.activation_count + EXCLUDED.activation_count,
      heartbeat_count = extension_license_usage_daily.heartbeat_count + EXCLUDED.heartbeat_count,
      deactivation_count = extension_license_usage_daily.deactivation_count + EXCLUDED.deactivation_count,
      first_recorded_at = LEAST(extension_license_usage_daily.first_recorded_at, EXCLUDED.first_recorded_at),
      last_recorded_at = GREATEST(extension_license_usage_daily.last_recorded_at, EXCLUDED.last_recorded_at)
  `;
}

export async function readLicenseUsage(
  db: postgres.Sql,
  appId: string,
  window: LicenseUsageWindow,
): Promise<LicenseUsageSummary> {
  const [current] = await db<[{ activeLicenses: string; activeInstallations: string }]>`
    SELECT
      COUNT(DISTINCT license.id) FILTER (
        WHERE license.status = 'active'
          AND (license.expires_at IS NULL OR license.expires_at > NOW())
      )::text AS "activeLicenses",
      COUNT(activation.id) FILTER (
        WHERE activation.status = 'active'
          AND license.status = 'active'
          AND (license.expires_at IS NULL OR license.expires_at > NOW())
      )::text AS "activeInstallations"
    FROM extension_licenses license
    LEFT JOIN extension_license_activations activation ON activation.license_id = license.id
    WHERE license.app_id = ${appId}
  `;
  const [operations] = await db<[{
    verifications: string; activations: string; heartbeats: string; deactivations: string;
  }]>`
    SELECT
      COALESCE(SUM(verification_count), 0)::text AS verifications,
      COALESCE(SUM(activation_count), 0)::text AS activations,
      COALESCE(SUM(heartbeat_count), 0)::text AS heartbeats,
      COALESCE(SUM(deactivation_count), 0)::text AS deactivations
    FROM extension_license_usage_daily
    WHERE app_id = ${appId} AND usage_date BETWEEN ${window.from} AND ${window.to}
  `;
  const daily = await db<LicenseUsageSummary['daily']>`
    SELECT usage_date::text AS date,
           verification_count::text AS verifications,
           activation_count::text AS activations,
           heartbeat_count::text AS heartbeats,
           deactivation_count::text AS deactivations
    FROM extension_license_usage_daily
    WHERE app_id = ${appId} AND usage_date BETWEEN ${window.from} AND ${window.to}
    ORDER BY usage_date DESC
  `;
  return { window, current, operations, daily };
}
