import React from 'react';
import Ic from '../icons';
import { sessionsService } from '../../services/sessions';

export default function NewSessionModal({ onClose, onCreate }) {
  const [name, setName]       = React.useState('');
  const [phone, setPhone]     = React.useState('');
  const [tag, setTag]         = React.useState('atendimento');
  const [method, setMethod]   = React.useState('qr');
  const [provider, setProvider] = React.useState('wppconnect');
  const [webhook, setWebhook] = React.useState('');
  const [proxyUrl, setProxyUrl]           = React.useState('');
  const [proxyUser, setProxyUser]         = React.useState('');
  const [proxyPass, setProxyPass]         = React.useState('');
  const [showProxy, setShowProxy]         = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError]     = React.useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const proxy = proxyUrl.trim()
        ? { url: proxyUrl.trim(), username: proxyUser || undefined, password: proxyPass || undefined }
        : undefined;

      const res = await sessionsService.create({
        name:    name.trim(),
        phone:   phone || undefined,
        tag,
        provider,
        webhook: webhook.trim() || undefined,
        proxy,
      });
      onCreate(res.data);
    } catch (err) {
      setError(err?.error ?? 'Erro ao criar sessão');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head">
          <h3>Nova Sessão</h3>
          <p>Crie uma nova conexão de WhatsApp. Após a criação, escaneie o QR Code para vincular o número.</p>
        </div>

        <div className="modal-body">

          {/* Identificação */}
          <div className="field">
            <label>Nome da sessão</label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Suporte SP, Vendas, CRM…"/>
            <div className="hint">Usado para identificar a sessão nos logs e integrações.</div>
          </div>
          <div className="field">
            <label>Número (opcional)</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="+55 11 99999-9999"/>
          </div>
          <div className="field">
            <label>Fluxo</label>
            <select value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="atendimento">Atendimento</option>
              <option value="marketing">Marketing</option>
              <option value="onboarding">Onboarding</option>
              <option value="recuperacao">Recuperação</option>
              <option value="sistema">Sistema / Notificações</option>
            </select>
          </div>
          <div className="field">
            <label>Método de pareamento</label>
            <div className="sp-segmented" style={{ margin: 0 }}>
              <button type="button" className={method === 'qr' ? 'active' : ''} onClick={() => setMethod('qr')}>
                <Ic.Qr/> QR Code
              </button>
              <button type="button" className={method === 'code' ? 'active' : ''} onClick={() => setMethod('code')}>
                <Ic.KeyRound/> Código
              </button>
            </div>
          </div>

          <div className="field">
            <label>Provider</label>
            <select value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="wppconnect">WPPConnect</option>
              <option value="baileys">Baileys</option>
              <option value="whaileys">Whaileys</option>
              <option value="zapo">Zapo</option>
            </select>
            <div className="hint">Todas as sessões rodam na mesma instância interna do runtime.</div>
          </div>

          {/* Webhook */}
          <div className="field">
            <label>Webhook (opcional)</label>
            <input value={webhook} onChange={(e) => setWebhook(e.target.value)}
              placeholder="https://seu-servidor.com/webhook"/>
            <div className="hint">URL que receberá os eventos desta sessão via POST.</div>
          </div>

          {/* Proxy */}
          <div>
            <button
              type="button"
              onClick={() => setShowProxy(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ink-2)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', marginBottom: showProxy ? 10 : 0 }}>
              <Ic.ChevronRight style={{ width: 14, height: 14, transition: 'transform .15s', transform: showProxy ? 'rotate(90deg)' : 'none' }}/>
              Configurar Proxy {proxyUrl && <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 4 }}>● ativo</span>}
            </button>

            {showProxy && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 20, borderLeft: '2px solid var(--border)' }}>
                <div className="field" style={{ margin: 0 }}>
                  <label>URL do proxy</label>
                  <input value={proxyUrl} onChange={(e) => setProxyUrl(e.target.value)}
                    placeholder="http://proxy.example.com:8080"/>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Usuário</label>
                    <input value={proxyUser} onChange={(e) => setProxyUser(e.target.value)}
                      placeholder="username"/>
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Senha</label>
                    <input type="password" value={proxyPass} onChange={(e) => setProxyPass(e.target.value)}
                      placeholder="••••••••"/>
                  </div>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div style={{ color: 'var(--rose-ink)', fontSize: 13, padding: '6px 0' }}>{error}</div>
          )}
        </div>

        <div className="modal-foot">
          <button type="button" className="btn secondary" onClick={onClose} disabled={loading}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={loading}>
            <Ic.Plus/> {loading ? 'Criando…' : 'Criar sessão'}
          </button>
        </div>
      </form>
    </div>
  );
}
