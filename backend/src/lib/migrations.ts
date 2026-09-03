import { createHash } from 'crypto';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import type postgres from 'postgres';

const MIGRATION_LOCK_KEY = 2_147_013_579;

export interface MigrationFile {
  name: string;
  checksum: string;
  sql: string;
}

export async function loadMigrationPlan(directory: string): Promise<MigrationFile[]> {
  const names = (await readdir(directory))
    .filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/i.test(name))
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(names.map(async (name) => {
    const source = await readFile(join(directory, name), 'utf8');
    return {
      name,
      checksum: createHash('sha256').update(source).digest('hex'),
      sql: source,
    };
  }));
}

export async function applyMigrationPlan(
  db: postgres.Sql,
  plan: MigrationFile[]
): Promise<string[]> {
  await db`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  const applied: string[] = [];
  await db`SELECT pg_advisory_lock(${MIGRATION_LOCK_KEY})`;
  try {
    for (const migration of plan) {
      const [existing] = await db<{ checksum: string }[]>`
        SELECT checksum FROM schema_migrations WHERE name = ${migration.name}
      `;
      if (existing) {
        if (existing.checksum !== migration.checksum) {
          throw new Error(`Migration ${migration.name} changed after it was applied`);
        }
        continue;
      }

      await db.begin(async (transaction) => {
        const tx = transaction as unknown as postgres.Sql;
        await tx.unsafe(migration.sql).simple();
        await tx`
          INSERT INTO schema_migrations (name, checksum)
          VALUES (${migration.name}, ${migration.checksum})
        `;
      });
      applied.push(migration.name);
    }
  } finally {
    await db`SELECT pg_advisory_unlock(${MIGRATION_LOCK_KEY})`;
  }

  return applied;
}

export async function runMigrations(): Promise<string[]> {
  const { sql } = await import('../db');
  const directory = join(import.meta.dir, '..', '..', 'migrations');
  const plan = await loadMigrationPlan(directory);
  const applied = await applyMigrationPlan(sql, plan);
  if (applied.length > 0) {
    process.stdout.write(`[migrations] Applied: ${applied.join(', ')}\n`);
  }
  return applied;
}
