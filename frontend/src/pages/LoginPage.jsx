import React from 'react';
import { authService } from '../services/auth';
import Turnstile from '../components/turnstile';
import TermosPage from './TermosPage';
import PrivacidadePage from './PrivacidadePage';

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '';
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

function SsoMark({ kind }) {
  if (kind === 'google') return (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
  if (kind === 'microsoft') return (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <rect x="2" y="2" width="9" height="9" fill="#F25022"/>
      <rect x="13" y="2" width="9" height="9" fill="#7FBA00"/>
      <rect x="2" y="13" width="9" height="9" fill="#00A4EF"/>
      <rect x="13" y="13" width="9" height="9" fill="#FFB900"/>
    </svg>
  );
  if (kind === 'github') return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2c-3.2.69-3.87-1.36-3.87-1.36-.52-1.34-1.28-1.7-1.28-1.7-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.95.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18.92-.26 1.91-.39 2.9-.39s1.97.13 2.9.39c2.21-1.5 3.18-1.18 3.18-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.13v3.16c0 .31.21.68.8.56 4.57-1.52 7.85-5.83 7.85-10.91C23.5 5.65 18.35.5 12 .5z"/>
    </svg>
  );
  if (kind === 'okta') return (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <circle cx="12" cy="12" r="10" fill="none" stroke="#007DC1" strokeWidth="4"/>
    </svg>
  );
  if (kind === 'saml') return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="0"/>
      <path d="M7 11V7a5 5 0 0110 0v4"/>
    </svg>
  );
  return null;
}

function ThemeToggle({ theme, setTheme }) {
  return (
    <button className="theme-toggle-fab" title="Tema"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      {theme === 'dark' ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4"/>
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      )}
    </button>
  );
}

