import React from 'react';
import { useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakSelect, TweakButton } from './components/tweaks';
import { Sidebar } from './components/chrome';
import Ic from './components/icons';
import { isDemo, setDemo, clearDemo } from './services/api';
import { authService } from './services/auth';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ConexoesPage from './pages/ConexoesPage';
import ContatosPage from './pages/ContatosPage';
import WebhooksPage from './pages/WebhooksPage';
import ApiPage from './pages/ApiPage';
import LogsPage from './pages/LogsPage';
import ConfigPage from './pages/ConfigPage';

const DEFAULTS = { accent: '165', theme: 'light' };

const PAGE_META = {
  dashboard: { crumbs: ['Workspace', 'Visão geral', 'Dashboard'] },
  conexoes:  { crumbs: ['Workspace', 'Engajamento', 'Conexões']  },
  contatos:  { crumbs: ['Workspace', 'Engajamento', 'Contatos']  },
  webhooks:  { crumbs: ['Workspace', 'Desenvolvedor', 'Webhooks'] },
  api:       { crumbs: ['Workspace', 'Desenvolvedor', 'API & Tokens'] },
  logs:      { crumbs: ['Workspace', 'Desenvolvedor', 'Logs']    },
  config:    { crumbs: ['Workspace', 'Conta', 'Configurações']   },
};

function AppTopbar({ nav, theme, setTheme }) {
  const meta = PAGE_META[nav] || PAGE_META.dashboard;
  const c = meta.crumbs;
  return (
    <div className="topbar">
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

const VALID_PAGES = new Set(['dashboard','conexoes','contatos','webhooks','api','logs','config']);

function getPageFromHash() {
  const page = window.location.hash.slice(1);
  return VALID_PAGES.has(page) ? page : 'dashboard';
}

export default function App() {
  const [user, setUser]                 = React.useState(null);
  const [currentNav, setCurrentNavState] = React.useState(getPageFromHash);
  const [toasts, setToasts] = React.useState([]);
  const [authed, setAuthed]             = React.useState(false);
  const [authChecked, setAuthChecked]   = React.useState(false);

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
      .then(data => { setUser(data.user); setAuthed(true); })
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

  // demo=true → SSO simulado sem credenciais reais; demo=false → login real (cookie já foi setado pelo servidor)
  const login = async (demo = false) => {
    if (demo) {
      setDemo();
    } else {
      // Busca dados do usuário (inclui preferences) após login bem-sucedido
      try {
        const data = await authService.me();
        setUser(data.user);
      } catch {}
    }
    setAuthed(true);
    navigate('dashboard');
  };

  const logout = async () => {
    clearDemo();
    try { await authService.logout(); } catch { /* ignora — cookie expira naturalmente */ }
    setUser(null);
    setAuthed(false);
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
      case 'webhooks':  return <WebhooksPage  toast={toast}/>;
      case 'api':       return <ApiPage       toast={toast}/>;
      case 'logs':      return <LogsPage      toast={toast}/>;
      case 'config':    return <ConfigPage    toast={toast} user={user}/>;
      default:          return <DashboardPage toast={toast}/>;
    }
  };

  return (
    <div className="app">
      <Sidebar currentNav={currentNav} onNav={navigate} onLogout={logout} />
      <div className="main">
        <AppTopbar nav={currentNav} theme={theme} setTheme={setTheme}/>
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
