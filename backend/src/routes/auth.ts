import { Elysia, t } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { randomBytes } from 'crypto';
import type postgres from 'postgres';
import { sql } from '../db';
import { checkRateLimit } from '../plugins/rateLimit';
import { sendPasswordResetEmail } from '../lib/mailer';
import {
  ACCESS_SESSION_SECONDS,
  REFRESH_SESSION_SECONDS,
  clientIpFromHeaders,
  createRotationMaterial,
  createSessionMaterial,
} from '../lib/authSession';
import { hashOpaqueToken } from '../lib/platform';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET env var is required');
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

type SessionUser = { id: string; email: string; workspaceId: string };

function setSessionCookies(
  auth: { set(options: Record<string, unknown>): void },
  refresh: { set(options: Record<string, unknown>): void },
  accessToken: string,
  refreshToken: string
): void {
  auth.set({
    value: accessToken,
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'strict',
    maxAge: ACCESS_SESSION_SECONDS,
    path: '/',
  });
  refresh.set({
    value: refreshToken,
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'strict',
    maxAge: REFRESH_SESSION_SECONDS,
    path: '/api/auth',
  });
}

async function issueSession(
  jwt: { sign(payload: Record<string, string | number>): Promise<string> },
  auth: { set(options: Record<string, unknown>): void },
  refresh: { set(options: Record<string, unknown>): void },
  user: SessionUser,
  request: Request,
  db: postgres.Sql = sql
): Promise<void> {
  const material = createSessionMaterial();
  const ip = clientIpFromHeaders(request.headers);
  await db`
    INSERT INTO auth_sessions (
      id, user_id, workspace_id, refresh_token_hash, current_jti,
      user_agent, ip_address, expires_at
    ) VALUES (
      ${material.sessionId}, ${user.id}, ${user.workspaceId},
      ${material.refreshTokenHash}, ${material.jti},
      ${request.headers.get('user-agent')}, ${ip}::inet, ${material.expiresAt}
    )
  `;
  const accessToken = await jwt.sign({
    sub: user.id,
    email: user.email,
    wid: user.workspaceId,
    sid: material.sessionId,
    jti: material.jti,
    exp: Math.floor(Date.now() / 1000) + ACCESS_SESSION_SECONDS,
  });
  setSessionCookies(auth, refresh, accessToken, material.refreshToken);
}

async function isPayloadSessionActive(payload: Record<string, unknown>): Promise<boolean> {
  const [session] = await sql`
    SELECT id FROM auth_sessions
    WHERE id = ${String(payload.sid ?? '')}
      AND user_id = ${String(payload.sub ?? '')}
      AND workspace_id = ${String(payload.wid ?? '')}
      AND current_jti = ${String(payload.jti ?? '')}
      AND revoked_at IS NULL
      AND expires_at > NOW()
  `;
  return Boolean(session);
}

