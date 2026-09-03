import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadMigrationPlan } from './migrations';

describe('migration plan', () => {
  test('loads only versioned SQL files in deterministic order with checksums', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wpp-migrations-'));
    try {
      await writeFile(join(directory, '010_second.sql'), 'SELECT 2;');
      await writeFile(join(directory, '002_first.sql'), 'SELECT 1;');
      await writeFile(join(directory, 'README.md'), 'ignored');

      const first = await loadMigrationPlan(directory);
      const second = await loadMigrationPlan(directory);
      expect(first.map(({ name }) => name)).toEqual(['002_first.sql', '010_second.sql']);
      expect(first.map(({ checksum }) => checksum)).toEqual(second.map(({ checksum }) => checksum));
      expect(first.every(({ checksum }) => /^[a-f0-9]{64}$/.test(checksum))).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
