import { Elysia, t } from 'elysia';
import { authPlugin } from '../plugins/auth';
import { sql } from '../db';

// Controle de conexões SSE ativas por usuário
const activeStreams   = new Map<string, number>();
const MAX_PER_USER   = 5;
const STREAM_MAX_MS  = 30 * 60 * 1000; // 30 minutos máximo por conexão

function incStream(userId: string): boolean {
  const n = activeStreams.get(userId) ?? 0;
  if (n >= MAX_PER_USER) return false;
  activeStreams.set(userId, n + 1);
  return true;
}

function decStream(userId: string): void {
  const n = activeStreams.get(userId) ?? 1;
  if (n <= 1) activeStreams.delete(userId);
  else        activeStreams.set(userId, n - 1);
}

export const logRoutes = new Elysia({ prefix: '/api/logs' })
  .use(authPlugin)

  // GET /api/logs
  .get('/',
    async ({ query, workspaceId }) => {
      const { level, search, source, limit = '100' } = query;
      const take = Math.min(Number(limit), 500);

      const rows = await sql<{
        id: number; level: string; message: string; source: string; createdAt: Date;
      }[]>`
        SELECT
          id, level, message, source,
          created_at AS "createdAt"
        FROM logs
        WHERE workspace_id = ${workspaceId}
          AND (${level  ?? null}::text IS NULL OR level  = ${level  ?? null}::text)
          AND (${source ?? null}::text IS NULL OR source ILIKE ${'%' + (source ?? '') + '%'})
          AND (
            ${search ?? null}::text IS NULL
            OR message ILIKE ${'%' + (search ?? '') + '%'}
            OR source  ILIKE ${'%' + (search ?? '') + '%'}
          )
        ORDER BY created_at DESC
        LIMIT ${take}
      `;

      const [counts] = await sql<{
        total: number; ok: number; info: number; warn: number; error: number;
      }[]>`
        SELECT
          COUNT(*)                                          AS total,
          COUNT(*) FILTER (WHERE level = 'ok')             AS ok,
          COUNT(*) FILTER (WHERE level = 'info')           AS info,
          COUNT(*) FILTER (WHERE level = 'warn')           AS warn,
          COUNT(*) FILTER (WHERE level = 'error')          AS error
        FROM logs
        WHERE workspace_id = ${workspaceId}
      `;

      return { data: rows, counts };
    },
    {
      query: t.Object({
        level:  t.Optional(t.String()),
        search: t.Optional(t.String()),
        source: t.Optional(t.String()),
        limit:  t.Optional(t.String()),
      }),
    }
  )

  // GET /api/logs/stream — Server-Sent Events (logs em tempo real)
  .get('/stream', async ({ userId, workspaceId, set }) => {
    if (!incStream(userId)) {
      set.status = 429;
      return new Response('Limite de conexões simultâneas atingido.', { status: 429 });
    }

    let lastId = 0;
    const [latest] = await sql<{ id: number }[]>`
      SELECT id FROM logs WHERE workspace_id = ${workspaceId} ORDER BY id DESC LIMIT 1
    `;
    if (latest) lastId = Number(latest.id);

    const enc      = new TextEncoder();
    let   active   = true;
    const deadline = Date.now() + STREAM_MAX_MS;

    const stream = new ReadableStream({
      async start(controller) {
        const enq = (s: string) => {
          try { controller.enqueue(enc.encode(s)); return true; }
          catch { active = false; return false; }
        };

        if (!enq(': connected\n\n')) { decStream(userId); return; }

        while (active && Date.now() < deadline) {
          await new Promise<void>(r => setTimeout(r, 2000));
          if (!active || Date.now() >= deadline) break;

          try {
            const rows = await sql<{
              id: number; level: string; message: string; source: string; createdAt: string;
            }[]>`
              SELECT id, level, message, source,
                to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "createdAt"
              FROM logs
              WHERE workspace_id = ${workspaceId} AND id > ${lastId}
              ORDER BY id ASC LIMIT 50
            `;
            for (const row of rows) {
              if (Number(row.id) > lastId) lastId = Number(row.id);
              if (!enq(`data: ${JSON.stringify(row)}\n\n`)) { decStream(userId); return; }
            }
            if (!enq(': heartbeat\n\n')) { decStream(userId); return; }
          } catch { active = false; break; }
        }

        decStream(userId);
        if (Date.now() >= deadline) enq('event: timeout\ndata: {}\n\n');
        try { controller.close(); } catch {}
      },
      cancel() { active = false; decStream(userId); },
    });

    return new Response(stream, {
      headers: {
        'Content-Type':      'text/event-stream',
        'Cache-Control':     'no-cache',
        'Connection':        'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  })

  // POST /api/logs
  .post('/',
    async ({ body, set, userId, workspaceId }) => {
      const { level, message, source } = body;

      const [log] = await sql`
        INSERT INTO logs (level, message, source, user_id, workspace_id)
        VALUES (${level}, ${message}, ${source ?? 'system'}, ${userId}, ${workspaceId})
        RETURNING id, level, message, source, created_at AS "createdAt"
      `;

      set.status = 201;
      return { data: log };
    },
    {
      body: t.Object({
        level:   t.Union([t.Literal('info'), t.Literal('warn'), t.Literal('error'), t.Literal('ok')]),
        message: t.String({ minLength: 1, maxLength: 2000 }),
        source:  t.Optional(t.String({ maxLength: 200 })),
      }),
    }
  );
