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
    const res = await membersService.invite({ name, email, role });
    setMembers(m => [...m, res.data]);
    setCreds({ name: res.data.name, email: res.data.email, tempPassword: res.tempPassword });
    setInviteOpen(false);
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
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Membro convidado</h3>
              <p>Compartilhe estas credenciais com <strong>{creds.name}</strong>. A senha é exibida apenas uma vez.</p>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>E-mail de acesso</label>
                <input readOnly value={creds.email} className="mono" onClick={e => e.target.select()}/>
              </div>
              <div className="field">
                <label>Senha temporária</label>
                <input readOnly value={creds.tempPassword} className="mono"
                  style={{ fontSize: 18, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--accent-ink)' }}
                  onClick={e => e.target.select()}/>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn secondary" onClick={() => setCreds(null)}>Fechar</button>
              <button className="btn primary" onClick={() => {
                navigator.clipboard.writeText(`Login: ${creds.email}\nSenha: ${creds.tempPassword}`);
                setCreds(null);
              }}>
                <Ic.Clipboard style={{ width: 13, height: 13 }}/> Copiar credenciais
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
  const [error, setError] = React.useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ name, email, role });
    } catch (err) {
      setError(err?.error ?? 'Erro ao convidar membro');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head">
          <h3>Convidar membro</h3>
          <p>Uma conta será criada com senha temporária para o novo membro.</p>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Nome</label>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Ana Souza" required/>
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
          {error && <div style={{ color: 'var(--rose-ink)', fontSize: 13 }}>{error}</div>}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={busy || !name.trim() || !email.trim()}>
            <Ic.Check/> {busy ? 'Criando…' : 'Criar e convidar'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Billing helpers ─────────────────────────────────────────────────────────

const IconCard = (props) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="1" y="4" width="22" height="16" rx="2"/>
    <line x1="1" y1="10" x2="23" y2="10"/>
  </svg>
);

const PLAN_ORDER = { free: 0, pro: 1, business: 2, enterprise: 3 };

const PLAN_DEFS = [
  {
    slug: 'free', label: 'Free', price_monthly: 0, price_annual: 0,
    sessions: 1, messages: 5_000, members: 1,
    features: ['1 sessão WhatsApp', '5 mil mensagens/mês', '1 membro', 'Webhooks básicos', 'API REST'],
    icon: (props) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
      </svg>
    ),
  },
  {
    slug: 'pro', label: 'Pro', price_monthly: 249, price_annual: 199,
    sessions: 5, messages: 50_000, members: 10, popular: true,
    features: ['5 sessões WhatsApp', '50 mil mensagens/mês', '10 membros', 'Webhooks avançados', 'API REST + SDKs', 'Logs em tempo real'],
    icon: (props) => <Ic.Zap {...props}/>,
  },
  {
    slug: 'business', label: 'Business', price_monthly: 699, price_annual: 559,
    sessions: 20, messages: 250_000, members: 25,
    features: ['20 sessões WhatsApp', '250 mil mensagens/mês', '25 membros', 'Webhooks avançados', 'API REST + SDKs', 'Logs em tempo real', 'Suporte prioritário', 'SLA 99.9%'],
    icon: (props) => <Ic.ChartBar {...props}/>,
  },
  {
    slug: 'enterprise', label: 'Enterprise', price_monthly: null, price_annual: null,
    sessions: -1, messages: -1, members: -1,
    features: ['Sessões ilimitadas', 'Mensagens ilimitadas', 'Membros ilimitados', 'Webhooks avançados', 'API REST + SDKs', 'Logs em tempo real', 'Suporte dedicado', 'SLA 99.99%', 'SSO / SAML', 'IP dedicado'],
    icon: (props) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
    ),
  },
];

// ─── UpgradeModal ─────────────────────────────────────────────────────────────

