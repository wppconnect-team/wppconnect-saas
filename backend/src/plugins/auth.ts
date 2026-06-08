import { Elysia } from 'elysia';
import { jwt } from '@elysiajs/jwt';

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
    return {
      userId:      String(p.sub   ?? ''),
      userEmail:   String(p.email ?? ''),
      workspaceId: String(p.wid   ?? ''),
    };
  })
  .onBeforeHandle({ as: 'scoped' }, ({ userId, set }) => {
    if (!userId) {
      set.status = 401;
      return { error: 'Não autenticado' };
    }
  });
