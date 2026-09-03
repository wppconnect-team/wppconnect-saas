import { Elysia } from 'elysia';
import { sql } from '../db';
import { hashOpaqueToken } from '../lib/platform';

export const apiKeyPlugin = new Elysia({ name: 'api-key-plugin' })
  .derive({ as: 'scoped' }, async ({ request }) => {
    const authorization = request.headers.get('authorization') ?? '';
    const plain = authorization.toLowerCase().startsWith('bearer ')
      ? authorization.slice(7).trim()
      : '';
    if (!plain.startsWith('wpp_')) {
      return { apiTokenId: 0, apiWorkspaceId: '', apiScopes: [] as string[] };
    }

    const [token] = await sql<{
      id: number;
      workspaceId: string;
      scopes: string[];
    }[]>`
      UPDATE api_tokens
      SET last_used_at = NOW(), updated_at = NOW()
      WHERE token_hash = ${hashOpaqueToken(plain)}
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > NOW())
      RETURNING id, workspace_id AS "workspaceId", scopes
    `;
    return {
      apiTokenId: token?.id ?? 0,
      apiWorkspaceId: token?.workspaceId ?? '',
      apiScopes: token?.scopes ?? [],
    };
  })
  .onBeforeHandle({ as: 'scoped' }, ({ apiWorkspaceId, set }) => {
    if (!apiWorkspaceId) {
      set.status = 401;
      return { error: 'Chave de API inválida, expirada ou revogada' };
    }
  });
