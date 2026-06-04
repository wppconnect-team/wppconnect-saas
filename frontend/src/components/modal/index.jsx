import React from 'react';
import Ic from '../icons';
import { sessionsService } from '../../services/sessions';

export default function NewSessionModal({ onClose, onCreate }) {
  const [name, setName]     = React.useState('');
  const [phone, setPhone]   = React.useState('');
  const [tag, setTag]       = React.useState('atendimento');
  const [method, setMethod] = React.useState('qr');
  const [loading, setLoading] = React.useState(false);
  const [error, setError]   = React.useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await sessionsService.create({
        name: name.trim(),
        phone: phone || undefined,
        tag,
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