export const authRoutes = new Elysia({ prefix: '/api/auth' })
  .use(jwt({ name: 'jwt', secret: JWT_SECRET }))

  // POST /api/auth/login
  .post('/login',
    async ({ body, jwt, cookie: { auth, refresh }, set, request, server }) => {
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

      await issueSession(jwt, auth, refresh, user, request);

      return {
        user:               { id: user.id, name: user.name, email: user.email },
        mustChangePassword: user.mustChangePassword,
        expiresIn:          ACCESS_SESSION_SECONDS,
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

      const payload = await jwt.verify(token as string) as Record<string, unknown> | false;
      if (!payload || !(await isPayloadSessionActive(payload))) {
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
    async ({ body, jwt, cookie: { auth, refresh }, set, request, server }) => {
      const xRealIp = request.headers.get('x-real-ip')?.trim();
      const xForwardedFor = request.headers.get('x-forwarded-for');
      const lastForwardedIp = xForwardedFor?.split(',').at(-1)?.trim();
      const ip = xRealIp ?? lastForwardedIp ?? server?.requestIP(request)?.address ?? 'unknown';

      if (!checkRateLimit(`register:${ip}`, 3, 60 * 60 * 1000)) {
        set.status = 429;
        return { error: 'Muitas tentativas. Aguarde antes de tentar novamente.' };
      }

      const { workspaceName, name, email, password } = body;

      const registration = await sql.begin(async (transaction) => {
        const tx = transaction as unknown as postgres.Sql;
        await tx`SELECT pg_advisory_xact_lock(hashtext(lower(${email})))`;

        const [existing] = await tx`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
        if (existing) return null;

        const base = makeSlug(workspaceName);
        let slug = base;
        let tries = 0;
        let workspace: { id: string } | undefined;
        while (!workspace) {
          [workspace] = await tx<{ id: string }[]>`
            INSERT INTO workspaces (name, slug)
            VALUES (${workspaceName}, ${slug})
            ON CONFLICT (slug) DO NOTHING
            RETURNING id
          `;
          if (!workspace) slug = `${base}-${++tries}`;
        }

        const [user] = await tx<{ id: string; name: string; email: string }[]>`
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

        await issueSession(jwt, auth, refresh, {
          id: user.id,
          email: user.email,
          workspaceId: workspace.id,
        }, request, tx);

        return { user, workspace, slug };
      });

      if (!registration) {
        set.status = 409;
        return { error: 'E-mail já cadastrado' };
      }

      set.status = 201;
      return {
        user:               {
          id: registration.user.id,
          name: registration.user.name,
          email: registration.user.email,
        },
        workspace:          {
          id: registration.workspace.id,
          name: workspaceName,
          slug: registration.slug,
        },
        mustChangePassword: false,
        expiresIn:          ACCESS_SESSION_SECONDS,
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
      const payload = await jwt.verify(token) as Record<string, unknown> | false;
      if (!payload || !(await isPayloadSessionActive(payload))) {
        auth.remove(); set.status = 401; return { error: 'Sessão expirada' };
      }

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

      const payload = await jwt.verify(token) as Record<string, unknown> | false;
      if (!payload || !(await isPayloadSessionActive(payload))) {
        auth.remove(); set.status = 401; return { error: 'Sessão expirada' };
      }

      const { newPassword } = body;

      await sql`
        UPDATE users
        SET password_hash        = crypt(${newPassword}, gen_salt('bf', 10)),
            must_change_password = FALSE,
            member_status        = 'active'
        WHERE id = ${payload.sub as string}
      `;

      await sql`
        UPDATE auth_sessions SET revoked_at = NOW()
        WHERE user_id = ${String(payload.sub)}
          AND id <> ${String(payload.sid)}
          AND revoked_at IS NULL
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

      await sql`
        UPDATE auth_sessions SET revoked_at = NOW()
        WHERE user_id = ${user.id} AND revoked_at IS NULL
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

  // POST /api/auth/refresh — rotates both the refresh credential and access JWT
  .post('/refresh', async ({ jwt, cookie: { auth, refresh }, set }) => {
    const current = refresh?.value as string | undefined;
    if (!current?.startsWith('wppr_')) {
      set.status = 401;
      return { error: 'Sessão de renovação ausente' };
    }

    const rotation = createRotationMaterial();
    const [session] = await sql<(SessionUser & { sessionId: string })[]>`
      UPDATE auth_sessions session
      SET refresh_token_hash = ${rotation.refreshTokenHash},
          current_jti = ${rotation.jti},
          rotated_at = NOW()
      FROM users user_account
      WHERE session.refresh_token_hash = ${hashOpaqueToken(current)}
        AND session.user_id = user_account.id
        AND session.revoked_at IS NULL
        AND session.expires_at > NOW()
      RETURNING session.id AS "sessionId", session.user_id AS id,
                session.workspace_id AS "workspaceId", user_account.email
    `;
    if (!session) {
      auth.remove();
      refresh.remove();
      set.status = 401;
      return { error: 'Sessão de renovação inválida ou já utilizada' };
    }

    const accessToken = await jwt.sign({
      sub: session.id,
      email: session.email,
      wid: session.workspaceId,
      sid: session.sessionId,
      jti: rotation.jti,
      exp: Math.floor(Date.now() / 1000) + ACCESS_SESSION_SECONDS,
    });
    setSessionCookies(auth, refresh, accessToken, rotation.refreshToken);
    return { expiresIn: ACCESS_SESSION_SECONDS };
  })

  // POST /api/auth/logout
  .post('/logout',
    async ({ cookie: { auth, refresh }, set }) => {
      const current = refresh?.value as string | undefined;
      if (current) {
        await sql`
          UPDATE auth_sessions SET revoked_at = NOW()
          WHERE refresh_token_hash = ${hashOpaqueToken(current)}
            AND revoked_at IS NULL
        `;
      }
      auth.remove();
      refresh.remove();
      set.status = 204;
      return null;
    }
  );
