import React from 'react';
import Ic from '../components/icons';
import { authService } from '../services/auth';
import { membersService } from '../services/members';
import { planService } from '../services/plan';

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

const ROLE_LABEL = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };
const ROLE_OPTIONS = [
  { value: 'admin',  label: 'Admin',  desc: 'Acesso total' },
  { value: 'editor', label: 'Editor', desc: 'Criar e editar' },
  { value: 'viewer', label: 'Viewer', desc: 'Somente leitura' },
];

function avatarInitials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function UsageBar({ used, limit, label, fmt }) {
  const pct = Math.min(100, limit > 0 ? (used / limit) * 100 : 0);
  const warn = pct >= 80;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
        <span style={{ fontWeight: 600, color: 'var(--ink-1)' }}>{label}</span>
        <span style={{ color: warn ? 'var(--rose-ink, #c00)' : 'var(--ink-3)', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
          {fmt ? fmt(used) : used} / {fmt ? fmt(limit) : limit}
        </span>
      </div>
      <div style={{ height: 6, background: 'var(--panel-2)', borderRadius: 99, overflow: 'hidden', border: '1px solid var(--border)' }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 99, background: warn ? 'var(--rose-ink, #e55)' : 'var(--accent)', transition: 'width 0.4s ease' }}/>
      </div>
    </div>
  );
}

