export type RuntimeSession = {
  id: string;
  wppToken?: string;
  provider?: string;
  webhook?: string;
};

const WPP_SERVER = trimTrailingSlash(process.env.WPP_SERVER ?? 'http://localhost:21465/api');
const WPP_SECRET_KEY = process.env.WPP_SECRET_KEY ?? process.env.SECRET_KEY ?? 'THISISMYSECURETOKEN';
const DEFAULT_PROVIDER = process.env.WPP_DEFAULT_PROVIDER ?? 'wppconnect';

export function defaultProvider(): string {
  return DEFAULT_PROVIDER;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function authHeaders(token?: string): Record<string, string> {
  return { Authorization: `Bearer ${token || ''}` };
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

export async function generateSessionToken(sessionId: string): Promise<string> {
  const res = await fetch(`${WPP_SERVER}/${sessionId}/${WPP_SECRET_KEY}/generate-token`, {
    method: 'POST',
  });
  const data = await readJson(res);
  if (!res.ok) {
    throw new Error(
      typeof data.message === 'string'
        ? data.message
        : `Token generation failed with HTTP ${res.status}`
    );
  }
  return typeof data.token === 'string' ? data.token : '';
}

export async function callRuntimeJson(
  session: RuntimeSession,
  path: string,
  init: RequestInit = {}
): Promise<{ status: number; ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(`${WPP_SERVER}/${session.id}/${path.replace(/^\/+/, '')}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(session.wppToken),
      ...(init.headers ?? {}),
    },
  });

  return { status: res.status, ok: res.ok, data: await readJson(res) };
}

export async function callRuntimeQrCode(session: RuntimeSession): Promise<{
  status: number;
  ok: boolean;
  data: Record<string, unknown>;
}> {
  const res = await fetch(`${WPP_SERVER}/${session.id}/qrcode-session`, {
    headers: authHeaders(session.wppToken),
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
