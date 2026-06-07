import React from 'react';
import Ic from '../components/icons';
import { tokensService } from '../services/tokens';
import Pagination from '../components/pagination';

const PAGE_SIZE = 10;

const BASE_URL = `${window.location.origin}/api`;

const CURL_EXAMPLE = `curl -X POST ${window.location.origin}/api/messages \\
  -H "Authorization: Bearer wpp_live_••••••••••••••••••••••••••••••••••••••••" \\
  -H "Content-Type: application/json" \\
  -d '{
    "session_id": "wa_01",
    "to": "+5511987126540",
    "type": "template",
    "template": "boas_vindas_v3",
    "vars": ["Luiza", "Pro"]
  }'`;

function NewTokenModal({ onClose, onCreate }) {
  const [name, setName]     = React.useState('');
  const [scopes, setScopes] = React.useState(['send', 'read']);
  const [loading, setLoading] = React.useState(false);
  const [error, setError]   = React.useState(null);

  const ALL_SCOPES = ['send', 'read', 'webhook', 'admin'];

  const toggleScope = (s) =>
    setScopes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await tokensService.create({ name: name.trim(), scopes });
      onCreate(res.data, res.token);
    } catch (err) {
      setError(err?.error ?? 'Erro ao criar token');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head">
          <h3>Novo Token de API</h3>
          <p>O token será exibido uma única vez. Guarde-o em local seguro.</p>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Nome do token</label>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Produção · backend"/>
          </div>
          <div className="field">
            <label>Escopos</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ALL_SCOPES.map(s => (
                <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggleScope(s)}/>
                  <span className="chip mono">{s}</span>
                </label>
              ))}
            </div>
          </div>
          {error && <div style={{ color: 'var(--rose-ink)', fontSize: 13 }}>{error}</div>}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn secondary" onClick={onClose} disabled={loading}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={loading || scopes.length === 0}>
            <Ic.Plus/> {loading ? 'Criando…' : 'Criar token'}
          </button>
        </div>
      </form>
    </div>
  );
}

function EditTokenModal({ token, onClose, onSave }) {
  const [name, setName]     = React.useState(token.name);
  const [scopes, setScopes] = React.useState(token.scopes ?? []);
  const [loading, setLoading] = React.useState(false);
  const [error, setError]   = React.useState(null);

  const ALL_SCOPES = ['send', 'read', 'webhook', 'admin'];
  const toggleScope = (s) =>
    setScopes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || scopes.length === 0) return;
    setLoading(true); setError(null);
    try {
      const res = await tokensService.update(token.id, { name: name.trim(), scopes });
      onSave(res.data);
    } catch (err) {
      setError(err?.error ?? 'Erro ao atualizar token');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head">
          <h3>Editar token</h3>
          <p>Altere o nome ou os escopos deste token.</p>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Nome do token</label>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} required/>
          </div>
          <div className="field">
            <label>Escopos</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ALL_SCOPES.map(s => (
                <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggleScope(s)}/>
                  <span className="chip mono">{s}</span>
                </label>
              ))}
            </div>
            {scopes.length === 0 && <div style={{ fontSize: 12, color: 'var(--rose-ink)', marginTop: 4 }}>Selecione ao menos um escopo</div>}
          </div>
          {error && <div style={{ color: 'var(--rose-ink)', fontSize: 13, marginTop: 8 }}>{error}</div>}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn secondary" onClick={onClose} disabled={loading}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={loading || scopes.length === 0 || !name.trim()}>
            <Ic.Check/> {loading ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  );
}

