import React from 'react';
import Ic from '../components/icons';
import { groupsService } from '../services/groups';
import { sessionsService } from '../services/sessions';
import Pagination from '../components/pagination';

const PAGE_SIZE = 15;
const WPP_SERVER = import.meta.env.VITE_WPP_SERVER ?? 'http://localhost:21465/api';

function SendMsgModal({ groups, onClose, toast }) {
  const [sessions,  setSessions]  = React.useState([]);
  const [sessionId, setSessionId] = React.useState('');
  const [message,   setMessage]   = React.useState('');
  const [sending,   setSending]   = React.useState(false);
  const [results,   setResults]   = React.useState(null);

  React.useEffect(() => {
    sessionsService.list({ status: 'connected' })
      .then(res => { setSessions(res.data ?? []); if (res.data?.length) setSessionId(res.data[0].id); })
      .catch(() => {});
  }, []);

  const send = async (e) => {
    e.preventDefault();
    if (!sessionId || !message.trim()) return;
    setSending(true);
    try {
      const res   = await sessionsService.get(sessionId);
      const token = res.data?.wppToken ?? sessionId;
      const settled = await Promise.allSettled(
        groups.map(g =>
          fetch(`${WPP_SERVER}/${sessionId}/send-message`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: g.phone ?? g.id, message: message.trim(), isGroup: true }),
          })
        )
      );
      const ok  = settled.filter(r => r.status === 'fulfilled').length;
      const err = settled.filter(r => r.status === 'rejected').length;
      setResults({ ok, err });
    } catch { setResults({ ok: 0, err: groups.length }); }
    finally   { setSending(false); }
  };

  if (results) return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Envio concluído</h3>
          <p>{results.ok} de {groups.length} mensagens enviadas com sucesso.</p>
        </div>
        <div className="modal-body">
          {results.err > 0 && <div style={{ color: 'var(--rose-ink)', fontSize: 13 }}>{results.err} falha(s) — verifique se a sessão está conectada e o grupo tem um JID válido.</div>}
        </div>
        <div className="modal-foot">
          <button className="btn primary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={e => e.stopPropagation()} onSubmit={send}>
        <div className="modal-head">
          <h3>Enviar mensagem</h3>
          <p>Para {groups.length} grupo{groups.length !== 1 ? 's' : ''} selecionado{groups.length !== 1 ? 's' : ''}.</p>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Sessão conectada</label>
            <select value={sessionId} onChange={e => setSessionId(e.target.value)} required>
              <option value="">Selecionar sessão…</option>
              {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {sessions.length === 0 && <div style={{ fontSize: 12, color: 'var(--rose-ink)', marginTop: 4 }}>Nenhuma sessão conectada</div>}
          </div>
          <div className="field">
            <label>Mensagem</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)}
              rows={4} placeholder="Digite a mensagem…" required
              style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 13.5 }}/>
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn secondary" onClick={onClose} disabled={sending}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={sending || !sessionId || !message.trim()}>
            {sending ? 'Enviando…' : <><Ic.Send style={{ width: 13, height: 13 }}/> Enviar</>}
          </button>
        </div>
      </form>
    </div>
  );
}

