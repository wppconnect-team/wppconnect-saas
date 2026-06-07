import React from 'react';
import Ic from '../components/icons';
import { webhooksService } from '../services/webhooks';

const ALL_EVENTS = [
  'message.received', 'message.sent',
  'session.connected', 'session.disconnected', 'qrcode.updated',
];

const PAYLOAD_EXAMPLE = `{
  "event": "message.received",
  "session_id": "wa_01",
  "timestamp": 1714235132,
  "from": "+5511987126540",
  "message": {
    "type": "text",
    "body": "Ok, pode mandar o link"
  }
}`;

function WebhookModal({ webhook, onClose, onSave }) {
  const [url, setUrl]         = React.useState(webhook?.url ?? '');
  const [events, setEvents]   = React.useState(webhook?.events ?? []);
  const [status, setStatus]   = React.useState(webhook?.status ?? 'ativo');
  const [loading, setLoading] = React.useState(false);
  const [error, setError]     = React.useState(null);

  const toggle = (ev) =>
    setEvents(p => p.includes(ev) ? p.filter(x => x !== ev) : [...p, ev]);

  const submit = async (e) => {
    e.preventDefault();
    if (!url.trim() || events.length === 0) return;
    setLoading(true); setError(null);
    try {
      const res = webhook
        ? await webhooksService.update(webhook.id, { url: url.trim(), events, status })
        : await webhooksService.create({ url: url.trim(), events });
      onSave(res.data, !!webhook);
    } catch (err) {
      setError(err?.error ?? 'Erro ao salvar endpoint');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head">
          <h3>{webhook ? 'Editar endpoint' : 'Novo endpoint'}</h3>
          <p>Configure a URL que receberá os eventos em tempo real.</p>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>URL do endpoint</label>
            <input autoFocus type="url" value={url} onChange={e => setUrl(e.target.value)}
              placeholder="https://seu-backend.com/webhook" required/>
          </div>
          <div className="field">
            <label>Eventos</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              {ALL_EVENTS.map(ev => (
                <label key={ev} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={events.includes(ev)} onChange={() => toggle(ev)}/>
                  <span className="chip mono" style={{ fontSize: 11 }}>{ev}</span>
                </label>
              ))}
            </div>
            {events.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--rose-ink)', marginTop: 4 }}>Selecione ao menos um evento</div>
            )}
          </div>
          {webhook && (
            <div className="field">
              <label>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)}>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </div>
          )}
          {error && <div style={{ color: 'var(--rose-ink)', fontSize: 13, marginTop: 8 }}>{error}</div>}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn secondary" onClick={onClose} disabled={loading}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={loading || events.length === 0 || !url.trim()}>
            <Ic.Check/> {loading ? 'Salvando…' : (webhook ? 'Salvar alterações' : 'Criar endpoint')}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function WebhooksPage({ toast }) {
  const [webhooks, setWebhooks]         = React.useState([]);
  const [stats, setStats]               = React.useState({ total: 0, ativos: 0, falhando: 0, avgRate: 0 });
  const [loading, setLoading]           = React.useState(true);
  const [filter, setFilter]             = React.useState('all');
  const [query, setQuery]               = React.useState('');
  const [showPayload, setShowPayload]   = React.useState(false);
  const [menuId, setMenuId]             = React.useState(null);
  const [modalWebhook, setModalWebhook] = React.useState(null); // null=fechado | 'new' | obj de webhook

  React.useEffect(() => {
    const close = () => setMenuId(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const refetch = React.useCallback(() => {
    setLoading(true);
    webhooksService.list()
      .then(res => { setWebhooks(res.data); setStats(res.stats); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { refetch(); }, [refetch]);

  const handleSave = (saved, isEdit) => {
    setModalWebhook(null);
    toast?.(isEdit ? 'Endpoint atualizado' : 'Endpoint criado');
    refetch();
  };

  const handleDelete = async (id) => {
    setMenuId(null);
    try {
      await webhooksService.remove(id);
      toast?.('Endpoint removido');
      refetch();
    } catch {
      toast?.('Erro ao remover endpoint', 'error');
    }
  };

  const handleTest = async (id) => {
    setMenuId(null);
    toast?.('Enviando requisição de teste…');
    try {
      const res = await webhooksService.test(id);
      setWebhooks(list =>
        list.map(w => w.id === id ? { ...w, lastStatus: res.status, lastAt: 'agora' } : w)
      );
      toast?.(res.ok ? `Teste OK · HTTP ${res.status}` : `Falhou · HTTP ${res.status}`, res.ok ? 'success' : 'error');
    } catch (err) {
      toast?.(err?.error ?? 'Erro ao testar endpoint', 'error');
    }
  };

  const handleViewLogs = (w) => {
    setMenuId(null);
    sessionStorage.setItem('logs_source_filter', w.url);
    window.location.hash = 'logs';
  };

  const visible = webhooks.filter(w => {
    const matchFilter = filter === 'all' || w.status === filter;
    const matchQuery  = !query || w.url.toLowerCase().includes(query.toLowerCase());
    return matchFilter && matchQuery;
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Webhooks</h1>
          <div className="page-sub">Receba eventos em tempo real no seu backend ou serviços externos.</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn secondary" onClick={() => setShowPayload(v => !v)}><Ic.Doc/> Payload</button>
          <button className="btn primary" onClick={() => setModalWebhook('new')}><Ic.Plus/> Novo endpoint</button>
        </div>
      </div>

      <div className="stats">
        {[
          { label: 'Total',      value: String(stats.total).padStart(2,'0'),              icon: 'Webhook',  cls: 'total',                                    delta: 'endpoints'   },
          { label: 'Ativos',     value: String(stats.ativos).padStart(2,'0'),             icon: 'Check',    cls: 'connected',                                delta: 'funcionando' },
          { label: 'Falhando',   value: String(stats.falhando).padStart(2,'0'),           icon: 'Info',     cls: stats.falhando > 0 ? 'offline' : 'total',   delta: stats.falhando > 0 ? 'verificar' : 'nenhum' },
          { label: 'Taxa média', value: Number(stats.avgRate).toFixed(1) + '%',           icon: 'ChartBar', cls: 'connected',                                delta: 'de entrega'  },
        ].map(m => {
          const Icon = Ic[m.icon];
          return (
            <div key={m.label} className="stat" style={{ cursor: 'default' }}>
              <div className={"stat-icon " + m.cls}><Icon/></div>
              <div style={{ flex: 1 }}>
                <div className="stat-label" style={{ marginTop: 0 }}>{m.label}</div>
                <div className="stat-value" style={{ marginTop: 4 }}>{m.value}</div>
                <span className="stat-delta">{m.delta}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card-panel" style={{ padding: 0 }}>
        <div style={{ padding: 12, display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
          <div className="search" style={{ width: 300 }}>
            <Ic.Search style={{ color: 'var(--ink-4)' }}/>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por URL…"/>
          </div>
          {['all','ativo','falhando'].map(f => (
            <button key={f} className={"btn " + (filter === f ? 'secondary' : 'ghost')} onClick={() => setFilter(f)}>
              {f === 'all' ? 'Todos' : f === 'ativo' ? 'Ativos' : 'Falhando'}
            </button>
          ))}
          <div style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--ink-3)' }}>
            {visible.length} endpoint{visible.length !== 1 ? 's' : ''}
          </div>
        </div>

        <table className="data-table">
          <thead><tr>
            <th>Endpoint</th>
            <th>Eventos</th>
            <th>Última entrega</th>
            <th style={{ textAlign: 'right' }}>Taxa</th>
            <th>Status</th>
            <th></th>
          </tr></thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-4)' }}>Carregando…</td></tr>
            )}
            {!loading && visible.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-4)' }}>
                {query ? `Nenhum resultado para "${query}"` : 'Nenhum endpoint cadastrado'}
              </td></tr>
            )}
            {!loading && visible.map(w => (
              <tr key={w.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="chip mono" style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px' }}>POST</span>
                    <span className="mono" style={{ fontSize: 12.5 }}>{w.url}</span>
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {(w.events ?? []).map(e => (
                      <span key={e} className="chip mono" style={{ fontSize: 10.5 }}>{e}</span>
                    ))}
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className={"pill " + (w.lastStatus === 200 ? 'connected' : 'offline')}
                      style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, padding: '1px 6px' }}>
                      {w.lastStatus ?? '—'}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>{w.lastAt ?? '—'}</span>
                  </div>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                    <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, color: w.deliveryRate > 95 ? 'var(--accent-ink)' : 'var(--rose-ink)' }}>
                      {Number(w.deliveryRate ?? 0).toFixed(1)}%
                    </span>
                    <div style={{ width: 60, height: 3, background: 'var(--panel-2)', border: '1px solid var(--border)' }}>
                      <div style={{ width: (w.deliveryRate ?? 0) + '%', height: '100%', background: w.deliveryRate > 95 ? 'var(--accent)' : 'var(--rose)' }}/>
                    </div>
                  </div>
                </td>
                <td>
                  <span className={"pill " + (w.status === 'ativo' ? 'connected' : 'offline')}>
                    <span className="dot"/>{w.status}
                  </span>
                </td>
                <td>
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <button className="kbd-btn" onClick={e => { e.stopPropagation(); setMenuId(m => m === w.id ? null : w.id); }}><Ic.Dots/></button>
                    {menuId === w.id && (
                      <div className="dropdown" style={{ right: 0, left: 'auto', zIndex: 20 }} onClick={e => e.stopPropagation()}>
                        <button className="dropdown-item" onClick={() => handleTest(w.id)}><Ic.Send className="icon"/>Testar</button>
                        <button className="dropdown-item" onClick={() => handleViewLogs(w)}><Ic.List className="icon"/>Ver logs</button>
                        <button className="dropdown-item" onClick={() => { setMenuId(null); setModalWebhook(w); }}><Ic.Cog className="icon"/>Editar</button>
                        <div className="dropdown-sep"/>
                        <button className="dropdown-item danger" onClick={() => handleDelete(w.id)}><Ic.Trash className="icon"/>Remover</button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-head" style={{ cursor: 'pointer', marginTop: 24 }} onClick={() => setShowPayload(v => !v)}>
        <h3>Exemplo de payload</h3>
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{showPayload ? '▲ Ocultar' : '▼ Mostrar'}</span>
      </div>
      {showPayload && (
        <div className="codeblock" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5, lineHeight: 1.75, whiteSpace: 'pre', overflowX: 'auto', padding: '14px 16px' }}>
          {PAYLOAD_EXAMPLE}
        </div>
      )}

      {modalWebhook && (
        <WebhookModal
          webhook={modalWebhook === 'new' ? null : modalWebhook}
          onClose={() => setModalWebhook(null)}
          onSave={handleSave}
        />
      )}
    </>
  );
}