function PlainTokenModal({ token, onClose }) {
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    navigator.clipboard.writeText(token).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Token criado</h3>
          <p>Copie agora — este token não será exibido novamente.</p>
        </div>
        <div className="modal-body">
          <div style={{ background: 'var(--panel-2)', border: '1px solid var(--border)', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="mono" style={{ flex: 1, fontSize: 12, wordBreak: 'break-all' }}>{token}</span>
            <button className="btn ghost" onClick={copy} style={{ flexShrink: 0 }}>
              {copied ? <Ic.Check/> : <Ic.Clipboard/>}
            </button>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn primary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

export default function ApiPage({ toast }) {
  const [tokens, setTokens]       = React.useState([]);
  const [loading, setLoading]     = React.useState(true);
  const [revealed, setRevealed]   = React.useState(new Set());
  const [menuId, setMenuId]       = React.useState(null);
  const [page, setPage]           = React.useState(1);
  const [showCurl, setShowCurl]   = React.useState(false);
  const [query, setQuery]         = React.useState('');
  const [modalOpen, setModalOpen]   = React.useState(false);
  const [plainToken, setPlainToken] = React.useState(null);
  const [editToken, setEditToken]   = React.useState(null);

  React.useEffect(() => {
    const close = () => setMenuId(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  React.useEffect(() => {
    setLoading(true);
    tokensService.list()
      .then(res => setTokens(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const toggleReveal = (id, e) => {
    e.stopPropagation();
    setRevealed(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const handleRevoke = async (id) => {
    try {
      await tokensService.remove(id);
      setTokens(l => l.filter(t => t.id !== id));
      toast?.('Token revogado');
    } catch {
      toast?.('Erro ao revogar token', 'error');
    }
    setMenuId(null);
  };

  const handleCreate = (token, plain) => {
    setTokens(l => [token, ...l]);
    setModalOpen(false);
    setPlainToken(plain);
  };

  const handleEdit = (updated) => {
    setTokens(l => l.map(t => t.id === updated.id ? updated : t));
    setEditToken(null);
    toast?.('Token atualizado');
  };

  const copyBaseUrl = () => {
    navigator.clipboard.writeText(BASE_URL).then(() => toast?.('URL copiada'));
  };

  const filtered = tokens.filter(t => !query || t.name.toLowerCase().includes(query.toLowerCase()));

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  React.useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages]);
  React.useEffect(() => { setPage(1); }, [query]);

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
  const formatLast = (d) => {
    if (!d) return 'nunca';
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'agora';
    if (mins < 60) return `há ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `há ${hrs} h`;
    return `há ${Math.floor(hrs / 24)} d`;
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">API & Tokens</h1>
          <div className="page-sub">Chaves de acesso para integração programática com a API REST.</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn secondary" onClick={() => toast?.('Abrindo documentação…')}><Ic.Doc/> Documentação</button>
          <button className="btn primary" onClick={() => setModalOpen(true)}><Ic.Plus/> Novo token</button>
        </div>
      </div>

      {/* Base URL */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--panel-2)', border: '1px solid var(--border)', marginBottom: 24 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>Base URL</span>
        <span style={{ flex: 1, fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: 'var(--accent-ink)' }}>
          {BASE_URL}
        </span>
        <button className="btn ghost" onClick={copyBaseUrl}><Ic.Clipboard/> Copiar</button>
      </div>

      {/* Métricas */}
      <div className="stats stats-3">
        {[
          { label: 'Tokens ativos', value: String(tokens.length).padStart(2,'0'), icon: 'KeyRound', cls: 'total',     delta: 'gerados'      },
          { label: 'Último uso',    value: tokens[0] ? formatLast(tokens[0].lastUsedAt) : '—', icon: 'Refresh', cls: 'connected', delta: 'atrás'        },
          { label: 'Escopos',       value: String(new Set(tokens.flatMap(t => t.scopes ?? [])).size).padStart(2,'0'), icon: 'Code', cls: 'total', delta: 'configurados' },
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
        <div className="table-toolbar" style={{ padding: 12, display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
          <div className="search" style={{ width: 280 }}>
            <Ic.Search style={{ color: 'var(--ink-4)' }}/>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar token…"/>
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--ink-3)' }}>
            {filtered.length} token{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>

        <table className="data-table">
          <thead><tr>
            <th>Nome</th>
            <th>Token</th>
            <th>Escopos</th>
            <th>Criado</th>
            <th>Último uso</th>
            <th></th>
          </tr></thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-4)' }}>
                  Carregando…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-4)' }}>
                  Nenhum token criado
                </td>
              </tr>
            )}
            {!loading && paginated.map(t => {
              const isRevealed = revealed.has(t.id);
              const tokenStr   = (t.tokenPrefix ?? 'wpp_') + (isRevealed ? '••• (revelado no momento da criação)' : '•••••••••••••••••••••••••••••');
              return (
                <tr key={t.id}>
                  <td><b>{t.name}</b></td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{tokenStr}</span>
                      <button className="kbd-btn" onClick={e => toggleReveal(t.id, e)} title={isRevealed ? 'Ocultar' : 'Info'}>
                        <Ic.Info style={{ width: 13, height: 13 }}/>
                      </button>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {(t.scopes ?? []).map(s => (
                        <span key={s} className="chip mono" style={{ fontSize: 10.5 }}>{s}</span>
                      ))}
                    </div>
                  </td>
                  <td className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{formatDate(t.createdAt)}</td>
                  <td style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>{formatLast(t.lastUsedAt)}</td>
                  <td>
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <button className="kbd-btn" onClick={e => { e.stopPropagation(); setMenuId(m => m === t.id ? null : t.id); }}><Ic.Dots/></button>
                      {menuId === t.id && (
                        <div className="dropdown" style={{ right: 0, left: 'auto', zIndex: 20 }} onClick={e => e.stopPropagation()}>
                          <button className="dropdown-item" onClick={() => { setMenuId(null); setEditToken(t); }}><Ic.Cog className="icon"/>Editar</button>
                          <div className="dropdown-sep"/>
                          <button className="dropdown-item danger" onClick={() => handleRevoke(t.id)}><Ic.Trash className="icon"/>Revogar</button>
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

      <Pagination page={page} totalPages={totalPages} total={filtered.length}
        perPage={PAGE_SIZE} label="tokens" onChange={setPage}/>

      {/* cURL example */}
      <div className="section-head" style={{ cursor: 'pointer', marginTop: 24 }} onClick={() => setShowCurl(v => !v)}>
        <h3>Exemplo de requisição — cURL</h3>
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{showCurl ? '▲ Ocultar' : '▼ Mostrar'}</span>
      </div>
      {showCurl && (
        <div className="codeblock" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5, lineHeight: 1.75, whiteSpace: 'pre', overflowX: 'auto', padding: '14px 16px' }}>
          {CURL_EXAMPLE}
        </div>
      )}

      {modalOpen && (
        <NewTokenModal onClose={() => setModalOpen(false)} onCreate={handleCreate}/>
      )}
      {plainToken && (
        <PlainTokenModal token={plainToken} onClose={() => setPlainToken(null)}/>
      )}
      {editToken && (
        <EditTokenModal token={editToken} onClose={() => setEditToken(null)} onSave={handleEdit}/>
      )}
    </>
  );
}
