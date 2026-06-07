import { sql } from '../db';

type Level = 'ok' | 'info' | 'warn' | 'error';

export async function insertLog(level: Level, message: string, source = 'system') {
  try {
    await sql`
      INSERT INTO logs (level, message, source)
      VALUES (${level}, ${message}, ${source})
    `;
  } catch (err) {
    console.error('[insertLog] falhou:', err);
  }
}
