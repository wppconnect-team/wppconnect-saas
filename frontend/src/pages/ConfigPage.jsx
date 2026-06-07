import React from 'react';
import Ic from '../components/icons';
import { authService } from '../services/auth';

const SECTIONS = [
  { id: 'workspace', label: 'Workspace',       icon: 'Cog'      },
  { id: 'membros',   label: 'Membros',         icon: 'Users'    },
  { id: 'plano',     label: 'Plano & Billing', icon: 'ChartBar' },
  { id: 'seguranca', label: 'Segurança',       icon: 'KeyRound' },
  { id: 'notif',     label: 'Notificações',    icon: 'Bell'     },
];

function Toggle({ on, onChange }) {
  return (
    <button type="button" onClick={onChange} style={{
      position: 'relative', width: 36, height: 20, border: 'none', flexShrink: 0, cursor: 'pointer',
      background: on ? 'var(--accent)' : 'var(--panel-2)',
      outline: `1px solid ${on ? 'var(--accent-border)' : 'var(--border)'}`,
      borderRadius: 999, padding: 0, transition: 'background 0.15s',
    }}>
      <span style={{
        position: 'absolute', top: 2, left: on ? 18 : 2, width: 16, height: 16,
        borderRadius: '50%', background: on ? '#fff' : 'var(--ink-4)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.15s',
      }}/>
    </button>
  );
}

