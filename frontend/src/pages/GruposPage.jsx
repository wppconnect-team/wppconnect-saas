import React from 'react';
import Ic from '../components/icons';
import { groupsService } from '../services/groups';
import Pagination from '../components/pagination';

const PAGE_SIZE = 15;

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

  const refetch = React.useCallback(() => {
    setLoading(true);
    groupsService.list()
      .then(res => { setGroups(res.data); setStats(res.stats); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { refetch(); }, [refetch]);

  const filtered = groups.filter(g =>
    g.name.toLowerCase().includes(query.toLowerCase()) ||
    (g.description ?? '').toLowerCase().includes(query.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  React.useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages]);
  React.useEffect(() => { setPage(1); }, [query]);

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
          <button className="btn ghost"><Ic.Tag/> Tags</button>
          <div style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--ink-3)' }}>
            {selected.size > 0 ? `${selected.size} selecionados` : `${filtered.length} grupos`}
          </div>
          {selected.size > 0 && (
            <button className="btn accent"><Ic.Send/> Enviar mensagem</button>
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
    </>
  );
}
