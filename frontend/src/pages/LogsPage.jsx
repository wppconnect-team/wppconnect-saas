import React from 'react';
import Ic from '../components/icons';
import { logsService } from '../services/logs';

const LEVEL = {
  info:  { label: 'INFO',  pillCls: 'qr'       },
  warn:  { label: 'WARN',  pillCls: 'pending'   },
  error: { label: 'ERROR', pillCls: 'offline'   },
  ok:    { label: 'OK',    pillCls: 'connected' },
};

function formatTime(date) {
  return new Date(date).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export default function LogsPage() {
  const [rows, setRows]       = React.useState([]);
  const [counts, setCounts]   = React.useState({ total: 0, ok: 0, info: 0, warn: 0, error: 0 });
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter]   = React.useState('all');
  const [query, setQuery]     = React.useState('');
  const [sourceFilter, setSourceFilter] = React.useState('');

  // Lê filtro de fonte passado por sessionStorage (ex: de Webhooks "Ver logs")
  React.useEffect(() => {
    const src = sessionStorage.getItem('logs_source_filter');
    if (src) {
      setSourceFilter(src);
      sessionStorage.removeItem('logs_source_filter');
    }
  }, []);

  React.useEffect(() => {
    setLoading(true);
    const params = {};
    if (filter !== 'all') params.level = filter;
    if (query) params.search = query;
    if (sourceFilter) params.source = sourceFilter;
    logsService.list(params)
      .then(res => {
        setRows(res.data);
        setCounts(res.counts);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filter, query, sourceFilter]);

  const handleExportCSV = () => {
    const header = ['id','level','message','source','createdAt'];
    const csvRows = [header, ...rows.map(r => [
      r.id,
      r.level,
      `"${String(r.message).replace(/"/g, '""')}"`,
      r.source,
      r.createdAt,
    ])];
    const csv  = csvRows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'logs.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const visible = rows;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Logs</h1>
          <div className="page-sub">
            Eventos em tempo real de sessões, webhooks e automações.
            {sourceFilter && (
              <span style={{ marginLeft: 8 }}>
                <span className="chip mono" style={{ fontSize: 11 }}>{sourceFilter}</span>
                {' '}
                <button style={{ fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', textDecoration: 'underline', padding: 0 }}
                  onClick={() => setSourceFilter('')}>limpar</button>
              </span>
            )}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-3)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 2s infinite' }}/>
            ao vivo
          </div>
          <button className="btn secondary" onClick={handleExportCSV}><Ic.Download/> Exportar</button>
        </div>
      </div>

      <div className="stats" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {[
          { id: 'ok',    label: 'OK',    value: counts.ok,    icon: 'Check',   cls: 'connected' },
          { id: 'info',  label: 'Info',  value: counts.info,  icon: 'Info',    cls: 'total'     },
          { id: 'warn',  label: 'Warn',  value: counts.warn,  icon: 'Refresh', cls: 'pending'   },
          { id: 'error', label: 'Erros', value: counts.error, icon: 'X',       cls: 'offline'   },
        ].map(m => {
          const Icon = Ic[m.icon];
          return (
            <div key={m.id}
              className={"stat" + (filter === m.id ? " active" : "")}
              onClick={() => setFilter(f => f === m.id ? 'all' : m.id)}
              style={{ cursor: 'pointer' }}>
              <div className={"stat-icon " + m.cls}><Icon/></div>
              <div style={{ flex: 1 }}>
                <div className="stat-label" style={{ marginTop: 0 }}>{m.label}</div>
                <div className="stat-value" style={{ marginTop: 4 }}>{String(m.value ?? 0).padStart(2,'0')}</div>
                <span className="stat-delta">{(m.value ?? 0) > 0 ? 'eventos' : 'nenhum'}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card-panel" style={{ padding: 0 }}>
        <div style={{ padding: 12, display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
          <div className="search" style={{ width: 320 }}>
            <Ic.Search style={{ color: 'var(--ink-4)' }}/>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar mensagem ou fonte…"/>
          </div>
          {['all','ok','info','warn','error'].map(f => (
            <button key={f} className={"btn " + (filter === f ? 'secondary' : 'ghost')} onClick={() => setFilter(f)}>
              {f === 'all' ? 'Todos' : f.toUpperCase()}
              <span className="badge" style={{ marginLeft: 4 }}>{f === 'all' ? counts.total : (counts[f] ?? 0)}</span>
            </button>
          ))}
          <div style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--ink-3)' }}>
            {visible.length} entradas
          </div>
        </div>

        <table className="data-table">
          <thead><tr>
            <th style={{ width: 110 }}>Horário</th>
            <th style={{ width: 80 }}>Nível</th>
            <th>Mensagem</th>
            <th style={{ width: 130 }}>Fonte</th>
          </tr></thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-4)' }}>Carregando…</td></tr>
            )}
            {!loading && visible.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-4)' }}>Nenhum log encontrado</td></tr>
            )}
            {!loading && visible.slice(0, 50).map(r => {
              const cfg = LEVEL[r.level] || LEVEL.info;
              return (
                <tr key={r.id}>
                  <td className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                    {formatTime(r.createdAt)}
                  </td>
                  <td>
                    <span className={"pill " + cfg.pillCls}>
                      <span className="dot"/>{cfg.label}
                    </span>
                  </td>
                  <td style={{ fontSize: 12.5 }}>{r.message}</td>
                  <td className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{r.source}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {visible.length > 50 && (
          <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--ink-4)', borderTop: '1px solid var(--border)' }}>
            Mostrando 50 de {visible.length} entradas
          </div>
        )}
      </div>
    </>
  );
}
