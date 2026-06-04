import { Elysia } from 'elysia';
import { jwt } from '@elysiajs/jwt';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';

export const authPlugin = new Elysia({ name: 'auth-plugin' })
  .use(jwt({ name: 'jwt', secret: JWT_SECRET }))
  .derive({ as: 'scoped' }, async ({ jwt, cookie: { auth }, error }) => {
    const token = auth?.value;
    if (!token) return error(401, { error: 'Não autenticado' });

    const payload = await jwt.verify(token);
    if (!payload) {
      // Cookie existe mas é inválido — limpa
      auth.remove();
      return error(401, { error: 'Sessão expirada' });
    }

    return {
      userId:    (payload.sub   ?? '') as string,
      userEmail: (payload.email ?? '') as string,
    };
  });
