type RuntimeAssignment = {
  uuid?: string;
  worker?: string;
  origin?: string;
  runtime?: string;
  provider?: string;
  containerPort?: number;
  container_port?: number;
  status?: string;
  [key: string]: unknown;
};

export type SessionRuntime = {
  id: string;
  wppToken?: string;
  origin?: string;
  runtime?: string;
  provider?: string;
  worker?: string;
  containerPort?: number;
};

const LEGACY_WPP_SERVER = trimTrailingSlash(process.env.WPP_SERVER ?? 'http://localhost:21465/api');
const WPP_SECRET_KEY = process.env.WPP_SECRET_KEY;
const MANAGER_URL = trimTrailingSlash(process.env.WPP_MANAGER_URL ?? '');
const MANAGER_TOKEN = process.env.WPP_MANAGER_TOKEN;

export const DEFAULT_ORIGIN = process.env.WPP_ORIGIN ?? 'wppconnect-cloud';
export const DEFAULT_RUNTIME = process.env.WPP_DEFAULT_RUNTIME ?? 'wppconnect-server';
export const DEFAULT_PROVIDER = process.env.WPP_DEFAULT_PROVIDER ?? 'wppconnect';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function authHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

export async function generateLegacyToken(sessionId: string): Promise<string> {
  if (!WPP_SECRET_KEY) return '';

  try {
    const res = await fetch(`${LEGACY_WPP_SERVER}/${sessionId}/${WPP_SECRET_KEY}/generate-token`, {
      method: 'POST',
    });
    if (!res.ok) return '';
    const data = await readJson(res);
    return typeof data.token === 'string' ? data.token : '';
  } catch (err) {
    console.error('[WppConnect] generate-token falhou:', err);
    return '';
  }
}

export async function requestManagerAssignment(input: {
  sessionId: string;
  origin: string;
  runtime: string;
  provider: string;
  webhook?: string;
}): Promise<RuntimeAssignment | null> {
  if (!MANAGER_URL) return null;

  const res = await fetch(`${MANAGER_URL}/api/startSession`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(MANAGER_TOKEN),
    },
    body: JSON.stringify({
      origin: input.origin,
      runtime: input.runtime,
      provider: input.provider,
      sessionUuid: input.sessionId,
      webhook: input.webhook || undefined,
      waitQrCode: false,
    }),
  });

  const data = await readJson(res);
  if (!res.ok) {
    throw new Error(
      typeof data.error === 'string'
        ? data.error
        : `Manager retornou HTTP ${res.status} ao criar sessão`
    );
  }

  return data as RuntimeAssignment;
}

export async function callRuntimeJson(
  session: SessionRuntime,
  path: string,
  init: RequestInit = {}
): Promise<{ status: number; ok: boolean; data: Record<string, unknown> }> {
  const baseUrl = MANAGER_URL || LEGACY_WPP_SERVER;
  const res = await fetch(`${baseUrl}/api/${session.id}/${path.replace(/^\/+/, '')}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(MANAGER_URL ? authHeaders(MANAGER_TOKEN) : authHeaders(session.wppToken || session.id)),
      ...(init.headers ?? {}),
    },
  });

  return { status: res.status, ok: res.ok, data: await readJson(res) };
}

export async function callRuntimeQrCode(session: SessionRuntime): Promise<{
  status: number;
  ok: boolean;
  data: Record<string, unknown>;
}> {
  const baseUrl = MANAGER_URL || LEGACY_WPP_SERVER;
  const res = await fetch(`${baseUrl}/api/${session.id}/qrcode-session`, {
    headers: {
      ...(MANAGER_URL ? authHeaders(MANAGER_TOKEN) : authHeaders(session.wppToken || session.id)),
    },
  });

  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('image/')) {
    const bytes = Buffer.from(await res.arrayBuffer());
    return {
      status: res.status,
      ok: res.ok,
      data: {
        status: res.ok ? 'qr' : 'error',
        qrcode: `data:${contentType.split(';')[0]};base64,${bytes.toString('base64')}`,
      },
    };
  }

  return { status: res.status, ok: res.ok, data: await readJson(res) };
}
