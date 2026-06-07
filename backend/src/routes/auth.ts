import { Elysia, t } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { sql } from '../db';
import { checkRateLimit } from '../plugins/rateLimit';

const JWT_SECRET         = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';
const JWT_EXPIRES        = 60 * 60 * 24; // 24 horas
const IS_PROD            = process.env.NODE_ENV === 'production';
const TURNSTILE_SECRET   = process.env.TURNSTILE_SECRET_KEY ?? '';
const TURNSTILE_VERIFY   = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const res  = await fetch(TURNSTILE_VERIFY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: TURNSTILE_SECRET, response: token, remoteip: ip }),
  });
  const data = await res.json() as { success: boolean };
  return data.success === true;
}

export const authRoutes = new Elysia({ prefix: '/api/auth' })
  .use(jwt({ name: 'jwt', secret: JWT_SECRET }))

  // POST /api/auth/login
  .post('/login',
    async ({ body, jwt, cookie: { auth }, set, request, server }) => {
      // IP real: X-Real-IP (setado pelo Nginx com $remote_addr — não spoofável pelo cliente)
      // Fallback: último valor de X-Forwarded-For (adicionado pelo proxy, não pelo cliente)
      const xRealIp = request.headers.get('x-real-ip')?.trim();
      const xForwardedFor = request.headers.get('x-forwarded-for');
      const lastForwardedIp = xForwardedFor?.split(',').at(-1)?.trim();
      const ip = xRealIp ?? lastForwardedIp ?? server?.requestIP(request)?.address ?? 'unknown';

      // 5 tentativas por IP a cada 15 minutos
      if (!checkRateLimit(`login:${ip}`, 5, 15 * 60 * 1000)) {
        set.status = 429;
        return { error: 'Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.' };
      }

      const { email, password, turnstileToken } = body;

      // Valida Turnstile quando a chave secreta está configurada
      if (TURNSTILE_SECRET) {
        if (!turnstileToken) {
          set.status = 400;
          return { error: 'Verificação de segurança obrigatória.' };
        }
        const passed = await verifyTurnstile(turnstileToken, ip);
        if (!passed) {
          set.status = 403;
          return { error: 'Verificação de segurança falhou. Tente novamente.' };
        }
      }

      const [user] = await sql<{
        id: string; name: string; email: string; mustChangePassword: boolean;
      }[]>`
        SELECT id, name, email, must_change_password AS "mustChangePassword"
        FROM users
        WHERE email          = ${email}
          AND password_hash  = crypt(${password}, password_hash)
        LIMIT 1
      `;

      if (!user) {
        set.status = 401;
        return { error: 'Email ou senha inválidos' };
      }

      const token = await jwt.sign({
        sub:   user.id,
        email: user.email,
        exp:   Math.floor(Date.now() / 1000) + JWT_EXPIRES,
      });

      // HttpOnly — não acessível via JS, protege contra XSS
      auth.set({
        value:    token,
        httpOnly: true,
        secure:   IS_PROD,   // HTTPS obrigatório em produção
        sameSite: 'strict',
        maxAge:   JWT_EXPIRES,
        path:     '/',
      });

      return {
        user:             { id: user.id, name: user.name, email: user.email },
        mustChangePassword: user.mustChangePassword,
        expiresIn:        JWT_EXPIRES,
      };
    },
    {
      body: t.Object({
        email:          t.String({ format: 'email', maxLength: 254 }),
        password:       t.String({ minLength: 1, maxLength: 1000 }),
        turnstileToken: t.Optional(t.String({ maxLength: 2048 })),
      }),
    }
  )

  // GET /api/auth/me
  .get('/me',
    async ({ cookie: { auth }, jwt, set }) => {
      const token = auth?.value;
      if (!token) { set.status = 401; return { error: 'Não autenticado' }; }

      const payload = await jwt.verify(token as string);
      if (!payload) {
        auth.remove();
        set.status = 401;
        return { error: 'Sessão expirada' };
      }

      const [user] = await sql<{
        id: string; name: string; email: string;
        preferences: Record<string,unknown>; createdAt: Date;
        mustChangePassword: boolean;
      }[]>`
        SELECT id, name, email, preferences, created_at AS "createdAt",
               must_change_password AS "mustChangePassword"
        FROM users
        WHERE id = ${payload.sub as string}
        LIMIT 1
      `;

      if (!user) { set.status = 404; return { error: 'Usuário não encontrado' }; }
      return { user, mustChangePassword: user.mustChangePassword };
    }
  )

  // POST /api/auth/register
  .post('/register',
    async ({ body, jwt, cookie: { auth }, set, request, server }) => {
      const xRealIp = request.headers.get('x-real-ip')?.trim();
      const xForwardedFor = request.headers.get('x-forwarded-for');
      const lastForwardedIp = xForwardedFor?.split(',').at(-1)?.trim();
      const ip = xRealIp ?? lastForwardedIp ?? server?.requestIP(request)?.address ?? 'unknown';

      // 3 registros por IP por hora
      if (!checkRateLimit(`register:${ip}`, 3, 60 * 60 * 1000)) {
        set.status = 429;
        return { error: 'Muitas tentativas. Aguarde antes de tentar novamente.' };
      }

      // Registros públicos só são permitidos no primeiro uso (sem nenhum usuário no banco)
      const [anyUser] = await sql`SELECT id FROM users LIMIT 1`;
      if (anyUser) {
        set.status = 403;
        return { error: 'Registros públicos estão desabilitados. Contate o administrador.' };
      }

      const { name, email, password } = body;

      const [existing] = await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
      if (existing) {
        set.status = 409;
        return { error: 'E-mail já cadastrado' };
      }

      const [user] = await sql<{ id: string; name: string; email: string }[]>`
        INSERT INTO users (name, email, password_hash)
        VALUES (${name}, ${email}, crypt(${password}, gen_salt('bf', 10)))
        RETURNING id, name, email
      `;

      const token = await jwt.sign({
        sub:   user.id,
        email: user.email,
        exp:   Math.floor(Date.now() / 1000) + JWT_EXPIRES,
      });

      auth.set({
        value:    token,
        httpOnly: true,
        secure:   IS_PROD,
        sameSite: 'strict',
        maxAge:   JWT_EXPIRES,
        path:     '/',
      });

      set.status = 201;
      return { user: { id: user.id, name: user.name, email: user.email }, expiresIn: JWT_EXPIRES };
    },
    {
      body: t.Object({
        name:     t.String({ minLength: 2, maxLength: 100 }),
        email:    t.String({ format: 'email', maxLength: 254 }),
        password: t.String({ minLength: 6, maxLength: 1000 }),
      }),
    }
  )

  // PATCH /api/auth/preferences — salvar preferências de UI do usuário
  .patch('/preferences',
    async ({ body, cookie: { auth }, jwt, set }) => {
      const token = auth?.value as string | undefined;
      if (!token) { set.status = 401; return { error: 'Não autenticado' }; }
      const payload = await jwt.verify(token);
      if (!payload) { auth.remove(); set.status = 401; return { error: 'Sessão expirada' }; }

      const [user] = await sql<{ preferences: Record<string,unknown> }[]>`
        UPDATE users
        SET preferences = preferences || ${sql.json(body as Parameters<typeof sql.json>[0])}
        WHERE id = ${payload.sub as string}
        RETURNING preferences
      `;
      return { preferences: user.preferences };
    },
    { body: t.Any() }
  )

  // POST /api/auth/set-password — define nova senha (obrigatório no primeiro acesso)
  .post('/set-password',
    async ({ body, cookie: { auth }, jwt, set }) => {
      const token = auth?.value as string | undefined;
      if (!token) { set.status = 401; return { error: 'Não autenticado' }; }

      const payload = await jwt.verify(token);
      if (!payload) { auth.remove(); set.status = 401; return { error: 'Sessão expirada' }; }

      const { newPassword } = body;

      await sql`
        UPDATE users
        SET password_hash       = crypt(${newPassword}, gen_salt('bf', 10)),
            must_change_password = FALSE,
            member_status        = 'active'
        WHERE id = ${payload.sub as string}
      `;

      return { ok: true };
    },
    {
      body: t.Object({
        newPassword: t.String({ minLength: 6, maxLength: 1000 }),
      }),
    }
  )

  // POST /api/auth/logout
  .post('/logout',
    ({ cookie: { auth }, set }) => {
      auth.remove();
      set.status = 204;
      return null;
    }
  );
