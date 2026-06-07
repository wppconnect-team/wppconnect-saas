import React from 'react';
import { useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakSelect, TweakButton } from './components/tweaks';
import { Sidebar } from './components/chrome';
import Ic from './components/icons';
import { isDemo, setDemo, clearDemo } from './services/api';
import { authService } from './services/auth';

function SetPasswordModal({ onDone }) {
  const [pwd,     setPwd]     = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [busy,    setBusy]    = React.useState(false);
  const [error,   setError]   = React.useState('');
  const [show,    setShow]    = React.useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (pwd !== confirm) { setError('As senhas não coincidem.'); return; }
    if (pwd.length < 6)  { setError('A senha deve ter pelo menos 6 caracteres.'); return; }
    setBusy(true); setError('');
    try {
      await authService.setPassword(pwd);
      onDone();
    } catch (err) {
      setError(err?.error ?? 'Erro ao definir senha. Tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  const strength = pwd.length === 0 ? 0
    : pwd.length < 6  ? 1
    : pwd.length < 10 ? 2
    : /[A-Z]/.test(pwd) && /[0-9]/.test(pwd) && /[^A-Za-z0-9]/.test(pwd) ? 4
    : 3;
  const strengthLabel = ['', 'Fraca', 'Razoável', 'Boa', 'Forte'];
  const strengthColor = ['', 'var(--rose-ink,#e55)', '#e08030', '#3a9', 'var(--accent)'];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
      display: 'grid', placeItems: 'center', zIndex: 100 }}>
      <form onSubmit={submit} style={{
        background: 'var(--panel)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
        width: 420, maxWidth: '92vw', overflow: 'hidden',
        animation: 'slideUp 0.18s ease-out',
      }}>
        <div style={{ padding: '24px 24px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Ic.KeyRound style={{ width: 20, height: 20, color: 'var(--accent)' }}/>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' }}>
                Defina sua senha
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>
                Esta é sua primeira entrada. Crie uma senha segura antes de continuar.
              </p>
            </div>
          </div>

          <div className="field" style={{ marginBottom: 12 }}>
            <label>Nova senha</label>
            <div style={{ position: 'relative' }}>
              <input
                type={show ? 'text' : 'password'}
                value={pwd}
                onChange={e => setPwd(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                autoFocus
                required
                style={{ paddingRight: 38 }}
              />
              <button type="button" onClick={() => setShow(s => !s)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', padding: 0 }}>
                {show ? <Ic.EyeOff style={{ width: 15, height: 15 }}/> : <Ic.Eye style={{ width: 15, height: 15 }}/>}
              </button>
            </div>
            {pwd.length > 0 && (
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 2, transition: 'width 0.2s, background 0.2s',
                    width: `${strength * 25}%`, background: strengthColor[strength],
                  }}/>
                </div>
                <span style={{ fontSize: 11, color: strengthColor[strength], fontWeight: 600 }}>
                  {strengthLabel[strength]}
                </span>
              </div>
            )}
          </div>

          <div className="field" style={{ marginBottom: 4 }}>
            <label>Confirmar senha</label>
            <input
              type={show ? 'text' : 'password'}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repita a senha"
              required
            />
            {confirm.length > 0 && pwd !== confirm && (
              <div style={{ fontSize: 12, color: 'var(--rose-ink,#e55)', marginTop: 4 }}>
                As senhas não coincidem
              </div>
            )}
          </div>

          {error && (
            <div style={{ padding: '8px 12px', background: 'var(--rose-soft,#fff0f0)',
              border: '1px solid var(--rose-border,#fcc)', color: 'var(--rose-ink,#e55)',
              fontSize: 13, borderRadius: 6, marginTop: 8 }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8,
          padding: '14px 24px', borderTop: '1px solid var(--border)', background: 'var(--panel-2)' }}>
          <button type="submit" className="btn primary"
            disabled={busy || pwd.length < 6 || pwd !== confirm}>
            {busy ? 'Salvando…' : <><Ic.Check/> Definir senha e entrar</>}
          </button>
        </div>
      </form>
    </div>
  );
}
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ConexoesPage from './pages/ConexoesPage';
import ContatosPage from './pages/ContatosPage';
import GruposPage from './pages/GruposPage';
import WebhooksPage from './pages/WebhooksPage';
import ApiPage from './pages/ApiPage';
import LogsPage from './pages/LogsPage';
import ConfigPage from './pages/ConfigPage';

const DEFAULTS = { accent: '165', theme: 'light' };

const PAGE_META = {
  dashboard: { crumbs: ['Workspace', 'Visão geral', 'Dashboard'] },
  conexoes:  { crumbs: ['Workspace', 'Engajamento', 'Conexões']  },
  contatos:  { crumbs: ['Workspace', 'Engajamento', 'Contatos']  },
  grupos:    { crumbs: ['Workspace', 'Engajamento', 'Grupos']    },
  webhooks:  { crumbs: ['Workspace', 'Desenvolvedor', 'Webhooks'] },
  api:       { crumbs: ['Workspace', 'Desenvolvedor', 'API & Tokens'] },
  logs:      { crumbs: ['Workspace', 'Desenvolvedor', 'Logs']    },
  config:    { crumbs: ['Workspace', 'Conta', 'Configurações']   },
};

function AppTopbar({ nav, theme, setTheme, onMenuClick }) {
  const meta = PAGE_META[nav] || PAGE_META.dashboard;
  const c = meta.crumbs;
  return (
    <div className="topbar">
      <button className="hamburger-btn" onClick={onMenuClick} title="Menu">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>
      <div className="crumbs">
        <span>{c[0]}</span><span className="sep">/</span>
        <span>{c[1]}</span><span className="sep">/</span>
        <span className="current">{c[2]}</span>
      </div>
      <div className="topbar-spacer"/>
      <div className="search">
        <Ic.Search style={{ color: 'var(--ink-4)' }}/>
        <input placeholder="Buscar sessões, contatos, logs…" />
        <span className="kbd">⌘K</span>
      </div>
      <button className="icon-btn" title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
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
      <button className="icon-btn" title="Novidades"><Ic.Bell/><span className="dot"/></button>
      <button className="icon-btn" title="Ajuda"><Ic.Help/></button>
    </div>
  );
}

const VALID_PAGES = new Set(['dashboard','conexoes','contatos','grupos','webhooks','api','logs','config']);

function getPageFromHash() {
  const page = window.location.hash.slice(1);
  return VALID_PAGES.has(page) ? page : 'dashboard';
}

export default function App() {
  const [user, setUser]                   = React.useState(null);
  const [currentNav, setCurrentNavState]  = React.useState(getPageFromHash);
  const [toasts, setToasts]               = React.useState([]);
  const [authed, setAuthed]               = React.useState(false);
  const [authChecked, setAuthChecked]     = React.useState(false);
  const [mustChangePwd, setMustChangePwd] = React.useState(false);
  const [sidebarOpen, setSidebarOpen]       = React.useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(
    () => localStorage.getItem('sidebar_collapsed') === 'true'
  );

  const toggleSidebarCollapse = () => setSidebarCollapsed(c => {
    localStorage.setItem('sidebar_collapsed', String(!c));
    return !c;
  });

  // Salva preferências no banco com debounce de 600ms
  const prefsTimerRef = React.useRef(null);
  const savePreferences = React.useCallback((key, val) => {
    clearTimeout(prefsTimerRef.current);
    prefsTimerRef.current = setTimeout(() => {
      authService.updatePreferences({ [key]: val }).catch(() => {});
    }, 600);
  }, []);

  const [tweaks, setTweaks] = useTweaks(DEFAULTS, user?.preferences, savePreferences);

  // Verificar sessão ao iniciar: demo flag (sessionStorage) ou cookie HttpOnly via /me
  React.useEffect(() => {
    if (isDemo()) {
      setAuthed(true);
      setAuthChecked(true);
      return;
    }
    authService.me()
      .then(data => {
        setUser(data.user);
        setAuthed(true);
        if (data.mustChangePassword) setMustChangePwd(true);
      })
      .catch(() => {}) // não autenticado — permanece na tela de login
      .finally(() => setAuthChecked(true));
  }, []);

  const navigate = React.useCallback((page) => {
    setCurrentNavState(page);
    window.location.hash = page;
  }, []);

  React.useEffect(() => {
    const onHashChange = () => setCurrentNavState(getPageFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const theme = tweaks.theme || 'light';
  const setTheme = (t) => setTweaks('theme', t);

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  React.useEffect(() => {
    const hue = tweaks.accent;
    const r = document.documentElement.style;
    if (theme === 'dark') {
      r.setProperty('--accent',        `oklch(0.78 0.16 ${hue})`);
      r.setProperty('--accent-ink',    `oklch(0.92 0.10 ${hue})`);
      r.setProperty('--accent-soft',   `oklch(0.32 0.08 ${hue})`);
      r.setProperty('--accent-border', `oklch(0.42 0.10 ${hue})`);
    } else {
      r.setProperty('--accent',        `oklch(0.72 0.14 ${hue})`);
      r.setProperty('--accent-ink',    `oklch(0.38 0.08 ${hue})`);
      r.setProperty('--accent-soft',   `oklch(0.96 0.03 ${hue})`);
      r.setProperty('--accent-border', `oklch(0.88 0.06 ${hue})`);
    }
  }, [tweaks.accent, theme]);

  const toast = (msg, kind = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2600);
  };

  // demo=true → SSO simulado sem credenciais reais; demo=false → login real
  const login = async (demo = false, mustChange = false) => {
    if (demo) {
      setDemo();
    } else {
      try {
        const data = await authService.me();
        setUser(data.user);
      } catch {}
    }
    setAuthed(true);
    if (mustChange) {
      setMustChangePwd(true);
    } else {
      navigate('dashboard');
    }
  };

  const logout = async () => {
    clearDemo();
    try { await authService.logout(); } catch { /* ignora — cookie expira naturalmente */ }
    setUser(null);
    setAuthed(false);
    setMustChangePwd(false);
    history.pushState('', document.title, window.location.pathname);
  };

  // Aguarda verificação do token antes de renderizar
  if (!authChecked) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--ink-4)', fontSize: 14 }}>
        Carregando…
      </div>
    );
  }

  if (!authed) {
    return <LoginPage onLogin={login} theme={theme} setTheme={setTheme}/>;
  }

  const renderPage = () => {
    switch (currentNav) {
      case 'dashboard': return <DashboardPage toast={toast}/>;
      case 'conexoes':  return <ConexoesPage  toast={toast}/>;
      case 'contatos':  return <ContatosPage  toast={toast}/>;
      case 'grupos':    return <GruposPage    toast={toast}/>;
      case 'webhooks':  return <WebhooksPage  toast={toast}/>;
      case 'api':       return <ApiPage       toast={toast}/>;
      case 'logs':      return <LogsPage      toast={toast}/>;
      case 'config':    return <ConfigPage    toast={toast} user={user}/>;
      default:          return <DashboardPage toast={toast}/>;
    }
  };

  return (
    <div className={"app" + (sidebarCollapsed ? " sidebar-collapsed" : "")}>
      {mustChangePwd && (
        <SetPasswordModal onDone={() => { setMustChangePwd(false); navigate('dashboard'); }}/>
      )}
      <Sidebar currentNav={currentNav} onNav={navigate} onLogout={logout}
        open={sidebarOpen} onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebarCollapse}/>
      <div className="main">
        <AppTopbar nav={currentNav} theme={theme} setTheme={setTheme}
          onMenuClick={() => setSidebarOpen(s => !s)}/>
        <div className="scroll-area" key={currentNav}>
          {renderPage()}
        </div>
      </div>

      <div className="toast-stack">
        {toasts.map(t => (
          <div key={t.id} className={"toast " + t.kind}>
            <Ic.Check/> {t.msg}
          </div>
        ))}
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection title="Tema">
          <TweakRadio label="Modo" value={theme} onChange={setTheme}
            options={[{ value: 'light', label: 'Claro' }, { value: 'dark', label: 'Escuro' }]}/>
        </TweakSection>
        <TweakSection title="Aparência">
          <TweakSelect label="Tom de acento" value={tweaks.accent}
            onChange={(v) => setTweaks('accent', v)}
            options={[
              { value: '165', label: 'Emerald' },
              { value: '195', label: 'Teal'    },
              { value: '240', label: 'Blue'    },
              { value: '285', label: 'Violet'  },
              { value: '25',  label: 'Orange'  },
              { value: '350', label: 'Pink'    },
            ]}/>
        </TweakSection>
        <TweakSection title="Sessão">
          <TweakButton label="Sair (voltar para login)" onClick={logout}/>
        </TweakSection>
        <TweakSection title="Navegação">
          <TweakSelect label="Ir para página" value={currentNav} onChange={navigate}
            options={[
              { value: 'dashboard', label: 'Dashboard'      },
              { value: 'conexoes',  label: 'Conexões'       },
              { value: 'contatos',  label: 'Contatos'       },
              { value: 'grupos',    label: 'Grupos'         },
              { value: 'webhooks',  label: 'Webhooks'       },
              { value: 'api',       label: 'API & Tokens'   },
              { value: 'logs',      label: 'Logs'           },
              { value: 'config',    label: 'Configurações'  },
            ]}/>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}