export default function LoginPage({ onLogin, theme, setTheme }) {
  const [email, setEmail]     = React.useState('');
  const [pwd, setPwd]         = React.useState('');
  const [loading, setLoading] = React.useState(null);
  const [loginError, setLoginError]     = React.useState('');
  const [legal, setLegal]               = React.useState(null);
  const [turnstileToken, setTurnstileToken] = React.useState(null);
  const [turnstileError, setTurnstileError] = React.useState(false);

  // Bloqueia envio se Turnstile está configurado mas o desafio não foi concluído
  const turnstileBlocking = TURNSTILE_SITE_KEY && !turnstileToken;

  const submit = async (e) => {
    e?.preventDefault();
    if (turnstileBlocking) return;
    setLoading('email');
    setLoginError('');
    try {
      await authService.login(email, pwd, turnstileToken);
      onLogin(false);
    } catch (err) {
      setLoginError(err?.error ?? 'Email ou senha inválidos');
      setLoading(null);
      // Reseta o widget para forçar nova verificação após erro
      setTurnstileToken(null);
    }
  };

  // SSO simulado — só disponível quando VITE_DEMO_MODE=true no build
  const ssoLogin = (provider) => {
    if (!DEMO_MODE) return;
    setLoading(provider);
    setTimeout(() => onLogin(true), 700);
  };

  return (
    <>
    {legal === 'termos'      && <TermosPage      onClose={() => setLegal(null)}/>}
    {legal === 'privacidade' && <PrivacidadePage onClose={() => setLegal(null)}/>}
    <div className="login-shell">
      <ThemeToggle theme={theme} setTheme={setTheme}/>

      <div className="login-form-wrap">
        <div className="login-form">
          <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="brand-mark">Wpp</div>
            <div className="brand-name">Wppconnect<small>workspace</small></div>
          </div>

          <h1>Entrar no workspace</h1>
          <p className="sub">Acesse seu painel de gerenciamento de conexões WhatsApp.</p>

          {DEMO_MODE && (
            <div className="sso-stack">
              <button className="sso-btn" onClick={() => ssoLogin('google')} disabled={loading}>
                <span className="sso-mark"><SsoMark kind="google"/></span>
                Continuar com Google
                {loading === 'google' && <span className="badge">conectando…</span>}
              </button>
              <button className="sso-btn" onClick={() => ssoLogin('microsoft')} disabled={loading}>
                <span className="sso-mark"><SsoMark kind="microsoft"/></span>
                Continuar com Microsoft
                {loading === 'microsoft' && <span className="badge">conectando…</span>}
              </button>
              <button className="sso-btn" onClick={() => ssoLogin('github')} disabled={loading}>
                <span className="sso-mark"><SsoMark kind="github"/></span>
                Continuar com GitHub
                {loading === 'github' && <span className="badge">conectando…</span>}
              </button>
              <button className="sso-btn" onClick={() => ssoLogin('okta')} disabled={loading}>
                <span className="sso-mark"><SsoMark kind="okta"/></span>
                Continuar com Okta
                <span className="badge">SSO</span>
              </button>
              <button className="sso-btn" onClick={() => ssoLogin('saml')} disabled={loading}>
                <span className="sso-mark"><SsoMark kind="saml"/></span>
                SAML / Provedor corporativo
                <span className="badge">empresa</span>
              </button>
            </div>
          )}
          {DEMO_MODE && <div className="divider">ou com email</div>}

          {!DEMO_MODE && <div className="divider">Acesse com sua conta</div>}

          <form onSubmit={submit}>
            <div className="field">
              <input type="email" placeholder="seuemail@empresa.com"
                value={email} onChange={(e) => setEmail(e.target.value)} required/>
            </div>
            <div className="field">
              <input type="password" placeholder="Senha"
                value={pwd} onChange={(e) => setPwd(e.target.value)} required/>
            </div>
            <div className="field-row">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink-3)' }}>
                <input type="checkbox" defaultChecked/> Manter conectado
              </label>
              <a href="#">Esqueci minha senha</a>
            </div>
            <Turnstile
              siteKey={TURNSTILE_SITE_KEY}
              theme={theme}
              onSuccess={setTurnstileToken}
              onExpire={() => setTurnstileToken(null)}
              onError={() => { setTurnstileToken(null); setTurnstileError(true); }}
            />
            {turnstileError && (
              <div style={{ fontSize: 12, color: 'var(--rose-ink)', marginBottom: 6 }}>
                Falha ao carregar verificação de segurança. Recarregue a página.
              </div>
            )}
            {loginError && (
              <div style={{ padding: '8px 12px', background: 'var(--rose-soft)', border: '1px solid var(--rose-border)', color: 'var(--rose-ink)', fontSize: 13, marginBottom: 8 }}>
                {loginError}
              </div>
            )}
            <button type="submit" className="btn primary block" disabled={!!loading || !!turnstileBlocking}>
              {loading === 'email' ? 'Entrando…' : 'Entrar'}
            </button>
          </form>

          <div className="login-foot">
            Ainda não tem conta? <a href="#">Criar workspace</a>
          </div>
        </div>
      </div>

      <aside className="login-aside">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ink-3)', fontSize: 12.5 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 2s infinite' }}/>
          API operacional · 99.98% últimos 30d
        </div>

        <div className="login-quote">
          <span className="tag">Workspace</span>
          <h2>Múltiplas sessões de WhatsApp num só lugar.</h2>
          <p>
            Conecte, automatize e escale conversas. Webhooks em tempo real,
            templates aprovados e fluxos visuais para times de suporte, vendas e CRM.
          </p>
          <div className="login-stats">
            <div className="s"><b>+12.4k</b><span>workspaces ativos</span></div>
            <div className="s"><b>320M</b><span>mensagens/mês</span></div>
            <div className="s"><b>99.9%</b><span>SLA de entrega</span></div>
          </div>
        </div>

        <div style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>
          © 2026 Wppconnect ·{' '}
          <button onClick={() => setLegal('termos')}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 'inherit', textDecoration: 'underline' }}>
            Termos
          </button>
          {' · '}
          <button onClick={() => setLegal('privacidade')}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 'inherit', textDecoration: 'underline' }}>
            Privacidade
          </button>
        </div>
      </aside>
    </div>
    </>
  );
}
