import { Elysia } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { sql } from '../db';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET env var is required');

export const authPlugin = new Elysia({ name: 'auth-plugin' })
  .use(jwt({ name: 'jwt', secret: JWT_SECRET }))
  .derive({ as: 'scoped' }, async ({ jwt, cookie: { auth } }) => {
    const token = auth?.value as string | undefined;
    if (!token) return { userId: '', userEmail: '', workspaceId: '' };

    const payload = await jwt.verify(token);
    if (!payload) {
      auth.remove();
      return { userId: '', userEmail: '', workspaceId: '' };
    }

    const p = payload as Record<string, unknown>;
    const sessionId = String(p.sid ?? '');
    const jti = String(p.jti ?? '');
    const userId = String(p.sub ?? '');
    const workspaceId = String(p.wid ?? '');
    if (!sessionId || !jti || !userId || !workspaceId) {
      auth.remove();
      return { userId: '', userEmail: '', workspaceId: '', sessionId: '' };
    }

    const [session] = await sql`
      SELECT id
      FROM auth_sessions
      WHERE id = ${sessionId}
        AND user_id = ${userId}
        AND workspace_id = ${workspaceId}
        AND current_jti = ${jti}
        AND revoked_at IS NULL
        AND expires_at > NOW()
    `;
    if (!session) {
      auth.remove();
      return { userId: '', userEmail: '', workspaceId: '', sessionId: '' };
    }

    return {
      userId,
      userEmail:   String(p.email ?? ''),
      workspaceId,
      sessionId,
    };
  })
  .onBeforeHandle({ as: 'scoped' }, ({ userId, set }) => {
    if (!userId) {
      set.status = 401;
      return { error: 'Não autenticado' };
    }
  });
