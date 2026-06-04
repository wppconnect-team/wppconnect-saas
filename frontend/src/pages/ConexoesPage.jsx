import React from 'react';
import Ic from '../components/icons';
import ConnectPanel from '../components/connect';
import NewSessionModal from '../components/modal';
import { sessionsService } from '../services/sessions';

const PAGE_SIZE = 8;

export default function ConexoesPage({ toast }) {
  const [sessions, setSessions]     = React.useState([]);
  const [loading, setLoading]       = React.useState(true);
  const [filter, setFilter]         = React.useState('all');
  const [search, setSearch]         = React.useState('');
  const [selected, setSelected]     = React.useState(new Set());
  const [activeId, setActiveId]     = React.useState(null);
  const [mode, setMode]             = React.useState('qr');
  const [qrVariant, setQrVariant]   = React.useState(1);
  const [timer, setTimer]           = React.useState(45);
  const [modalOpen, setModalOpen]   = React.useState(false);
  const [menuOpenId, setMenuOpenId] = React.useState(null);
  const [page, setPage]             = React.useState(1);

  const fetchSessions = React.useCallback(() => {
    setLoading(true);
    sessionsService.list()
      .then(res => setSessions(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // Reset página ao filtrar/buscar
  React.useEffect(() => setPage(1), [filter, search]);

  // QR countdown
  React.useEffect(() => {
    const id = setInterval(() => setTimer(t => {
      if (t <= 1) { setQrVariant(v => v + 1); return 45; }
      return t - 1;
    }), 1000);
    return () => clearInterval(id);
  }, []);

  // Fechar dropdown ao clicar fora
  React.useEffect(() => {
    const close = () => setMenuOpenId(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const counts = React.useMemo(() => ({
    all:       sessions.length,
    connected: sessions.filter(s => s.status === 'connected').length,
    pending:   sessions.filter(s => s.status === 'pending' || s.status === 'qr').length,
    offline:   sessions.filter(s => s.status === 'offline').length,
  }), [sessions]);

  const visible = React.useMemo(() => {
    const q = search.toLowerCase();
    return sessions.filter(s => {
      const matchFilter =
        filter === 'all' ||
        (filter === 'connected' && s.status === 'connected') ||
        (filter === 'pending'   && (s.status === 'pending' || s.status === 'qr')) ||
        (filter === 'offline'   && s.status === 'offline');
      const matchSearch = !q || s.name.toLowerCase().includes(q) || s.phone.includes(q);
      return matchFilter && matchSearch;
    });
  }, [sessions, filter, search]);

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const paginated  = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  React.useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages]);

  const activeSession = sessions.find(s => s.id === activeId) || null;

  const toggleRow   = (id) => setActiveId(prev => prev === id ? null : id);
  const toggleCheck = (id, e) => {
    e.stopPropagation();
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleAll = () =>
    setSelected(s => s.size === visible.length && visible.length > 0
      ? new Set()
      : new Set(visible.map(v => v.id)));

  const handleAction = async (session, action, e) => {
    e?.stopPropagation();
    setMenuOpenId(null);
    if (action === 'delete') {
      try {
        await sessionsService.remove(session.id);
        setSessions(l => l.filter(x => x.id !== session.id));
        if (activeId === session.id) setActiveId(null);
        setSelected(s => { const n = new Set(s); n.delete(session.id); return n; });
        toast(`Sessão "${session.name}" deletada`);
      } catch {
        toast('Erro ao deletar sessão', 'error');
      }
    } else if (action === 'qr') {
      setActiveId(session.id); setMode('qr');
      setQrVariant(v => v + 1); setTimer(45);
    } else if (action === 'status')     { toast(`Status: ${session.status}`);
    } else if (action === 'configurar') { toast('Abrindo configuração de produtos…');
    } else if (action === 'copy')       { toast('Token copiado');
    } else if (action === 'logs')       { toast('Abrindo logs da sessão…'); }
  };

  const bulkDelete = async () => {
    const ids = [...selected];
    try {
      await Promise.all(ids.map(id => sessionsService.remove(id)));
      setSessions(l => l.filter(s => !selected.has(s.id)));
      if (selected.has(activeId)) setActiveId(null);
      toast(`${ids.length} sessões deletadas`);
      setSelected(new Set());
    } catch {
      toast('Erro ao deletar sessões', 'error');
    }
  };

  const FILTERS = [
    { id: 'all',       label: 'Todas',         n: counts.all       },
    { id: 'connected', label: 'Conectadas',    n: counts.connected },
    { id: 'pending',   label: 'Pendentes',     n: counts.pending   },
    { id: 'offline',   label: 'Desconectadas', n: counts.offline   },
  ];

  return (
    <>
      {/* Header */}
      <div className="page-head">
        <div>
          <h1 className="page-title">Conexões WhatsApp</h1>
          <div className="page-sub">Gerencie as sessões conectadas ao workspace.</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {selected.size > 0 && (
            <button className="btn secondary" onClick={bulkDelete}>
              <Ic.Trash/> Deletar {selected.size}
            </button>
          )}
          <button className="btn secondary"><Ic.Download/> Exportar</button>
          <button className="btn primary" onClick={() => setModalOpen(true)}>
            <Ic.Plus/> Nova Sessão
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {[
          { id: 'all',       label: 'Total',         value: counts.all,       icon: 'Phone',       cls: 'total',     delta: `${counts.all} sessões` },
          { id: 'connected', label: 'Conectadas',    value: counts.connected, icon: 'PhonePlugged', cls: 'connected', delta: counts.all > 0 ? `${Math.round(counts.connected / counts.all * 100)}% do total` : '—' },
          { id: 'pending',   label: 'Pendentes',     value: counts.pending,   icon: 'Refresh',     cls: 'pending',   delta: counts.pending > 0 ? 'aguardando QR' : 'nenhuma' },
          { id: 'offline',   label: 'Desconectadas', value: counts.offline,   icon: 'X',           cls: 'offline',   delta: counts.offline > 0 ? 'reconectar' : 'nenhuma'   },
        ].map(m => {
          const Icon = Ic[m.icon];
          return (
            <div key={m.id}
              className={"stat" + (filter === m.id ? " active" : "")}
              onClick={() => setFilter(m.id)}>
              <div className={"stat-icon " + m.cls}><Icon/></div>
              <div style={{ flex: 1 }}>
                <div className="stat-label" style={{ marginTop: 0 }}>{m.label}</div>
                <div className="stat-value" style={{ marginTop: 4 }}>{String(m.value).padStart(2, '0')}</div>
                <span className="stat-delta">{m.delta}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Layout: tabela + painel lateral */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

        {/* Tabela */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card-panel" style={{ padding: 0 }}>
            {/* Toolbar */}
            <div style={{ padding: 12, display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
              <div className="search" style={{ width: 280 }}>
                <Ic.Search style={{ color: 'var(--ink-4)' }}/>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar sessão ou número…"/>
              </div>
              {FILTERS.map(f => (
                <button key={f.id}
                  className={"btn " + (filter === f.id ? 'secondary' : 'ghost')}
                  onClick={() => setFilter(f.id)}>
                  {f.label} <span className="badge">{f.n}</span>
                </button>
              ))}
              <div style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--ink-3)' }}>
                {selected.size > 0
                  ? `${selected.size} selecionada${selected.size > 1 ? 's' : ''}`
                  : `${visible.length} sessões`}
              </div>
            </div>

            {/* Tabela */}
            <table className="data-table">
              <thead><tr>
                <th style={{ width: 32 }}>
                  <input type="checkbox"
                    checked={selected.size === visible.length && visible.length > 0}
                    onChange={toggleAll}/>
                </th>
                <th>Sessão</th>
                <th>Status</th>
                <th>Tag</th>
                <th style={{ textAlign: 'right' }}>Msgs hoje</th>
                <th>Atividade</th>
                <th></th>
              </tr></thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-4)' }}>
                      Carregando…
                    </td>
                  </tr>
                )}
                {!loading && paginated.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-4)' }}>
                      {search ? `Nenhum resultado para "${search}"` : 'Nenhuma sessão nesta categoria'}
                    </td>
                  </tr>
                )}
                {!loading && paginated.map(s => {
                  const isActive  = activeId === s.id;
                  const isChecked = selected.has(s.id);
                  const statusMap = {
                    connected: { cls: 'connected', label: 'Conectado'    },
                    qr:        { cls: 'qr',        label: 'QR Pronto'    },
                    pending:   { cls: 'pending',   label: 'Pendente'     },
                    offline:   { cls: 'offline',   label: 'Desconectado' },
                  };
                  const st = statusMap[s.status] || statusMap.offline;
                  return (
                    <tr key={s.id}
                      onClick={() => toggleRow(s.id)}
                      style={{ cursor: 'pointer', background: isActive ? 'var(--accent-soft)' : isChecked ? 'var(--panel-2)' : undefined }}>
                      <td onClick={e => toggleCheck(s.id, e)}>
                        <input type="checkbox" checked={isChecked} readOnly/>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 32, height: 32, flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: isActive ? 'var(--accent)' : 'var(--panel-2)',
                            border: `1px solid ${isActive ? 'var(--accent-border)' : 'var(--border)'}`,
                            color: isActive ? '#fff' : 'var(--ink-3)',
                          }}>
                            {s.status === 'connected'
                              ? <Ic.PhonePlugged style={{ width: 14, height: 14 }}/>
                              : <Ic.Phone style={{ width: 14, height: 14 }}/>}
                          </div>
                          <div>
                            <b style={{ fontSize: 13.5 }}>{s.name}</b>
                            <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 1 }}>{s.phone}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={"pill " + st.cls}>
                          <span className="dot"/>{st.label}
                        </span>
                      </td>
                      <td><span className="chip">{s.tag}</span></td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: s.messagesToday > 0 ? 600 : 400, color: s.messagesToday > 0 ? 'var(--ink-1)' : 'var(--ink-4)' }}>
                        {s.messagesToday > 0 ? s.messagesToday.toLocaleString('pt-BR') : '—'}
                      </td>
                      <td style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>{s.lastActivity}</td>
                      <td>
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                          <button className="kbd-btn"
                            onClick={e => { e.stopPropagation(); setMenuOpenId(m => m === s.id ? null : s.id); }}>
                            <Ic.Dots/>
                          </button>
                          {menuOpenId === s.id && (
                            <div className="dropdown" style={{ right: 0, left: 'auto', zIndex: 20 }}
                              onClick={e => e.stopPropagation()}>
                              <button className="dropdown-item" onClick={e => handleAction(s, 'qr', e)}><Ic.Qr className="icon"/>Ver QR Code</button>
                              <button className="dropdown-item" onClick={e => handleAction(s, 'status', e)}><Ic.ChartBar className="icon"/>Verificar Status</button>
                              <button className="dropdown-item" onClick={e => handleAction(s, 'configurar', e)}><Ic.Tag className="icon"/>Configurar</button>
                              <button className="dropdown-item" onClick={e => handleAction(s, 'copy', e)}><Ic.Clipboard className="icon"/>Copiar Token</button>
                              <button className="dropdown-item" onClick={e => handleAction(s, 'logs', e)}><Ic.List className="icon"/>Ver Logs</button>
                              <div className="dropdown-sep"/>
                              <button className="dropdown-item danger" onClick={e => handleAction(s, 'delete', e)}><Ic.Trash className="icon"/>Deletar</button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 2px', marginTop: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>
              {visible.length > 0
                ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, visible.length)} de ${visible.length} sessões`
                : '0 sessões'}
            </span>
            {totalPages > 1 && (
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  style={{ padding: '4px 10px', fontSize: 12, border: '1px solid var(--border)', background: 'var(--panel-2)', color: page === 1 ? 'var(--ink-4)' : 'var(--ink-2)', cursor: page === 1 ? 'default' : 'pointer', opacity: page === 1 ? 0.5 : 1 }}>←</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button key={p} onClick={() => setPage(p)}
                    style={{ padding: '4px 10px', fontSize: 12, minWidth: 32, textAlign: 'center', border: '1px solid', cursor: 'pointer',
                      borderColor: p === page ? 'var(--accent-border)' : 'var(--border)',
                      background:  p === page ? 'var(--accent-soft)'  : 'var(--panel-2)',
                      color:       p === page ? 'var(--accent-ink)'   : 'var(--ink-2)',
                      fontWeight:  p === page ? 600 : 400 }}>
                    {p}
                  </button>
                ))}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  style={{ padding: '4px 10px', fontSize: 12, border: '1px solid var(--border)', background: 'var(--panel-2)', color: page === totalPages ? 'var(--ink-4)' : 'var(--ink-2)', cursor: page === totalPages ? 'default' : 'pointer', opacity: page === totalPages ? 0.5 : 1 }}>→</button>
              </div>
            )}
          </div>
        </div>

        {/* Painel lateral de conexão */}
        {activeSession && (
          <div style={{ width: 300, flexShrink: 0, position: 'sticky', top: 16 }}>
            <ConnectPanel
              session={activeSession}
              mode={mode} setMode={setMode}
              qrVariant={qrVariant} timer={timer}
              onRefresh={() => { setQrVariant(v => v + 1); setTimer(45); toast('Novo QR gerado'); }}
              onClose={() => setActiveId(null)}
            />
          </div>
        )}
      </div>

      {/* Modal nova sessão */}
      {modalOpen && (
        <NewSessionModal
          onClose={() => setModalOpen(false)}
          onCreate={(s) => {
            setSessions(list => [s, ...list]);
            setActiveId(s.id); setModalOpen(false);
            setMode('qr'); setQrVariant(v => v + 1); setTimer(45);
            toast(`Sessão "${s.name}" criada. Escaneie o QR.`);
          }}
        />
      )}
    </>
  );
}
