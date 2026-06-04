import React from 'react';
import Ic from '../components/icons';
import { contactsService } from '../services/contacts';

export default function ContatosPage({ toast }) {
  const [contacts, setContacts] = React.useState([]);
  const [stats, setStats]       = React.useState({ total: 0, ativos: 0, inativos: 0, totalMessages: 0 });
  const [loading, setLoading]   = React.useState(true);
  const [selected, setSelected] = React.useState(new Set());
  const [query, setQuery]       = React.useState('');

  React.useEffect(() => {
    setLoading(true);
    contactsService.list()
      .then(res => {
        setContacts(res.data);
        setStats(res.stats);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(query.toLowerCase()) || c.phone.includes(query)
  );

  const toggle    = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(s => s.size === filtered.length && filtered.length > 0 ? new Set() : new Set(filtered.map(c => c.id)));

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

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Contatos</h1>
          <div className="page-sub">{stats.total.toLocaleString('pt-BR')} contatos · sincronizados das sessões conectadas</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn secondary"><Ic.Download/> Exportar CSV</button>
          <button className="btn primary"><Ic.Plus/> Novo contato</button>
        </div>
      </div>

      {/* Métricas */}
      <div className="stats" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {[
          { label: 'Total',     value: String(stats.total).padStart(2,'0'),                               icon: 'Users',   cls: 'total',     delta: 'contatos' },
          { label: 'Ativos',    value: String(stats.ativos).padStart(2,'0'),                              icon: 'Check',   cls: 'connected', delta: stats.total > 0 ? `${Math.round(stats.ativos / stats.total * 100)}% do total` : '—' },
          { label: 'Inativos',  value: String(stats.inativos).padStart(2,'0'),                            icon: 'X',       cls: 'offline',   delta: stats.inativos > 0 ? 'sem interação' : 'nenhum' },
          { label: 'Mensagens', value: Number(stats.totalMessages).toLocaleString('pt-BR'),               icon: 'Msg',     cls: 'total',     delta: 'total enviadas' },
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

      {/* Listagem */}
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
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-4)' }}>
                  Carregando…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-4)' }}>
                  {query ? `Nenhum resultado para "${query}"` : 'Nenhum contato cadastrado'}
                </td>
              </tr>
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
                  <button className="kbd-btn" onClick={() => handleDelete(c.id)} title="Remover">
                    <Ic.Trash/>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
