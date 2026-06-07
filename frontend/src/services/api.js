const BASE = import.meta.env.VITE_API_URL ?? '';

// Demo mode: SSO simulado — ativo apenas quando a variável de build está presente
const DEMO_ENABLED = import.meta.env.VITE_DEMO_MODE === 'true';
export function isDemo()    { return DEMO_ENABLED && sessionStorage.getItem('wpp_demo') === '1'; }
export function setDemo()   { if (DEMO_ENABLED) sessionStorage.setItem('wpp_demo', '1'); }
export function clearDemo() { sessionStorage.removeItem('wpp_demo'); }

async function req(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include', // envia o cookie HttpOnly automaticamente
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 204) return null;
  const body = await res.json();
  if (!res.ok) throw body;
  return body;
}

export const api = {
  get:    (p)    => req(p),
  post:   (p, b) => req(p, { method: 'POST',   body: JSON.stringify(b) }),
  put:    (p, b) => req(p, { method: 'PUT',    body: JSON.stringify(b) }),
  delete: (p)    => req(p, { method: 'DELETE' }),
};
