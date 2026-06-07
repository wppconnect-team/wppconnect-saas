import { sql } from '../db';

type Level = 'ok' | 'info' | 'warn' | 'error';

export async function insertLog(
  level: Level,
  message: string,
  source = 'system',
  userId: string | null = null,
) {
  try {
    await sql`
      INSERT INTO logs (level, message, source, user_id)
      VALUES (${level}, ${message}, ${source}, ${userId})
    `;
  } catch (err) {
    console.error('[insertLog] falhou:', err);
  }
}
