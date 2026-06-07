import React from 'react';
import Ic from '../components/icons';
import ConnectPanel from '../components/connect';
import NewSessionModal from '../components/modal';
import QrCodeModal from '../components/qrmodal';
import { sessionsService } from '../services/sessions';
import Pagination from '../components/pagination';

const PAGE_SIZE = 8;

function SessionConfigModal({ session, onClose, onSave }) {
  const [name, setName]   = React.useState(session.name);
  const [tag,  setTag]    = React.useState(session.tag ?? '');
  const [phone, setPhone] = React.useState(session.phone ?? '');
  const [busy, setBusy]   = React.useState(false);
  const [err,  setErr]    = React.useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await sessionsService.update(session.id, { name: name.trim(), tag: tag.trim(), phone: phone.trim() });
      onSave(res.data);
    } catch (e) { setErr(e?.error ?? 'Erro ao salvar'); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head">
          <h3>Configurar sessão</h3>
          <p>Edite as informações da sessão <strong>{session.id}</strong>.</p>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Nome</label>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} required/>
          </div>
          <div className="field">
            <label>Número (com DDI)</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+5511987654321"/>
          </div>
          <div className="field">
            <label>Tag</label>
            <input value={tag} onChange={e => setTag(e.target.value)} placeholder="atendimento, marketing…"/>
          </div>
          {err && <div style={{ color: 'var(--rose-ink)', fontSize: 13 }}>{err}</div>}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={busy}>
            <Ic.Check/> {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function ConexoesPage({ toast }) {
  const [sessions, setSessions]     = React.useState([]);
  const [loading, setLoading]       = React.useState(true);
  const [filter, setFilter]         = React.useState('all');
  const [search, setSearch]         = React.useState('');
  const [selected, setSelected]     = React.useState(new Set());
  const [activeId, setActiveId]         = React.useState(null);
  const [activeSessionFull, setActiveSessionFull] = React.useState(null);
  const [modalOpen, setModalOpen]   = React.useState(false);
  const [qrSession, setQrSession]   = React.useState(null);
  const [page, setPage]             = React.useState(1);
  const [configSession, setConfigSession] = React.useState(null);

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

  // Busca dados completos (qrImage + qrExpiresAt) ao abrir o painel lateral
  React.useEffect(() => {
    if (!activeId) { setActiveSessionFull(null); return; }
    setActiveSessionFull(null);
    sessionsService.get(activeId)
      .then(res => setActiveSessionFull(res.data))
      .catch(() => {
        setActiveSessionFull(sessions.find(s => s.id === activeId) ?? null);
      });
  }, [activeId]);

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
      // Busca o detalhe para obter wppToken e qrImage/qrExpiresAt (não expostos na listagem)
      try {
        const res = await sessionsService.get(session.id);
        setQrSession(res.data);
      } catch {
        setQrSession(session); // fallback sem wppToken
      }
    } else if (action === 'status') {
      try {
        const res = await sessionsService.get(session.id);
        const s   = res.data;
        setSessions(l => l.map(x => x.id === s.id ? { ...x, status: s.status, messagesToday: s.messagesToday } : x));
        const labels = { connected: 'Conectada', qr: 'Aguardando QR', pending: 'Pendente', offline: 'Desconectada' };
        toast(`${session.name}: ${labels[s.status] ?? s.status}`);
      } catch { toast('Erro ao verificar status', 'error'); }
    } else if (action === 'configurar') { setConfigSession(session);
    } else if (action === 'copy') {
      try {
        const res = await sessionsService.get(session.id);
        const token = res.data?.wppToken;
        if (token) {
          await navigator.clipboard.writeText(token);
          toast('Token copiado');
        } else {
          toast('Token não disponível para esta sessão', 'error');
        }
      } catch {
        toast('Erro ao copiar token', 'error');
      }
    } else if (action === 'logs') {
      sessionStorage.setItem('logs_source_filter', session.id);
      window.location.hash = 'logs';
    }
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

  const _qrExpiry  = qrSession?.qrExpiresAt ? new Date(qrSession.qrExpiresAt) : null;
  const _initQr    = (_qrExpiry && _qrExpiry > new Date()) ? qrSession.qrImage : null;
  const _initTimer = _initQr ? Math.max(5, Math.round((_qrExpiry - Date.now()) / 1000)) : 60;

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
          <button className="btn secondary" onClick={() => {
            const header = ['id','name','phone','tag','status','messagesToday','lastActivity'];
            const list = selected.size > 0 ? sessions.filter(s => selected.has(s.id)) : sessions;
            const csv = [header, ...list.map(s => [
              s.id,
              `"${String(s.name).replace(/"/g,'""')}"`,
              s.phone,
              s.tag,
              s.status,
              s.messagesToday ?? 0,
              s.lastActivity ?? '',
            ])].map(r => r.join(',')).join('\n');
            const a = Object.assign(document.createElement('a'), {
              href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })),
              download: 'sessoes.csv',
            });
            a.click();
            URL.revokeObjectURL(a.href);
            toast(`${list.length} sessões exportadas`);
          }}><Ic.Download/> Exportar</button>
          <button className="btn primary" onClick={() => setModalOpen(true)}>
            <Ic.Plus/> Nova Sessão
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats">
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
      <div className="conexoes-layout">

        {/* Tabela */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card-panel" style={{ padding: 0 }}>
            {/* Toolbar */}
            <div className="table-toolbar" style={{ padding: 12, display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
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
                <th style={{ width: 200 }}></th>
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
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end' }}>
                          <button className="kbd-btn" title="Ver QR Code"      onClick={e => handleAction(s, 'qr', e)}><Ic.Qr/></button>
                          <button className="kbd-btn" title="Verificar Status" onClick={e => handleAction(s, 'status', e)}><Ic.ChartBar/></button>
                          <button className="kbd-btn" title="Configurar"       onClick={e => handleAction(s, 'configurar', e)}><Ic.Tag/></button>
                          <button className="kbd-btn" title="Copiar Token"     onClick={e => handleAction(s, 'copy', e)}><Ic.Clipboard/></button>
                          <button className="kbd-btn" title="Ver Logs"         onClick={e => handleAction(s, 'logs', e)}><Ic.List/></button>
                          <button className="kbd-btn" title="Deletar"
                            style={{ color: 'var(--danger, #e55)' }}
                            onClick={e => handleAction(s, 'delete', e)}><Ic.Trash/></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination page={page} totalPages={totalPages} total={visible.length}
            perPage={PAGE_SIZE} label="sessões" onChange={setPage}/>
        </div>

        {/* Painel lateral de conexão */}
        {activeSession && (
          <div className="conexoes-panel">
            {!activeSessionFull
              ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--ink-4)', fontSize: 13 }}>
                  Carregando…
                </div>
              : <ConnectPanel
                  key={activeSessionFull.id}
                  session={activeSessionFull}
                  onClose={() => setActiveId(null)}
                  onConnected={(id) => {
                    setSessions(list => list.map(s => s.id === id ? { ...s, status: 'connected' } : s));
                    sessionsService.update(id, { status: 'connected', qr_image: null, qr_expires_at: null }).catch(() => {});
                    toast('Sessão conectada com sucesso');
                  }}
                />
            }
          </div>
        )}
      </div>

      {/* Modal QR Code */}
      {qrSession && (
        <QrCodeModal
          session={qrSession}
          initialQr={_initQr}
          initialTimer={_initTimer}
          onClose={() => setQrSession(null)}
          onQr={(id, img) => {
            const expiresAt = new Date(Date.now() + 60_000).toISOString();
            sessionsService.update(id, { qr_image: img, qr_expires_at: expiresAt }).catch(() => {});
          }}
          onConnected={(id) => {
            setSessions(list => list.map(s => s.id === id ? { ...s, status: 'connected' } : s));
            sessionsService.update(id, { status: 'connected', qr_image: null, qr_expires_at: null }).catch(() => {});
          }}
          onAbort={(id) => {
            setSessions(list => list.map(s => s.id === id ? { ...s, status: 'offline' } : s));
            sessionsService.update(id, { status: 'offline', qr_image: null, qr_expires_at: null }).catch(() => {});
          }}
        />
      )}

      {/* Modal configurar sessão */}
      {configSession && (
        <SessionConfigModal
          session={configSession}
          onClose={() => setConfigSession(null)}
          onSave={(updated) => {
            setSessions(l => l.map(s => s.id === updated.id ? { ...s, ...updated } : s));
            setConfigSession(null);
            toast('Sessão atualizada');
          }}
        />
      )}

      {/* Modal nova sessão */}
      {modalOpen && (
        <NewSessionModal
          onClose={() => setModalOpen(false)}
          onCreate={(s) => {
            setSessions(list => [s, ...list]);
            setActiveId(s.id);
            setModalOpen(false);
            toast(`Sessão "${s.name}" criada. Clique nela para conectar.`);
          }}
        />
      )}
    </>
  );
}