function MembrosSection({ toast, currentUserId }) {
  const [members, setMembers]   = React.useState([]);
  const [loading, setLoading]   = React.useState(true);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [creds, setCreds]       = React.useState(null); // { name, email, tempPassword }
  const [editingRole, setEditingRole] = React.useState(null); // member id

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await membersService.list();
      setMembers(res.data ?? []);
    } catch { toast?.('Erro ao carregar membros', 'error'); }
    finally { setLoading(false); }
  }, [toast]);

  React.useEffect(() => { load(); }, [load]);

  const handleInvite = async ({ name, email, role }) => {
    try {
      const res = await membersService.invite({ name, email, role });
      setMembers(m => [...m, res.data]);
      setCreds({ name: res.data.name, email: res.data.email, tempPassword: res.tempPassword });
      setInviteOpen(false);
    } catch (e) {
      toast?.(e?.error ?? 'Erro ao convidar membro', 'error');
    }
  };

  const handleRole = async (id, role) => {
    setEditingRole(null);
    try {
      const res = await membersService.update(id, { role });
      setMembers(m => m.map(x => x.id === id ? { ...x, role: res.data.role } : x));
    } catch (e) {
      toast?.(e?.error ?? 'Erro ao alterar papel', 'error');
    }
  };

  const handleRemove = async (id, name) => {
    if (!window.confirm(`Remover ${name} do workspace?`)) return;
    try {
      await membersService.remove(id);
      setMembers(m => m.filter(x => x.id !== id));
      toast?.(`${name} removido`);
    } catch (e) {
      toast?.(e?.error ?? 'Erro ao remover membro', 'error');
    }
  };

  return (
    <>
      <Card title="Membros do workspace" description={`${members.length} membro${members.length !== 1 ? 's' : ''} no workspace`}>
        {loading ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink-4)', fontSize: 13 }}>Carregando…</div>
        ) : members.map((m, i) => {
          const isMe = m.id === currentUserId;
          return (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: i < members.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div className="avatar" style={{ width: 32, height: 32, fontSize: 11.5, flexShrink: 0 }}>{avatarInitials(m.name)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {m.name}
                  {isMe && <span style={{ fontSize: 10.5, padding: '1px 6px', background: 'var(--accent-soft)', color: 'var(--accent-ink)', borderRadius: 99, border: '1px solid var(--accent-border)', fontWeight: 500 }}>você</span>}
                  {m.memberStatus === 'invited' && <span style={{ fontSize: 10.5, padding: '1px 6px', background: 'var(--panel-2)', color: 'var(--ink-3)', borderRadius: 99, border: '1px solid var(--border)' }}>pendente</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</div>
              </div>

              {/* Role selector */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  onClick={() => !isMe && setEditingRole(editingRole === m.id ? null : m.id)}
                  disabled={isMe}
                  style={{ padding: '3px 10px', fontSize: 12, border: '1px solid var(--border)', background: 'var(--panel-1)', color: 'var(--ink-2)', borderRadius: 6, cursor: isMe ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {ROLE_LABEL[m.role]}
                  {!isMe && <Ic.ChevronRight style={{ width: 10, height: 10, transform: 'rotate(90deg)', opacity: 0.5 }}/>}
                </button>
                {editingRole === m.id && (
                  <div style={{ position: 'absolute', right: 0, top: '110%', zIndex: 20, background: 'var(--panel-1)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: 160, padding: 4 }}>
                    {ROLE_OPTIONS.map(opt => (
                      <button key={opt.value} onClick={() => handleRole(m.id, opt.value)}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: m.role === opt.value ? 'var(--accent-soft)' : 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-1)' }}>{opt.label}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {!isMe && (
                <button className="icon-btn" title="Remover" onClick={() => handleRemove(m.id, m.name)}
                  style={{ color: 'var(--rose-ink, #c00)', flexShrink: 0 }}>
                  <Ic.Trash style={{ width: 14, height: 14 }}/>
                </button>
              )}
            </div>
          );
        })}
        <div style={{ marginTop: 16 }}>
          <button className="btn secondary" onClick={() => setInviteOpen(true)}><Ic.Plus/> Convidar membro</button>
        </div>
      </Card>

      {/* Modal convite */}
      {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} onSubmit={handleInvite}/>}

      {/* Modal credenciais geradas */}
      {creds && (
        <div className="modal-backdrop" onClick={() => setCreds(null)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Membro convidado</h3>
              <button className="icon-btn" onClick={() => setCreds(null)}><Ic.X/></button>
            </div>
            <div style={{ padding: '0 24px 20px' }}>
              <p style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 16 }}>
                Compartilhe as credenciais abaixo com <strong>{creds.name}</strong>. A senha temporária é exibida apenas uma vez.
              </p>
              <div style={{ background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', marginBottom: 8 }}>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 4 }}>E-mail</div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13.5, color: 'var(--ink-1)' }}>{creds.email}</div>
              </div>
              <div style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 11.5, color: 'var(--accent-ink)', opacity: 0.7, marginBottom: 4 }}>Senha temporária</div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 18, fontWeight: 700, color: 'var(--accent-ink)', letterSpacing: '0.05em' }}>{creds.tempPassword}</div>
              </div>
              <button className="btn primary" style={{ marginTop: 20, width: '100%' }} onClick={() => {
                navigator.clipboard.writeText(`Login: ${creds.email}\nSenha: ${creds.tempPassword}`);
                setCreds(null);
              }}>
                <Ic.Clipboard style={{ width: 13, height: 13 }}/> Copiar e fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function InviteModal({ onClose, onSubmit }) {
  const [name,  setName]  = React.useState('');
  const [email, setEmail] = React.useState('');
  const [role,  setRole]  = React.useState('editor');
  const [busy,  setBusy]  = React.useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    await onSubmit({ name, email, role });
    setBusy(false);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Convidar membro</h3>
          <button className="icon-btn" onClick={onClose}><Ic.X/></button>
        </div>
        <form onSubmit={submit} style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field">
            <label>Nome</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Ana Souza" required/>
          </div>
          <div className="field">
            <label>E-mail</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="ana@empresa.com" required/>
          </div>
          <div className="field">
            <label>Papel</label>
            <select value={role} onChange={e => setRole(e.target.value)}>
              {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label} — {o.desc}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="submit" className="btn primary" disabled={busy} style={{ flex: 1 }}>
              {busy ? 'Criando…' : 'Criar conta e convidar'}
            </button>
            <button type="button" className="btn secondary" onClick={onClose}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PlanoSection({ toast }) {
  const [plan, setPlan] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    planService.get()
      .then(data => setPlan(data))
      .catch(() => toast?.('Erro ao carregar plano', 'error'))
      .finally(() => setLoading(false));
  }, [toast]);

  if (loading) return (
    <Card title="Plano & Billing">
      <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink-4)', fontSize: 13 }}>Carregando…</div>
    </Card>
  );

  const fmtNum = n => n >= 1000 ? (n / 1000).toFixed(1).replace('.0','') + 'k' : String(n);

  const renewal = plan?.renewal
    ? new Date(plan.renewal + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—';

  return (
    <>
      <Card title={`Plano atual · ${plan?.plan ?? '—'}`} description={`${plan?.price ?? '—'} · renova em ${renewal}`}>
        <div style={{ marginBottom: 8 }}>
          <UsageBar label="Sessões WhatsApp" used={plan.sessions.used} limit={plan.sessions.limit}/>
          <UsageBar label="Mensagens este mês" used={plan.messages.used} limit={plan.messages.limit} fmt={fmtNum}/>
          <UsageBar label="Membros" used={plan.members.used} limit={plan.members.limit}/>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button className="btn primary"   onClick={() => toast?.('Planos disponíveis em breve.')}>Upgrade para Business</button>
          <button className="btn secondary" onClick={() => toast?.('Portal de assinatura em breve.')}>Gerenciar assinatura</button>
        </div>
      </Card>

      <Card title="Histórico de faturas" description="Últimas cobranças da sua assinatura.">
        {[
          { date: '01/06/2026', amount: 'R$ 249,00', status: 'Pago'      },
          { date: '01/05/2026', amount: 'R$ 249,00', status: 'Pago'      },
          { date: '01/04/2026', amount: 'R$ 249,00', status: 'Pago'      },
        ].map((inv, i, arr) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink-1)' }}>{inv.amount}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{inv.date}</div>
            </div>
            <span style={{ fontSize: 12, padding: '2px 8px', border: '1px solid var(--border)', color: 'var(--ink-3)', borderRadius: 99 }}>{inv.status}</span>
            <button className="icon-btn" title="Baixar fatura" onClick={() => toast?.('Download disponível em breve.')}>
              <Ic.Download style={{ width: 14, height: 14 }}/>
            </button>
          </div>
        ))}
      </Card>
    </>
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
            <MembrosSection toast={toast} currentUserId={user?.id}/>
          )}

          {/* ── Plano ── */}
          {sec === 'plano' && (
            <PlanoSection toast={toast}/>
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
