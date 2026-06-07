import React from 'react';
import Ic from '../components/icons';
import { contactsService } from '../services/contacts';

function ContactModal({ contact, onClose, onSave }) {
  const [name, setName]       = React.useState(contact?.name ?? '');
  const [phone, setPhone]     = React.useState(contact?.phone ?? '');
  const [tags, setTags]       = React.useState((contact?.tags ?? []).join(', '));
  const [status, setStatus]   = React.useState(contact?.status ?? 'ativo');
  const [loading, setLoading] = React.useState(false);
  const [error, setError]     = React.useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    setLoading(true); setError(null);
    const payload = {
      name:   name.trim(),
      phone:  phone.trim(),
      tags:   tags.split(',').map(t => t.trim()).filter(Boolean),
      status,
    };
    try {
      const res = contact
        ? await contactsService.update(contact.id, payload)
        : await contactsService.create(payload);
      onSave(res.data, !!contact);
    } catch (err) {
      setError(err?.error ?? 'Erro ao salvar contato');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head">
          <h3>{contact ? 'Editar contato' : 'Novo contato'}</h3>
          <p>Adicione um contato manualmente ao workspace.</p>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Nome</label>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Nome completo" required/>
          </div>
          <div className="field">
            <label>Telefone (com DDI)</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+5511987654321" required/>
          </div>
          <div className="field">
            <label>Tags <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>(separadas por vírgula)</span></label>
            <input value={tags} onChange={e => setTags(e.target.value)} placeholder="VIP, Trial, Lead"/>
          </div>
          <div className="field">
            <label>Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)}>
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </div>
          {error && <div style={{ color: 'var(--rose-ink)', fontSize: 13, marginTop: 8 }}>{error}</div>}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn secondary" onClick={onClose} disabled={loading}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={loading || !name.trim() || !phone.trim()}>
            <Ic.Check/> {loading ? 'Salvando…' : (contact ? 'Salvar alterações' : 'Criar contato')}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function ContatosPage({ toast }) {
  const [contacts, setContacts]   = React.useState([]);
  const [stats, setStats]         = React.useState({ total: 0, ativos: 0, inativos: 0, totalMessages: 0 });
  const [loading, setLoading]     = React.useState(true);
  const [selected, setSelected]   = React.useState(new Set());
  const [query, setQuery]         = React.useState('');
  const [modalContact, setModalContact] = React.useState(null); // null=fechado | 'new' | obj

  const refetch = React.useCallback(() => {
    setLoading(true);
    contactsService.list()
      .then(res => { setContacts(res.data); setStats(res.stats); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { refetch(); }, [refetch]);

  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(query.toLowerCase()) || c.phone.includes(query)
  );

  const toggle    = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(s => s.size === filtered.length && filtered.length > 0 ? new Set() : new Set(filtered.map(c => c.id)));

  const handleSave = (saved, isEdit) => {
    setModalContact(null);
    toast?.(isEdit ? 'Contato atualizado' : 'Contato criado');
    refetch();
  };

  const handleDelete = async (id) => {
    try {
      await contactsService.remove(id);
      setContacts(l => l.filter(c => c.id !== id));
      setSelected(s => { const n = new Set(s); n.delete(id); return n; });
      toast?.('Contato removido');
    } catch {
      toast?.('Erro ao remover contato', 'error');
    }
  };

  const handleExportCSV = () => {
    const rows = [['id','name','phone','tags','status','messages','lastInteraction']];
    const list = selected.size > 0 ? contacts.filter(c => selected.has(c.id)) : contacts;
    list.forEach(c => rows.push([
      c.id,
      `"${c.name.replace(/"/g, '""')}"`,
      c.phone,
      `"${(c.tags ?? []).join('; ')}"`,
      c.status,
      c.messagesCount ?? 0,
      c.lastInteraction ?? '',
    ]));
    const csv  = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'contatos.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast?.(`${list.length} contatos exportados`);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Contatos</h1>
          <div className="page-sub">{stats.total.toLocaleString('pt-BR')} contatos · sincronizados das sessões conectadas</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn secondary" onClick={handleExportCSV}><Ic.Download/> Exportar CSV</button>
          <button className="btn primary" onClick={() => setModalContact('new')}><Ic.Plus/> Novo contato</button>
        </div>
      </div>

      <div className="stats" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {[
          { label: 'Total',     value: String(stats.total).padStart(2,'0'),                                icon: 'Users',   cls: 'total',     delta: 'contatos' },
          { label: 'Ativos',    value: String(stats.ativos).padStart(2,'0'),                               icon: 'Check',   cls: 'connected', delta: stats.total > 0 ? `${Math.round(stats.ativos / stats.total * 100)}% do total` : '—' },
          { label: 'Inativos',  value: String(stats.inativos).padStart(2,'0'),                             icon: 'X',       cls: 'offline',   delta: stats.inativos > 0 ? 'sem interação' : 'nenhum' },
          { label: 'Mensagens', value: Number(stats.totalMessages).toLocaleString('pt-BR'),                icon: 'Msg',     cls: 'total',     delta: 'total enviadas' },
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
          <div className="search" style={{ width: 320 }}>
            <Ic.Search style={{ color: 'var(--ink-4)' }}/>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nome ou telefone…"/>
          </div>
          <button className="btn ghost"><Ic.Tag/> Tags</button>
          <button className="btn ghost"><Ic.Folder/> Listas</button>
          <div style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--ink-3)' }}>
            {selected.size > 0 ? `${selected.size} selecionados` : `${filtered.length} contatos`}
          </div>
          {selected.size > 0 && <button className="btn accent"><Ic.Send/> Enviar mensagem</button>}
        </div>

        <table className="data-table">
          <thead><tr>
            <th style={{ width: 32 }}>
              <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll}/>
            </th>
            <th>Nome</th>
            <th>Telefone</th>
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
                {query ? `Nenhum resultado para "${query}"` : 'Nenhum contato cadastrado'}
              </td></tr>
            )}
            {!loading && filtered.map(c => (
              <tr key={c.id}>
                <td><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)}/></td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="avatar" style={{ width: 28, height: 28, fontSize: 10.5 }}>
                      {c.name.split(' ').map(p => p[0]).slice(0,2).join('')}
                    </div>
                    <b>{c.name}</b>
                  </div>
                </td>
                <td className="mono" style={{ fontSize: 12 }}>{c.phone}</td>
                <td>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {(c.tags ?? []).map(t => (
                      <span key={t} className={"chip " + (t === 'VIP' ? 'accent' : t === 'Trial' ? 'warn' : '')}>{t}</span>
                    ))}
                  </div>
                </td>
                <td className="mono" style={{ textAlign: 'right' }}>{c.messagesCount}</td>
                <td style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>{c.lastInteraction ?? '—'}</td>
                <td>
                  <span className={"pill " + (c.status === 'ativo' ? 'connected' : 'offline')}>
                    <span className="dot"/>{c.status}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="kbd-btn" title="Editar" onClick={() => setModalContact(c)}><Ic.Cog/></button>
                    <button className="kbd-btn" title="Remover" onClick={() => handleDelete(c.id)}><Ic.Trash/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalContact && (
        <ContactModal
          contact={modalContact === 'new' ? null : modalContact}
          onClose={() => setModalContact(null)}
          onSave={handleSave}
        />
      )}
    </>
  );
}