function UpgradeModal({ currentSlug, onClose, onUpgraded, toast }) {
  const [cycle, setCycle]           = React.useState('monthly');
  const [selected, setSelected]     = React.useState(null);
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy]             = React.useState(false);
  const [error, setError]           = React.useState('');
  const [success, setSuccess]       = React.useState(false);

  const currentOrder  = PLAN_ORDER[currentSlug] ?? 1;
  const selectedDef   = PLAN_DEFS.find(p => p.slug === selected);
  const selectedPrice = selectedDef
    ? (cycle === 'annual' ? selectedDef.price_annual : selectedDef.price_monthly)
    : null;

  const nextBilling = new Date();
  nextBilling.setDate(nextBilling.getDate() + (cycle === 'annual' ? 365 : 30));
  const nextBillingStr = nextBilling.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  const confirm = async () => {
    if (!selected) return;
    setBusy(true); setError('');
    try {
      const res = await planService.upgrade(selected, cycle);
      setSuccess(true);
      setTimeout(() => { onUpgraded(res); onClose(); }, 1800);
    } catch (err) {
      setError(err?.error ?? 'Erro ao atualizar plano. Tente novamente.');
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 860, width: '95vw' }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>
            {success ? 'Upgrade realizado!' : confirming ? `Confirmar upgrade · ${selectedDef?.label}` : 'Escolha seu plano'}
          </h3>
          {!confirming && !success && (
            <p>Compare os planos e selecione o que melhor atende ao seu workspace.</p>
          )}
        </div>

        <div className="modal-body">
          {success ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Ic.Check style={{ width: 24, height: 24, color: 'var(--accent)' }}/>
              </div>
              <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>Plano {selectedDef?.label} ativado!</div>
              <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>Suas novas funcionalidades já estão disponíveis no workspace.</div>
            </div>
          ) : confirming ? (
            <div>
              <div style={{ background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
                {[
                  ['Plano',            selectedDef?.label],
                  ['Ciclo',            cycle === 'annual' ? 'Anual' : 'Mensal'],
                  ['Valor',            selectedPrice != null ? `R$ ${selectedPrice.toLocaleString('pt-BR')}/mês` : 'Sob consulta'],
                  ['Próxima cobrança', nextBillingStr],
                ].map(([lbl, val], i, arr) => (
                  <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <span style={{ color: 'var(--ink-3)', fontSize: 13 }}>{lbl}</span>
                    <span style={{ fontWeight: i === 2 ? 700 : 600, fontSize: i === 2 ? 15 : 13 }}>{val}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: 'var(--panel-1)', border: '1px solid var(--border)', borderRadius: 8 }}>
                <IconCard style={{ flexShrink: 0, color: 'var(--ink-3)' }}/>
                <span style={{ fontSize: 13, color: 'var(--ink-2)', flex: 1 }}>Visa ••••1234 · exp 12/27</span>
                <button type="button" className="btn secondary" style={{ fontSize: 12, padding: '3px 10px' }}
                  onClick={() => toast?.('Gestão de cartão disponível em breve.')}>
                  Alterar
                </button>
              </div>
              {error && (
                <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--rose-soft,#fff0f0)', border: '1px solid var(--rose-border,#fcc)', color: 'var(--rose-ink,#e55)', fontSize: 13, borderRadius: 6 }}>
                  {error}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Ciclo mensal / anual */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
                <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--panel-1)' }}>
                  {[['monthly', 'Mensal', ''], ['annual', 'Anual', '-20%']].map(([val, lbl, badge]) => (
                    <button key={val} type="button" onClick={() => setCycle(val)}
                      style={{ padding: '7px 20px', fontSize: 13, fontWeight: cycle === val ? 600 : 400, border: 'none', cursor: 'pointer',
                        background: cycle === val ? 'var(--accent)' : 'transparent',
                        color: cycle === val ? '#fff' : 'var(--ink-2)',
                        display: 'flex', alignItems: 'center', gap: 6, transition: 'background 0.15s' }}>
                      {lbl}
                      {badge && (
                        <span style={{ fontSize: 10.5, padding: '1px 7px', borderRadius: 99,
                          background: cycle === val ? 'rgba(255,255,255,0.25)' : 'var(--accent-soft)',
                          color: cycle === val ? '#fff' : 'var(--accent-ink)' }}>
                          {badge}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cards de plano */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
                {PLAN_DEFS.map(plan => {
                  const price      = cycle === 'annual' ? plan.price_annual : plan.price_monthly;
                  const isCurrent  = plan.slug === currentSlug;
                  const isLower    = (PLAN_ORDER[plan.slug] ?? 0) < currentOrder;
                  const isSelected = selected === plan.slug;
                  const selectable = !isCurrent && !isLower;

                  return (
                    <div key={plan.slug}
                      onClick={() => selectable && setSelected(isSelected ? null : plan.slug)}
                      style={{
                        position: 'relative', padding: '18px 16px', borderRadius: 12,
                        cursor: selectable ? 'pointer' : 'default', opacity: isLower ? 0.45 : 1,
                        border: `2px solid ${isSelected ? 'var(--accent)' : isCurrent ? 'var(--accent-border)' : 'var(--border)'}`,
                        background: isSelected ? 'var(--accent-soft)' : isCurrent ? 'var(--panel-2)' : 'var(--panel-1)',
                        transition: 'border-color 0.15s, background 0.15s',
                      }}>
                      {(plan.popular || isCurrent) && (
                        <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
                          whiteSpace: 'nowrap', fontSize: 10.5, fontWeight: 700, padding: '2px 10px', borderRadius: 99,
                          background: isCurrent ? 'var(--panel-2)' : 'var(--accent)',
                          color: isCurrent ? 'var(--ink-3)' : '#fff',
                          border: isCurrent ? '1px solid var(--border)' : 'none' }}>
                          {isCurrent ? 'Plano atual' : 'Mais popular'}
                        </div>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <div style={{ width: 30, height: 30, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: isSelected || isCurrent ? 'var(--accent-soft)' : 'var(--panel-2)',
                          border: '1px solid var(--border)',
                          color: isSelected || isCurrent ? 'var(--accent)' : 'var(--ink-3)' }}>
                          <plan.icon style={{ width: 15, height: 15 }}/>
                        </div>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{plan.label}</span>
                      </div>

                      <div style={{ marginBottom: 14 }}>
                        {price === null ? (
                          <div style={{ fontSize: 16, fontWeight: 800 }}>Sob consulta</div>
                        ) : price === 0 ? (
                          <div style={{ fontSize: 22, fontWeight: 800 }}>Grátis</div>
                        ) : (
                          <div>
                            <span style={{ fontSize: 22, fontWeight: 800 }}>R$ {price.toLocaleString('pt-BR')}</span>
                            <span style={{ fontSize: 12, color: 'var(--ink-3)', marginLeft: 2 }}>/mês</span>
                          </div>
                        )}
                        {cycle === 'annual' && price != null && price > 0 && (
                          <div style={{ fontSize: 11, color: 'var(--accent-ink)', marginTop: 2 }}>
                            R$ {(price * 12).toLocaleString('pt-BR')}/ano
                          </div>
                        )}
                      </div>

                      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {plan.features.slice(0, 6).map((f, i) => (
                          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.4 }}>
                            <Ic.Check style={{ width: 11, height: 11, color: 'var(--accent)', flexShrink: 0, marginTop: 2 }}/>
                            {f}
                          </li>
                        ))}
                        {plan.features.length > 6 && (
                          <li style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2 }}>+{plan.features.length - 6} mais</li>
                        )}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {!success && (
          <div className="modal-foot">
            {confirming ? (
              <>
                <button type="button" className="btn secondary"
                  onClick={() => { setConfirming(false); setError(''); }} disabled={busy}>
                  Voltar
                </button>
                <button type="button" className="btn primary" onClick={confirm}
                  disabled={busy || selectedDef?.slug === 'enterprise'}>
                  {busy ? 'Processando…' : selectedDef?.slug === 'enterprise' ? 'Fale com vendas' : 'Confirmar upgrade'}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn secondary" onClick={onClose}>Cancelar</button>
                <button type="button" className="btn primary"
                  onClick={() => setConfirming(true)} disabled={!selected}>
                  {selected ? `Selecionar ${selectedDef?.label}` : 'Selecione um plano'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ManageSubscriptionModal ──────────────────────────────────────────────────

function ManageSubscriptionModal({ plan, onClose, onCancelled, onUpgrade, toast }) {
  const [cancelling, setCancelling] = React.useState(false);
  const [busy, setBusy]             = React.useState(false);
  const [error, setError]           = React.useState('');

  const [editingCard, setEditingCard] = React.useState(false);
  const [cardNum,  setCardNum]  = React.useState('');
  const [cardExp,  setCardExp]  = React.useState('');
  const [cardCvv,  setCardCvv]  = React.useState('');
  const [cardName, setCardName] = React.useState('');
  const [savedCard, setSavedCard] = React.useState({ brand: 'Visa', last4: '1234', exp: '12/27' });

  const fmtCardNum = v => v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
  const fmtExp     = v => { const d = v.replace(/\D/g, '').slice(0, 4); return d.length >= 3 ? d.slice(0,2) + '/' + d.slice(2) : d; };
  const cardBrand  = n => n.startsWith('4') ? 'Visa' : n.startsWith('5') ? 'Mastercard' : n.startsWith('3') ? 'Amex' : 'Cartão';

  const saveCard = () => {
    const digits = cardNum.replace(/\s/g, '');
    if (digits.length < 13 || !cardExp.includes('/') || cardCvv.length < 3 || !cardName.trim()) return;
    setSavedCard({ brand: cardBrand(digits), last4: digits.slice(-4), exp: cardExp });
    setEditingCard(false);
    setCardNum(''); setCardExp(''); setCardCvv(''); setCardName('');
    toast?.('Cartão atualizado com sucesso!');
  };

  const cardValid = cardNum.replace(/\s/g,'').length >= 13 && cardExp.includes('/') && cardCvv.length >= 3 && cardName.trim().length > 0;

  const confirmCancel = async () => {
    setBusy(true); setError('');
    try {
      await planService.cancel();
      onCancelled();
      onClose();
    } catch (err) {
      setError(err?.error ?? 'Erro ao cancelar assinatura.');
      setBusy(false);
    }
  };

  const renewal = plan?.renewal
    ? new Date(plan.renewal + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—';

  const INVOICES = [
    { date: '01/06/2026', amount: plan?.price ?? 'R$ 249,00', status: 'Pago' },
    { date: '01/05/2026', amount: plan?.price ?? 'R$ 249,00', status: 'Pago' },
    { date: '01/04/2026', amount: plan?.price ?? 'R$ 249,00', status: 'Pago' },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{cancelling ? 'Cancelar assinatura' : 'Gerenciar assinatura'}</h3>
          <p>
            {cancelling
              ? `Seu plano ${plan?.plan} ficará ativo até ${renewal}.`
              : `Plano ${plan?.plan} · ${plan?.cycle === 'annual' ? 'Anual' : 'Mensal'}`}
          </p>
        </div>

        <div className="modal-body">
          {cancelling ? (
            <div>
              <div style={{ background: 'var(--rose-soft,#fff0f0)', border: '1px solid var(--rose-border,#fcc)', borderRadius: 8, padding: '14px 16px', fontSize: 13.5, lineHeight: 1.7 }}>
                <strong>O que acontece ao cancelar:</strong>
                <ul style={{ margin: '8px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <li>Seu plano <strong>{plan?.plan}</strong> permanece ativo até <strong>{renewal}</strong>.</li>
                  <li>Após essa data, a conta é rebaixada para o plano <strong>Free</strong>.</li>
                  <li>Sessões excedentes serão desativadas automaticamente.</li>
                  <li>Seus dados são mantidos por 30 dias adicionais.</li>
                </ul>
              </div>
              {error && (
                <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--rose-soft,#fff0f0)', border: '1px solid var(--rose-border,#fcc)', color: 'var(--rose-ink,#e55)', fontSize: 13, borderRadius: 6 }}>
                  {error}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Resumo do plano */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
                {[
                  { label: 'Plano',    value: plan?.plan, sub: plan?.price },
                  { label: 'Renovação', value: renewal,   sub: plan?.cycle === 'annual' ? 'Anual' : 'Mensal' },
                ].map(({ label, value, sub }) => (
                  <div key={label} style={{ flex: 1, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
                    <div style={{ fontSize: 11, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{value}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{sub}</div>
                  </div>
                ))}
              </div>

              {/* Método de pagamento */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Método de pagamento
                </div>

                {editingCard ? (
                  <div style={{ border: '1px solid var(--accent-border)', borderRadius: 8, padding: '14px 16px', background: 'var(--accent-soft)' }}>
                    <div className="field" style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: 12 }}>Número do cartão</label>
                      <div style={{ position: 'relative' }}>
                        <IconCard style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-4)' }}/>
                        <input
                          autoFocus
                          value={cardNum}
                          onChange={e => setCardNum(fmtCardNum(e.target.value))}
                          placeholder="0000 0000 0000 0000"
                          className="mono"
                          style={{ paddingLeft: 34, letterSpacing: '0.08em' }}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                      <div className="field">
                        <label style={{ fontSize: 12 }}>Validade</label>
                        <input
                          value={cardExp}
                          onChange={e => setCardExp(fmtExp(e.target.value))}
                          placeholder="MM/AA"
                          className="mono"
                          maxLength={5}
                        />
                      </div>
                      <div className="field">
                        <label style={{ fontSize: 12 }}>CVV</label>
                        <input
                          type="password"
                          value={cardCvv}
                          onChange={e => setCardCvv(e.target.value.replace(/\D/g,'').slice(0,4))}
                          placeholder="•••"
                          className="mono"
                          maxLength={4}
                        />
                      </div>
                    </div>
                    <div className="field" style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 12 }}>Nome no cartão</label>
                      <input
                        value={cardName}
                        onChange={e => setCardName(e.target.value.toUpperCase())}
                        placeholder="NOME COMPLETO"
                        className="mono"
                        style={{ letterSpacing: '0.04em' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button type="button" className="btn secondary"
                        onClick={() => { setEditingCard(false); setCardNum(''); setCardExp(''); setCardCvv(''); setCardName(''); }}>
                        Cancelar
                      </button>
                      <button type="button" className="btn primary" onClick={saveCard} disabled={!cardValid}>
                        <Ic.Check style={{ width: 13, height: 13 }}/> Salvar cartão
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <IconCard style={{ color: 'var(--ink-3)', flexShrink: 0 }}/>
                    <span style={{ fontSize: 13, color: 'var(--ink-2)', flex: 1 }}>
                      {savedCard.brand} ••••{savedCard.last4} · exp {savedCard.exp}
                    </span>
                    <button type="button" className="btn secondary" style={{ fontSize: 12, padding: '3px 10px' }}
                      onClick={() => setEditingCard(true)}>
                      Alterar
                    </button>
                  </div>
                )}
              </div>

              {/* Faturas */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Faturas recentes
                </div>
                {INVOICES.map((inv, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: i < INVOICES.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{inv.amount}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{inv.date}</div>
                    </div>
                    <span style={{ fontSize: 11.5, padding: '2px 8px', border: '1px solid var(--border)', color: 'var(--ink-3)', borderRadius: 99 }}>{inv.status}</span>
                    <button className="icon-btn" title="Baixar fatura"
                      onClick={() => toast?.('Download disponível em breve.')}>
                      <Ic.Download style={{ width: 14, height: 14 }}/>
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="modal-foot" style={{ justifyContent: cancelling ? undefined : 'space-between' }}>
          {cancelling ? (
            <>
              <button type="button" className="btn secondary"
                onClick={() => { setCancelling(false); setError(''); }} disabled={busy}>
                Voltar
              </button>
              <button type="button" className="btn danger" onClick={confirmCancel} disabled={busy}>
                {busy ? 'Cancelando…' : 'Confirmar cancelamento'}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn danger" onClick={() => setCancelling(true)}>
                Cancelar assinatura
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn secondary" onClick={onClose}>Fechar</button>
                <button type="button" className="btn primary"
                  onClick={() => { onClose(); onUpgrade(); }}>
                  Trocar plano
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── PlanoSection ─────────────────────────────────────────────────────────────

function PlanoSection({ toast }) {
  const [plan, setPlan]               = React.useState(null);
  const [loading, setLoading]         = React.useState(true);
  const [upgradeOpen, setUpgradeOpen] = React.useState(false);
  const [manageOpen, setManageOpen]   = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try { setPlan(await planService.get()); }
    catch { toast?.('Erro ao carregar plano', 'error'); }
    finally { setLoading(false); }
  }, [toast]);

  React.useEffect(() => { load(); }, [load]);

  if (loading) return (
    <Card title="Plano & Billing">
      <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink-4)', fontSize: 13 }}>Carregando…</div>
    </Card>
  );

  if (!plan) return (
    <Card title="Plano & Billing">
      <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink-4)', fontSize: 13 }}>
        Não foi possível carregar os dados do plano.{' '}
        <button className="btn secondary" style={{ fontSize: 12 }} onClick={load}>Tentar novamente</button>
      </div>
    </Card>
  );

  const fmtNum = n => n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + 'k' : String(n);
  const renewal = plan?.renewal
    ? new Date(plan.renewal + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—';

  return (
    <>
      <Card title={`Plano atual · ${plan?.plan ?? '—'}`} description={`${plan?.price ?? '—'} · renova em ${renewal}`}>
        <UsageBar label="Sessões WhatsApp"   used={plan.sessions.used} limit={plan.sessions.limit}/>
        <UsageBar label="Mensagens este mês" used={plan.messages.used} limit={plan.messages.limit} fmt={fmtNum}/>
        <UsageBar label="Membros"            used={plan.members.used}  limit={plan.members.limit}/>
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button className="btn primary"   onClick={() => setUpgradeOpen(true)}>Upgrade para Business</button>
          <button className="btn secondary" onClick={() => setManageOpen(true)}>Gerenciar assinatura</button>
        </div>
      </Card>

      <Card title="Histórico de faturas" description="Últimas cobranças da sua assinatura.">
        {[
          { date: '01/06/2026', amount: plan?.price ?? 'R$ 249,00', status: 'Pago' },
          { date: '01/05/2026', amount: plan?.price ?? 'R$ 249,00', status: 'Pago' },
          { date: '01/04/2026', amount: plan?.price ?? 'R$ 249,00', status: 'Pago' },
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

      {upgradeOpen && (
        <UpgradeModal
          currentSlug={plan?.slug ?? 'pro'}
          toast={toast}
          onClose={() => setUpgradeOpen(false)}
          onUpgraded={(newPlan) => {
            setPlan(prev => ({ ...prev, ...newPlan }));
            toast?.(`Plano atualizado para ${newPlan?.plan ?? ''}!`);
          }}
        />
      )}

      {manageOpen && (
        <ManageSubscriptionModal
          plan={plan}
          toast={toast}
          onClose={() => setManageOpen(false)}
          onCancelled={() => { load(); toast?.('Assinatura cancelada. Plano ativo até o fim do período.'); }}
          onUpgrade={() => { setManageOpen(false); setUpgradeOpen(true); }}
        />
      )}
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
