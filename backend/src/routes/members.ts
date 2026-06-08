import { Elysia, t } from 'elysia';
import { authPlugin } from '../plugins/auth';
import { sql } from '../db';

async function requireAdmin(userId: string, workspaceId: string): Promise<boolean> {
  const [u] = await sql<{ role: string }[]>`
    SELECT role FROM users
    WHERE id = ${userId} AND workspace_id = ${workspaceId}
  `;
  return u?.role === 'admin';
}

export const memberRoutes = new Elysia({ prefix: '/api/members' })
  .use(authPlugin)

  // GET /api/members — apenas admins do workspace
  .get('/', async ({ userId, workspaceId, set }) => {
    if (!(await requireAdmin(userId, workspaceId))) {
      set.status = 403;
      return { error: 'Acesso negado. Apenas administradores podem gerenciar membros.' };
    }

    const rows = await sql<{
      id: string; name: string; email: string;
      role: string; memberStatus: string; createdAt: string;
    }[]>`
      SELECT id, name, email, role,
             member_status AS "memberStatus",
             created_at   AS "createdAt"
      FROM users
      WHERE workspace_id = ${workspaceId}
      ORDER BY created_at ASC
    `;
    return { data: rows, currentUserId: userId };
  })

  // POST /api/members — convite (apenas admins)
  .post('/',
    async ({ body, set, userId, workspaceId }) => {
      if (!(await requireAdmin(userId, workspaceId))) {
        set.status = 403;
        return { error: 'Acesso negado. Apenas administradores podem convidar membros.' };
      }

      const { name, email, role } = body;

      const [existing] = await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
      if (existing) {
        set.status = 409;
        return { error: 'Este e-mail já está cadastrado.' };
      }

      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
      const tempPassword = Array.from({ length: 12 }, () =>
        chars[Math.floor(Math.random() * chars.length)]
      ).join('');

      const [member] = await sql<{ id: string; name: string; email: string; role: string }[]>`
        INSERT INTO users (name, email, password_hash, role, member_status, must_change_password, workspace_id)
        VALUES (
          ${name},
          ${email},
          crypt(${tempPassword}, gen_salt('bf', 10)),
          ${role},
          'invited',
          TRUE,
          ${workspaceId}
        )
        RETURNING id, name, email, role
      `;

      set.status = 201;
      return { data: { ...member, memberStatus: 'invited' }, tempPassword };
    },
    {
      body: t.Object({
        name:  t.String({ minLength: 2, maxLength: 100 }),
        email: t.String({ format: 'email', maxLength: 254 }),
        role:  t.Union([t.Literal('admin'), t.Literal('editor'), t.Literal('viewer')]),
      }),
    }
  )

  // PATCH /api/members/:id — alterar papel (apenas admins)
  .patch('/:id',
    async ({ params, body, userId, workspaceId, set }) => {
      if (!(await requireAdmin(userId, workspaceId))) {
        set.status = 403;
        return { error: 'Acesso negado. Apenas administradores podem alterar papéis.' };
      }

      if (params.id === userId) {
        set.status = 400;
        return { error: 'Você não pode alterar o seu próprio papel.' };
      }

      const [updated] = await sql<{ id: string; name: string; email: string; role: string }[]>`
        UPDATE users SET role = ${body.role}
        WHERE id = ${params.id}
          AND workspace_id = ${workspaceId}
        RETURNING id, name, email, role
      `;

      if (!updated) { set.status = 404; return { error: 'Membro não encontrado.' }; }
      return { data: updated };
    },
    {
      body: t.Object({
        role: t.Union([t.Literal('admin'), t.Literal('editor'), t.Literal('viewer')]),
      }),
    }
  )

  // DELETE /api/members/:id — apenas admins
  .delete('/:id', async ({ params, userId, workspaceId, set }) => {
    if (!(await requireAdmin(userId, workspaceId))) {
      set.status = 403;
      return { error: 'Acesso negado. Apenas administradores podem remover membros.' };
    }

    if (params.id === userId) {
      set.status = 400;
      return { error: 'Você não pode remover a si mesmo.' };
    }

    const [target] = await sql<{ role: string }[]>`
      SELECT role FROM users WHERE id = ${params.id} AND workspace_id = ${workspaceId}
    `;
    if (!target) { set.status = 404; return { error: 'Membro não encontrado.' }; }

    if (target.role === 'admin') {
      const [{ count }] = await sql<{ count: string }[]>`
        SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND workspace_id = ${workspaceId}
      `;
      if (parseInt(count) <= 1) {
        set.status = 400;
        return { error: 'Não é possível remover o único administrador.' };
      }
    }

    await sql`DELETE FROM users WHERE id = ${params.id} AND workspace_id = ${workspaceId}`;
    set.status = 204;
    return null;
  });
