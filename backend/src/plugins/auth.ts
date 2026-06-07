import { Elysia } from 'elysia';
import { jwt } from '@elysiajs/jwt';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';

export const authPlugin = new Elysia({ name: 'auth-plugin' })
  .use(jwt({ name: 'jwt', secret: JWT_SECRET }))
  .derive({ as: 'scoped' }, async ({ jwt, cookie: { auth } }) => {
    const token = auth?.value as string | undefined;
    if (!token) return { userId: '', userEmail: '' };

    const payload = await jwt.verify(token);
    if (!payload) {
      auth.remove();
      return { userId: '', userEmail: '' };
    }

    return {
      userId:    String(payload.sub   ?? ''),
      userEmail: String((payload as Record<string, unknown>).email ?? ''),
    };
  })
  .onBeforeHandle({ as: 'scoped' }, ({ userId, set }) => {
    if (!userId) {
      set.status = 401;
      return { error: 'Não autenticado' };
    }
  });
