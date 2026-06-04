import { Elysia } from 'elysia';

export const securityPlugin = new Elysia({ name: 'security' })
  .onAfterHandle({ as: 'global' }, ({ set }) => {
    set.headers['X-Content-Type-Options']  = 'nosniff';
    set.headers['X-Frame-Options']         = 'SAMEORIGIN';
    set.headers['Referrer-Policy']         = 'strict-origin-when-cross-origin';
    set.headers['Permissions-Policy']      = 'camera=(), microphone=(), geolocation=()';
    set.headers['X-XSS-Protection']        = '0'; // desabilitado intencionalmente — CSP é o controle correto
    set.headers['X-DNS-Prefetch-Control']  = 'off';
    if (process.env.NODE_ENV === 'production') {
      set.headers['Strict-Transport-Security'] =
        'max-age=31536000; includeSubDomains; preload';
    }
  });