function SettingsRow({ label, description, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, padding: '13px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--ink-1)' }}>{label}</div>
        {description && <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>{description}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function Card({ title, description, children, danger }) {
  return (
    <div style={{ background: 'var(--panel-1)', border: `1px solid ${danger ? 'var(--rose-border)' : 'var(--border)'}`, padding: '20px 24px', marginBottom: 16 }}>
      <div style={{ marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: danger ? 'var(--rose-ink)' : 'var(--ink-1)' }}>{title}</h4>
        {description && <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>{description}</p>}
      </div>
      {children}
    </div>
  );
}

const PREF_DEFAULTS = { emails: true, autoreply: true, twofa: false, notifications: true, sso: false };

export default function ConfigPage({ toast, user }) {
  const [sec, setSec] = React.useState('workspace');

  // Workspace fields — inicializados de user.preferences se disponível
  const [wsName, setWsName]   = React.useState(user?.preferences?.wsName ?? 'Wppconnect Demo');
  const [wsSlug, setWsSlug]   = React.useState(user?.preferences?.wsSlug ?? 'wppconnect-demo');
  const [wsTz, setWsTz]       = React.useState(user?.preferences?.wsTz   ?? 'brt');
  const [wsSaving, setWsSaving] = React.useState(false);

  // Toggles de preferências — merge com defaults para campos ausentes
  const [prefs, setPrefs] = React.useState(() => ({
    ...PREF_DEFAULTS,
    ...(user?.preferences ?? {}),
  }));

  // Sincroniza quando user?.preferences chega (login async)
  React.useEffect(() => {
    if (!user?.preferences) return;
    setPrefs(p => ({ ...PREF_DEFAULTS, ...user.preferences, ...p }));
    if (user.preferences.wsName) setWsName(user.preferences.wsName);
    if (user.preferences.wsSlug) setWsSlug(user.preferences.wsSlug);
    if (user.preferences.wsTz)   setWsTz(user.preferences.wsTz);
  }, [user?.preferences]);

  const toggle = async (key) => {
    const next = !prefs[key];
    setPrefs(p => ({ ...p, [key]: next }));
    try {
      await authService.updatePreferences({ [key]: next });
    } catch {
      // Reverte em caso de falha
      setPrefs(p => ({ ...p, [key]: !next }));
      toast?.('Erro ao salvar preferência', 'error');
    }
  };

  const saveWorkspace = async () => {
    setWsSaving(true);
    try {
      await authService.updatePreferences({ wsName, wsSlug, wsTz });
      toast?.('Alterações salvas!');
    } catch {
      toast?.('Erro ao salvar configurações', 'error');
    } finally {
      setWsSaving(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Configurações</h1>
          <div className="page-sub">Gerencie preferências do workspace e da sua conta.</div>
        </div>
      </div>

      <div className="settings-grid">
        {/* Side nav */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {SECTIONS.map(s => {
            const Icon = Ic[s.icon];
            return (
              <button key={s.id}
                className={"nav-item" + (sec === s.id ? ' active' : '')}
                onClick={() => setSec(s.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon style={{ width: 14, height: 14, flexShrink: 0 }}/>
                {s.label}
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <div>

          {/* ── Workspace ── */}
          {sec === 'workspace' && (
            <>
              <Card title="Informações do workspace" description="Exibidas em emails, relatórios e integrações.">
                <div className="field">
                  <label>Nome do workspace</label>
                  <input value={wsName} onChange={e => setWsName(e.target.value)}/>
                </div>
                <div className="field">
                  <label>Slug</label>
                  <input value={wsSlug} onChange={e => setWsSlug(e.target.value)} className="mono"/>
                  <div className="hint">URL pública: wppconnect.io/{wsSlug}</div>
                </div>
                <div className="field">
                  <label>Fuso horário</label>
                  <select value={wsTz} onChange={e => setWsTz(e.target.value)}>
                    <option value="brt">America/Sao_Paulo (BRT −3)</option>
                    <option value="est">America/New_York (EST −5)</option>
                    <option value="wet">Europe/Lisbon (WET +0)</option>
                  </select>
                </div>
                <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                  <button className="btn primary" onClick={saveWorkspace} disabled={wsSaving}>
                    {wsSaving ? 'Salvando…' : 'Salvar'}
                  </button>
                  <button className="btn secondary" onClick={() => {
                    setWsName(user?.preferences?.wsName ?? 'Wppconnect Demo');
                    setWsSlug(user?.preferences?.wsSlug ?? 'wppconnect-demo');
                    setWsTz(user?.preferences?.wsTz ?? 'brt');
                  }}>Cancelar</button>
                </div>
              </Card>

              <Card title="Preferências de exibição" description="Como você quer visualizar dados no painel.">
                <SettingsRow label="Emails de resumo" description="Relatório diário enviado às 9h">
                  <Toggle on={prefs.emails} onChange={() => toggle('emails')}/>
                </SettingsRow>
                <SettingsRow label="Auto-resposta fora do horário" description="Ativa fora de 9h–18h nos dias úteis">
                  <Toggle on={prefs.autoreply} onChange={() => toggle('autoreply')}/>
                </SettingsRow>
                <SettingsRow label="Notificações no painel" description="Alertas de sessão offline e falhas de webhook">
                  <Toggle on={prefs.notifications} onChange={() => toggle('notifications')}/>
                </SettingsRow>
              </Card>
            </>
          )}

          {/* ── Membros ── */}
          {sec === 'membros' && (
            <Card title="Membros do workspace" description="3 de 10 membros no plano Pro.">
              {[
                { name: 'Marcos Ribeiro', email: 'marcos@wppconnect.io', role: 'Admin',  avatar: 'MR' },
                { name: 'Ana Souza',      email: 'ana@wppconnect.io',    role: 'Editor', avatar: 'AS' },
                { name: 'Diego Lopes',    email: 'diego@wppconnect.io',  role: 'Viewer', avatar: 'DL' },
              ].map((m, i, arr) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div className="avatar" style={{ width: 32, height: 32, fontSize: 11.5, flexShrink: 0 }}>{m.avatar}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{m.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{m.email}</div>
                  </div>
                  <span style={{ padding: '2px 8px', fontSize: 12, border: '1px solid var(--border)', color: 'var(--ink-3)' }}>{m.role}</span>
                  <button className="kbd-btn"><Ic.Dots/></button>
                </div>
              ))}
              <div style={{ marginTop: 16 }}>
                <button className="btn secondary" onClick={() => toast?.('Abrindo convite…')}><Ic.Plus/> Convidar membro</button>
              </div>
            </Card>
          )}

          {/* ── Plano ── */}
          {sec === 'plano' && (
            <Card title="Plano atual · Pro" description="R$ 249/mês · renova em 18/05/2026 · 5 sessões incluídas">
              <div className="plan-grid">
                {[
                  { label: 'Sessões',              value: '4 / 5'       },
                  { label: 'Mensagens este mês',   value: '18,4k / 50k' },
                  { label: 'Membros',              value: '3 / 10'      },
                ].map(m => (
                  <div key={m.label} style={{ padding: '14px 16px', border: '1px solid var(--border)', background: 'var(--panel-2)' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: 'var(--ink-1)', letterSpacing: '-0.5px' }}>{m.value}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>{m.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn primary"   onClick={() => toast?.('Abrindo upgrade…')}>Upgrade para Business</button>
                <button className="btn secondary" onClick={() => toast?.('Portal de assinatura…')}>Gerenciar assinatura</button>
              </div>
            </Card>
          )}

          {/* ── Segurança ── */}
          {sec === 'seguranca' && (
            <>
              <Card title="Autenticação" description="Configure como membros acessam o workspace.">
                <SettingsRow label="Autenticação de dois fatores" description="Exigir 2FA para todos os membros ao entrar">
                  <Toggle on={prefs.twofa} onChange={() => toggle('twofa')}/>
                </SettingsRow>
                <SettingsRow label="SSO obrigatório" description="Bloquear login por senha — disponível no plano Enterprise">
                  <Toggle on={prefs.sso} onChange={() => toast?.('SSO disponível no plano Enterprise')}/>
                </SettingsRow>
              </Card>

              <Card title="Zona de perigo" description="Ações irreversíveis no workspace." danger>
                <SettingsRow label="Deletar workspace" description="Remove sessões, contatos, histórico e todos os membros.">
                  <button className="btn danger" onClick={() => toast?.('Ação bloqueada no modo demo')}>Deletar</button>
                </SettingsRow>
              </Card>
            </>
          )}

          {/* ── Notificações ── */}
          {sec === 'notif' && (
            <Card title="Notificações" description="Configure quando e como receber alertas.">
              <SettingsRow label="Emails de resumo diário" description="Enviado às 9h com o resumo do dia anterior">
                <Toggle on={prefs.emails} onChange={() => toggle('emails')}/>
              </SettingsRow>
              <SettingsRow label="Alertas de sessão offline" description="Notificar quando uma sessão desconectar inesperadamente">
                <Toggle on={prefs.notifications} onChange={() => toggle('notifications')}/>
              </SettingsRow>
              <SettingsRow label="Falhas de webhook" description="Avisar quando a taxa de entrega cair abaixo de 80%">
                <Toggle on={prefs.autoreply} onChange={() => toggle('autoreply')}/>
              </SettingsRow>
            </Card>
          )}

        </div>
      </div>
    </>
  );
}
