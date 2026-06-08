import { Elysia, t } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { randomBytes } from 'crypto';
import { sql } from '../db';
import { checkRateLimit } from '../plugins/rateLimit';
import { sendPasswordResetEmail } from '../lib/mailer';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET env var is required');
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

function makeSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .split('').filter(c => c.charCodeAt(0) < 0x0300 || c.charCodeAt(0) > 0x036f).join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'workspace';
}

export const authRoutes = new Elysia({ prefix: '/api/auth' })
  .use(jwt({ name: 'jwt', secret: JWT_SECRET }))

  // POST /api/auth/login
  .post('/login',
    async ({ body, jwt, cookie: { auth }, set, request, server }) => {
      const xRealIp = request.headers.get('x-real-ip')?.trim();
      const xForwardedFor = request.headers.get('x-forwarded-for');
      const lastForwardedIp = xForwardedFor?.split(',').at(-1)?.trim();
      const ip = xRealIp ?? lastForwardedIp ?? server?.requestIP(request)?.address ?? 'unknown';

      if (!checkRateLimit(`login:${ip}`, 5, 15 * 60 * 1000)) {
        set.status = 429;
        return { error: 'Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.' };
      }

      const { email, password, turnstileToken } = body;

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
        id: string; name: string; email: string;
        mustChangePassword: boolean; workspaceId: string;
      }[]>`
        SELECT id, name, email,
               must_change_password AS "mustChangePassword",
               workspace_id         AS "workspaceId"
        FROM users
        WHERE email         = ${email}
          AND password_hash = crypt(${password}, password_hash)
        LIMIT 1
      `;

      if (!user) {
        set.status = 401;
        return { error: 'Email ou senha inválidos' };
      }

      const token = await jwt.sign({
        sub:   user.id,
        email: user.email,
        wid:   user.workspaceId,
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

      return {
        user:               { id: user.id, name: user.name, email: user.email },
        mustChangePassword: user.mustChangePassword,
        expiresIn:          JWT_EXPIRES,
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
        id: string; name: string; email: string; role: string;
        preferences: Record<string,unknown>; createdAt: Date;
        mustChangePassword: boolean;
        workspaceId: string; workspaceName: string; workspaceSlug: string;
      }[]>`
        SELECT u.id, u.name, u.email, u.role, u.preferences,
               u.created_at         AS "createdAt",
               u.must_change_password AS "mustChangePassword",
               u.workspace_id       AS "workspaceId",
               w.name               AS "workspaceName",
               w.slug               AS "workspaceSlug"
        FROM users u
        LEFT JOIN workspaces w ON w.id = u.workspace_id
        WHERE u.id = ${payload.sub as string}
        LIMIT 1
      `;

      if (!user) { set.status = 404; return { error: 'Usuário não encontrado' }; }
      return { user, mustChangePassword: user.mustChangePassword };
    }
  )

  // POST /api/auth/register — cria novo workspace + usuário admin
  .post('/register',
    async ({ body, jwt, cookie: { auth }, set, request, server }) => {
      const xRealIp = request.headers.get('x-real-ip')?.trim();
      const xForwardedFor = request.headers.get('x-forwarded-for');
      const lastForwardedIp = xForwardedFor?.split(',').at(-1)?.trim();
      const ip = xRealIp ?? lastForwardedIp ?? server?.requestIP(request)?.address ?? 'unknown';

      if (!checkRateLimit(`register:${ip}`, 3, 60 * 60 * 1000)) {
        set.status = 429;
        return { error: 'Muitas tentativas. Aguarde antes de tentar novamente.' };
      }

      const { workspaceName, name, email, password } = body;

      const [existing] = await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
      if (existing) {
        set.status = 409;
        return { error: 'E-mail já cadastrado' };
      }

      // Gera slug único para o workspace
      const base = makeSlug(workspaceName);
      let slug = base;
      let tries = 0;
      while (true) {
        const [taken] = await sql`SELECT id FROM workspaces WHERE slug = ${slug}`;
        if (!taken) break;
        slug = `${base}-${++tries}`;
      }

      const [workspace] = await sql<{ id: string }[]>`
        INSERT INTO workspaces (name, slug)
        VALUES (${workspaceName}, ${slug})
        RETURNING id
      `;

      const [user] = await sql<{ id: string; name: string; email: string }[]>`
        INSERT INTO users (name, email, password_hash, workspace_id, role, must_change_password)
        VALUES (
          ${name},
          ${email},
          crypt(${password}, gen_salt('bf', 10)),
          ${workspace.id},
          'admin',
          FALSE
        )
        RETURNING id, name, email
      `;

      const token = await jwt.sign({
        sub:   user.id,
        email: user.email,
        wid:   workspace.id,
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
      return {
        user:               { id: user.id, name: user.name, email: user.email },
        workspace:          { id: workspace.id, name: workspaceName, slug },
        mustChangePassword: false,
        expiresIn:          JWT_EXPIRES,
      };
    },
    {
      body: t.Object({
        workspaceName: t.String({ minLength: 2, maxLength: 100 }),
        name:          t.String({ minLength: 2, maxLength: 100 }),
        email:         t.String({ format: 'email', maxLength: 254 }),
        password:      t.String({ minLength: 6, maxLength: 1000 }),
      }),
    }
  )

  // PATCH /api/auth/preferences
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

  // POST /api/auth/set-password
  .post('/set-password',
    async ({ body, cookie: { auth }, jwt, set }) => {
      const token = auth?.value as string | undefined;
      if (!token) { set.status = 401; return { error: 'Não autenticado' }; }

      const payload = await jwt.verify(token);
      if (!payload) { auth.remove(); set.status = 401; return { error: 'Sessão expirada' }; }

      const { newPassword } = body;

      await sql`
        UPDATE users
        SET password_hash        = crypt(${newPassword}, gen_salt('bf', 10)),
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

  // POST /api/auth/forgot-password
  .post('/forgot-password',
    async ({ body, set, request, server }) => {
      const xRealIp = request.headers.get('x-real-ip')?.trim();
      const xForwardedFor = request.headers.get('x-forwarded-for');
      const lastForwardedIp = xForwardedFor?.split(',').at(-1)?.trim();
      const ip = xRealIp ?? lastForwardedIp ?? server?.requestIP(request)?.address ?? 'unknown';

      // 5 solicitações por IP a cada 15 minutos
      if (!checkRateLimit(`forgot:${ip}`, 5, 15 * 60 * 1000)) {
        set.status = 429;
        return { error: 'Muitas tentativas. Aguarde antes de tentar novamente.' };
      }

      const { email } = body;
      const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost';

      // Mensagem sempre igual — evita enumeração de e-mails
      const neutral = { message: 'Se o e-mail existir, você receberá instruções em breve.' };

      const [user] = await sql<{ id: string }[]>`
        SELECT id FROM users WHERE email = ${email} LIMIT 1
      `;
      if (!user) return neutral;

      const token   = randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 30 * 60_000); // 30 minutos

      await sql`
        UPDATE users
        SET reset_token = ${token}, reset_token_expires = ${expires}
        WHERE id = ${user.id}
      `;

      const resetUrl = `${FRONTEND_URL}?reset=${token}`;
      const { devLink } = await sendPasswordResetEmail(email, resetUrl);

      return { ...neutral, ...(devLink ? { devLink } : {}) };
    },
    {
      body: t.Object({
        email: t.String({ format: 'email', maxLength: 254 }),
      }),
    }
  )

  // POST /api/auth/reset-password
  .post('/reset-password',
    async ({ body, set }) => {
      const { token, newPassword } = body;

      const [user] = await sql<{ id: string }[]>`
        SELECT id FROM users
        WHERE reset_token        = ${token}
          AND reset_token_expires > NOW()
        LIMIT 1
      `;

      if (!user) {
        set.status = 400;
        return { error: 'Link inválido ou expirado. Solicite um novo link.' };
      }

      await sql`
        UPDATE users
        SET password_hash        = crypt(${newPassword}, gen_salt('bf', 10)),
            must_change_password = FALSE,
            member_status        = 'active',
            reset_token          = NULL,
            reset_token_expires  = NULL
        WHERE id = ${user.id}
      `;

      return { ok: true };
    },
    {
      body: t.Object({
        token:       t.String({ minLength: 64, maxLength: 64 }),
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
