import React from 'react';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

// Garante que o script seja carregado uma única vez mesmo com múltiplos renders
let loadPromise = null;

function loadTurnstileScript() {
  if (loadPromise) return loadPromise;
  if (typeof window !== 'undefined' && window.turnstile) {
    return (loadPromise = Promise.resolve());
  }
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src   = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload  = () => resolve();
    script.onerror = () => reject(new Error('Falha ao carregar Turnstile'));
    document.head.appendChild(script);
  });
  return loadPromise;
}

/**
 * Widget do Cloudflare Turnstile.
 *
 * Props:
 *   siteKey   — chave pública (VITE_TURNSTILE_SITE_KEY)
 *   onSuccess — callback(token: string) chamado quando o desafio é aprovado
 *   onExpire  — callback() quando o token expira (~300s)
 *   onError   — callback() em caso de falha
 *   theme     — 'light' | 'dark' | 'auto'  (padrão: 'auto')
 */
export default function Turnstile({ siteKey, onSuccess, onExpire, onError, theme = 'auto' }) {
  const containerRef = React.useRef(null);
  const widgetId     = React.useRef(null);

  React.useEffect(() => {
    if (!siteKey || !containerRef.current) return;

    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || widgetId.current !== null) return;
        widgetId.current = window.turnstile.render(containerRef.current, {
          sitekey:            siteKey,
          theme,
          callback:           onSuccess,
          'expired-callback': onExpire  ?? (() => {}),
          'error-callback':   onError   ?? (() => {}),
        });
      })
      .catch(onError ?? (() => {}));

    return () => {
      cancelled = true;
      if (widgetId.current !== null && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey, theme]);

  if (!siteKey) return null;
  return <div ref={containerRef} style={{ margin: '8px 0' }} />;
}