function GroupModal({ group, onClose, onSave }) {
  const [name,              setName]              = React.useState(group?.name              ?? '');
  const [description,       setDescription]       = React.useState(group?.description       ?? '');
  const [participantsCount, setParticipantsCount] = React.useState(group?.participantsCount ?? 0);
  const [tags,              setTags]              = React.useState((group?.tags ?? []).join(', '));
  const [status,            setStatus]            = React.useState(group?.status            ?? 'ativo');
  const [loading,           setLoading]           = React.useState(false);
  const [error,             setError]             = React.useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true); setError(null);
    const payload = {
      name:              name.trim(),
      description:       description.trim(),
      participantsCount: Number(participantsCount) || 0,
      tags:              tags.split(',').map(t => t.trim()).filter(Boolean),
      status,
    };
    try {
      const res = group
        ? await groupsService.update(group.id, payload)
        : await groupsService.create(payload);
      onSave(res.data, !!group);
    } catch (err) {
      setError(err?.error ?? 'Erro ao salvar grupo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head">
          <h3>{group ? 'Editar grupo' : 'Novo grupo'}</h3>
          <p>Cadastre um grupo do WhatsApp no workspace.</p>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Nome do grupo</label>
            <input autoFocus value={name} onChange={e => setName(e.target.value)}
              placeholder="Ex: Suporte VIP" required/>
          </div>
          <div className="field">
            <label>Descrição <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>(opcional)</span></label>
            <input value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Finalidade do grupo"/>
          </div>
          <div className="field">
            <label>Participantes</label>
            <input type="number" min="0" value={participantsCount}
              onChange={e => setParticipantsCount(e.target.value)}
              placeholder="0"/>
          </div>
          <div className="field">
            <label>Tags <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>(separadas por vírgula)</span></label>
            <input value={tags} onChange={e => setTags(e.target.value)}
              placeholder="VIP, Marketing, Suporte"/>
          </div>
          <div className="field">
            <label>Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)}>
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </div>
          {error && <div style={{ color: 'var(--rose-ink)', fontSize: 13 }}>{error}</div>}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn secondary" onClick={onClose} disabled={loading}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={loading || !name.trim()}>
            <Ic.Check/> {loading ? 'Salvando…' : (group ? 'Salvar alterações' : 'Criar grupo')}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function GruposPage({ toast }) {
  const [groups, setGroups]       = React.useState([]);
  const [stats, setStats]         = React.useState({ total: 0, ativos: 0, inativos: 0, totalParticipants: 0 });
  const [loading, setLoading]     = React.useState(true);
  const [selected, setSelected]   = React.useState(new Set());
  const [query, setQuery]         = React.useState('');
  const [page, setPage]           = React.useState(1);
  const [modalGroup, setModalGroup] = React.useState(null); // null=fechado | 'new' | obj
  const [tagFilter,  setTagFilter]  = React.useState(new Set());
  const [tagPopover, setTagPopover] = React.useState(false);
  const [sendOpen,   setSendOpen]   = React.useState(false);

  const refetch = React.useCallback(() => {
    setLoading(true);
    groupsService.list()
      .then(res => { setGroups(res.data); setStats(res.stats); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { refetch(); }, [refetch]);

  const allTags = React.useMemo(() =>
    [...new Set(groups.flatMap(g => g.tags ?? []))].sort(), [groups]);

  const filtered = groups.filter(g => {
    const q       = query.toLowerCase();
    const matchQ  = !q || g.name.toLowerCase().includes(q) || (g.description ?? '').toLowerCase().includes(q);
    const matchTag = tagFilter.size === 0 || [...tagFilter].some(t => (g.tags ?? []).includes(t));
    return matchQ && matchTag;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  React.useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages]);
  React.useEffect(() => { setPage(1); }, [query, tagFilter]);

  const toggle    = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(s =>
    s.size === filtered.length && filtered.length > 0 ? new Set() : new Set(filtered.map(g => g.id))
  );

  const handleSave = (saved, isEdit) => {
    setModalGroup(null);
    toast?.(isEdit ? 'Grupo atualizado' : 'Grupo criado');
    refetch();
  };

  const handleDelete = async (id) => {
    try {
      await groupsService.remove(id);
      setGroups(l => l.filter(g => g.id !== id));
      setSelected(s => { const n = new Set(s); n.delete(id); return n; });
      toast?.('Grupo removido');
    } catch {
      toast?.('Erro ao remover grupo', 'error');
    }
  };

  const handleExportCSV = () => {
    const rows = [['id','name','description','participants','tags','status','messages','lastInteraction']];
    const list = selected.size > 0 ? groups.filter(g => selected.has(g.id)) : groups;
    list.forEach(g => rows.push([
      g.id,
      `"${g.name.replace(/"/g, '""')}"`,
      `"${(g.description ?? '').replace(/"/g, '""')}"`,
      g.participantsCount ?? 0,
      `"${(g.tags ?? []).join('; ')}"`,
      g.status,
      g.messagesCount ?? 0,
      g.lastInteraction ?? '',
    ]));
    const csv  = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'grupos.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast?.(`${list.length} grupos exportados`);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Grupos</h1>
          <div className="page-sub">{stats.total.toLocaleString('pt-BR')} grupos · {Number(stats.totalParticipants).toLocaleString('pt-BR')} participantes no total</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn secondary" onClick={handleExportCSV}><Ic.Download/> Exportar CSV</button>
          <button className="btn primary" onClick={() => setModalGroup('new')}><Ic.Plus/> Novo grupo</button>
        </div>
      </div>

      <div className="stats">
        {[
          { label: 'Total',        value: String(stats.total).padStart(2,'0'),                                                                     icon: 'Group',  cls: 'total',     delta: 'grupos' },
          { label: 'Ativos',       value: String(stats.ativos).padStart(2,'0'),                                                                    icon: 'Check',  cls: 'connected', delta: stats.total > 0 ? `${Math.round(stats.ativos / stats.total * 100)}% do total` : '—' },
          { label: 'Inativos',     value: String(stats.inativos).padStart(2,'0'),                                                                  icon: 'X',      cls: 'offline',   delta: stats.inativos > 0 ? 'sem atividade' : 'nenhum' },
          { label: 'Participantes',value: Number(stats.totalParticipants).toLocaleString('pt-BR'),                                                  icon: 'Users',  cls: 'total',     delta: 'total nos grupos' },
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
        <div className="table-toolbar" style={{ padding: 12, display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
          <div className="search" style={{ width: 320 }}>
            <Ic.Search style={{ color: 'var(--ink-4)' }}/>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nome ou descrição…"/>
          </div>
          {/* Tags filter */}
          <div style={{ position: 'relative' }}>
            <button className={'btn ' + (tagFilter.size > 0 ? 'secondary' : 'ghost')}
              onClick={() => setTagPopover(v => !v)}>
              <Ic.Tag/> Tags {tagFilter.size > 0 && <span className="badge">{tagFilter.size}</span>}
            </button>
            {tagPopover && (
              <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 20, background: 'var(--panel-1)',
                border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                minWidth: 180, padding: '8px 4px' }}>
                {allTags.length === 0
                  ? <div style={{ padding: '8px 12px', fontSize: 13, color: 'var(--ink-4)' }}>Nenhuma tag</div>
                  : allTags.map(tag => (
                    <label key={tag} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
                      cursor: 'pointer', borderRadius: 6, background: tagFilter.has(tag) ? 'var(--accent-soft)' : 'transparent' }}>
                      <input type="checkbox" checked={tagFilter.has(tag)} onChange={() =>
                        setTagFilter(s => { const n = new Set(s); n.has(tag) ? n.delete(tag) : n.add(tag); return n; })}/>
                      <span className="chip" style={{ fontSize: 12 }}>{tag}</span>
                    </label>
                  ))
                }
                {tagFilter.size > 0 && (
                  <button style={{ width: '100%', padding: '6px 12px', marginTop: 4, background: 'none', border: 'none',
                    borderTop: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, color: 'var(--ink-3)', textAlign: 'left' }}
                    onClick={() => { setTagFilter(new Set()); setTagPopover(false); }}>
                    Limpar filtro
                  </button>
                )}
              </div>
            )}
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--ink-3)' }}>
            {selected.size > 0 ? `${selected.size} selecionados` : `${filtered.length} grupos`}
          </div>
          {selected.size > 0 && (
            <button className="btn accent" onClick={() => setSendOpen(true)}>
              <Ic.Send style={{ width: 13, height: 13 }}/> Enviar mensagem
            </button>
          )}
        </div>

        <table className="data-table">
          <thead><tr>
            <th style={{ width: 32 }}>
              <input type="checkbox"
                checked={selected.size === filtered.length && filtered.length > 0}
                onChange={toggleAll}/>
            </th>
            <th>Nome</th>
            <th style={{ textAlign: 'right' }}>Participantes</th>
            <th>Tags</th>
            <th style={{ textAlign: 'right' }}>Mensagens</th>
            <th>Última interação</th>
            <th>Status</th>
            <th></th>
          </tr></thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-4)' }}>Carregando…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-4)' }}>
                {query ? `Nenhum resultado para "${query}"` : 'Nenhum grupo cadastrado'}
              </td></tr>
            )}
            {!loading && paginated.map(g => (
              <tr key={g.id}>
                <td><input type="checkbox" checked={selected.has(g.id)} onChange={() => toggle(g.id)}/></td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="stat-icon total" style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0 }}>
                      <Ic.Group style={{ width: 13, height: 13 }}/>
                    </div>
                    <div>
                      <b>{g.name}</b>
                      {g.description && (
                        <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 1 }}>{g.description}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>{g.participantsCount}</td>
                <td>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {(g.tags ?? []).map(t => (
                      <span key={t} className={"chip " + (t === 'VIP' ? 'accent' : t === 'Trial' ? 'warn' : '')}>{t}</span>
                    ))}
                  </div>
                </td>
                <td className="mono" style={{ textAlign: 'right' }}>{g.messagesCount}</td>
                <td style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>{g.lastInteraction ?? '—'}</td>
                <td>
                  <span className={"pill " + (g.status === 'ativo' ? 'connected' : 'offline')}>
                    <span className="dot"/>{g.status}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="kbd-btn" title="Editar" onClick={() => setModalGroup(g)}><Ic.Cog/></button>
                    <button className="kbd-btn" title="Remover" onClick={() => handleDelete(g.id)}><Ic.Trash/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} total={filtered.length}
        perPage={PAGE_SIZE} label="grupos" onChange={setPage}/>

      {modalGroup && (
        <GroupModal
          group={modalGroup === 'new' ? null : modalGroup}
          onClose={() => setModalGroup(null)}
          onSave={handleSave}
        />
      )}
      {sendOpen && (
        <SendMsgModal
          groups={groups.filter(g => selected.has(g.id))}
          onClose={() => setSendOpen(false)}
          toast={toast}
        />
      )}
    </>
  );
}
