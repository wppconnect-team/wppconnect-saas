import React from 'react';
import Ic from '../icons';
import { sessionsService } from '../../services/sessions';

// Calcula estado inicial do QR a partir dos dados do banco
function getInitQr(session) {
  if (session.status === 'connected') return { phase: 'connected', image: null, timer: 60 };
  if (session.qrImage && session.qrExpiresAt) {
    const secs = Math.round((new Date(session.qrExpiresAt) - Date.now()) / 1000);
    if (secs > 5) return { phase: 'qr', image: session.qrImage, timer: secs };
  }
  return { phase: 'select', image: null, timer: 60 };
}

export default function ConnectPanel({ session, onClose, onConnected, onAbort }) {
  const [mode, setMode] = React.useState('qr');

  /* ── QR state — inicializado a partir do banco ── */
  const [qrInit]                    = React.useState(() => getInitQr(session));
  const [qrPhase, setQrPhase]       = React.useState(qrInit.phase);
  const [qrImage, setQrImage]       = React.useState(qrInit.image);
  const [qrTimer, setQrTimer]       = React.useState(qrInit.timer);

  /* ── Code state ── */
  const [codePhase, setCodePhase]   = React.useState('idle');
  const [phone, setPhone]           = React.useState(() => (session.phone ?? '').replace(/\D/g, ''));
  const [pairCode, setPairCode]     = React.useState('');
  const [codeTimer, setCodeTimer]   = React.useState(60);
  const [codeError, setCodeError]   = React.useState('');

  /* ── Shared ── */
  const [errorMsg, setErrorMsg]     = React.useState('');

  const qrTimerRef   = React.useRef(null);
  const codeTimerRef = React.useRef(null);
  const phaseRef     = React.useRef(qrPhase);
  const requestQrRef = React.useRef(null);
  const startPollingRef = React.useRef(null);
  const pollRef      = React.useRef(null);

  React.useEffect(() => { phaseRef.current = qrPhase; }, [qrPhase]);

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(1, '0')}:${String(s % 60).padStart(2, '0')}`;

  /* ── QR Timer ── */
  const startQrTimer = React.useCallback((from = 60) => {
    clearInterval(qrTimerRef.current);
    setQrTimer(from);
    qrTimerRef.current = setInterval(() => {
      setQrTimer(t => {
        if (t <= 1) { clearInterval(qrTimerRef.current); requestQrRef.current?.(); return 0; }
        return t - 1;
      });
    }, 1000);
  }, []);

  /* ── Code Timer ── */
  const startCodeTimer = React.useCallback((from = 60) => {
    clearInterval(codeTimerRef.current);
    setCodeTimer(from);
    codeTimerRef.current = setInterval(() => {
      setCodeTimer(t => {
        if (t <= 1) { clearInterval(codeTimerRef.current); setCodePhase('idle'); return 0; }
        return t - 1;
      });
    }, 1000);
  }, []);

  /* ── Request QR ── */
  const requestQr = React.useCallback(async () => {
    setQrPhase('loading');
    try {
      const start = await sessionsService.start(session.id, { waitQrCode: false });
      if (typeof start.qrcode === 'string') {
        setQrImage(start.qrcode);
        setQrPhase('qr');
        startQrTimer();
      }
      startPollingRef.current?.();
    } catch {
      setErrorMsg('Não foi possível iniciar sessão no servidor WppConnect.');
      setQrPhase('error');
    }
  }, [session.id, startQrTimer]);

  React.useEffect(() => { requestQrRef.current = requestQr; }, [requestQr]);

  /* ── Se já há QR válido no banco, inicia o timer imediatamente ── */
  React.useEffect(() => {
    if (qrInit.phase === 'qr') startQrTimer(qrInit.timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Request Pairing Code ── */
  const requestCode = async () => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 10) { setCodeError('Informe o número com DDI e DDD (ex: 5521999999999)'); return; }
    setCodeError('');
    setCodePhase('loading');
    try {
      const data = await sessionsService.start(session.id, { phone: cleaned, waitQrCode: true });

      if (data.status === 'phoneCode' && data.phoneCode) {
        const raw = (data.phoneCode ?? '').replace('-', '');
        setPairCode(raw.toUpperCase());
        setCodePhase('code');
        startCodeTimer();
      }
    } catch (err) {
      setCodeError('Não foi possível solicitar o código. Verifique o servidor WppConnect.');
      setCodePhase('idle');
    }
  };

  const applyStatus = React.useCallback((data) => {
    const status = String(data?.status ?? '').toLowerCase();
    if (['connected', 'inchat', 'islogged', 'authenticated'].includes(status)) {
      clearInterval(qrTimerRef.current);
      clearInterval(codeTimerRef.current);
      clearInterval(pollRef.current);
      setQrPhase('connected');
      setCodePhase('connected');
      onConnected?.(session.id);
    }
  }, [onConnected, session.id]);

  const refreshQr = React.useCallback(async () => {
    try {
      const data = await sessionsService.qrcode(session.id);
      if (typeof data.qrcode === 'string') {
        setQrImage(data.qrcode);
        setQrPhase('qr');
        startQrTimer();
        await sessionsService.update(session.id, {
          status: 'qr',
          qr_image: data.qrcode,
          qr_expires_at: new Date(Date.now() + 60_000).toISOString(),
        }).catch(() => {});
      }
      applyStatus(data);
    } catch {
      // A sessão pode ainda estar inicializando; o polling de status continua.
    }
  }, [applyStatus, session.id, startQrTimer]);

  const startPolling = React.useCallback(() => {
    clearInterval(pollRef.current);
    let qrAttempts = 0;
    pollRef.current = setInterval(async () => {
      try {
        const data = await sessionsService.status(session.id);
        applyStatus(data);
        const status = String(data?.status ?? '').toLowerCase();
        if (typeof data?.qrcode === 'string') {
          setQrImage(data.qrcode);
          setQrPhase('qr');
          startQrTimer();
        } else if (status !== 'connected' && qrAttempts < 30) {
          qrAttempts += 1;
          await refreshQr();
        }
      } catch {
        // Mantém o polling; falhas curtas podem ocorrer enquanto o container sobe.
      }
    }, 2000);
  }, [applyStatus, refreshQr, session.id, startQrTimer]);

  React.useEffect(() => { startPollingRef.current = startPolling; }, [startPolling]);

  /* ── Status polling + init ── */
  React.useEffect(() => {
    if (session.status === 'connected') return;

    const init = async () => {
      await refreshQr();
      startPolling();
    };

    init();

    return () => {
      clearInterval(pollRef.current);
      clearInterval(qrTimerRef.current);
      clearInterval(codeTimerRef.current);
    };
  }, [refreshQr, session.id, session.status, startPolling]);

  const handleClose = () => {
    // Não chama onAbort automaticamente — o usuário está apenas fechando o painel,
    // não desistindo da conexão. O QR permanece válido no banco.
    onClose();
  };

  /* ── Renderiza dígitos do pairing code ── */
  const renderDigits = (code) => {
    const chars = code.replace('-', '').split('');
    return (
      <div className="pair-digits">
        <div className="pair-group">
          {chars.slice(0, 4).map((c, i) => <div key={i} className="digit">{c}</div>)}
        </div>
        <span className="pair-sep">–</span>
        <div className="pair-group">
          {chars.slice(4, 8).map((c, i) => <div key={i+4} className="digit">{c}</div>)}
        </div>
      </div>
    );
  };

  return (
    <div className="side-panel">
      {/* Cabeçalho */}
      <div className="sp-head">
        <div className="mark"><Ic.Link/></div>
        <div>
          <h4>Conectar WhatsApp</h4>
          <div className="session-tag">{session.name} · {session.id}</div>
        </div>
        <button className="icon-btn sp-close" onClick={handleClose}><Ic.X/></button>
      </div>

      {/* Tabs */}
      <div className="sp-segmented">
        <button className={mode === 'qr'   ? 'active' : ''} onClick={() => setMode('qr')}>
          <Ic.Qr/> QR Code
        </button>
        <button className={mode === 'code' ? 'active' : ''} onClick={() => setMode('code')}>
          <Ic.KeyRound/> Código
        </button>
      </div>

      {/* ── Aba QR Code ── */}
      {mode === 'qr' && (
        <>
          <div className="qr-wrap">
            {qrPhase === 'select' && (
              <div style={{ width: 200, height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center' }}>
                <Ic.Qr style={{ width: 44, height: 44, color: 'var(--ink-4)', opacity: 0.5 }}/>
                <span style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>
                  Clique em gerar para<br/>criar o QR Code
                </span>
              </div>
            )}
            {qrPhase === 'loading' && (
              <div style={{ width: 200, height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--ink-3)' }}>
                <Ic.Refresh style={{ width: 28, height: 28, animation: 'wpp-spin 1s linear infinite' }}/>
                <span style={{ fontSize: 12.5 }}>Aguardando QR…</span>
              </div>
            )}
            {qrPhase === 'qr' && qrImage && (
              <div className="qr-frame qr-corners">
                <span/>
                <img src={qrImage} alt="QR Code" style={{ width: 200, height: 200, display: 'block' }}/>
              </div>
            )}
            {qrPhase === 'connected' && (
              <div style={{ width: 200, height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--accent)' }}>
                <Ic.PhonePlugged style={{ width: 36, height: 36 }}/>
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>Conectado!</span>
              </div>
            )}
            {qrPhase === 'error' && (
              <div style={{ width: 200, height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, textAlign: 'center', color: 'var(--rose, #e55)' }}>
                <Ic.X style={{ width: 28, height: 28 }}/>
                <span style={{ fontSize: 12, lineHeight: 1.5 }}>{errorMsg}</span>
              </div>
            )}
            {qrPhase === 'qr' && (
              <div className="qr-timer">
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: qrTimer > 10 ? 'var(--accent)' : 'var(--rose, #e55)' }}/>
                expira em {fmt(qrTimer)}
              </div>
            )}
          </div>

          {qrPhase !== 'select' && qrPhase !== 'connected' && (
            <div className="instructions">
              <h5>Escaneie com o WhatsApp</h5>
              <ol>
                <li>Abra o WhatsApp no seu celular</li>
                <li>Toque em Configurações ou menu ⋮</li>
                <li>Selecione Aparelhos conectados</li>
                <li>Toque em Conectar aparelho</li>
                <li>Aponte a câmera para esta tela</li>
              </ol>
            </div>
          )}

          {qrPhase !== 'connected' && (
            <div className="sp-refresh">
              {qrPhase === 'select'
                ? <button className="btn primary block" onClick={requestQr}>
                    <Ic.Qr/> Gerar QR Code
                  </button>
                : <button className="btn secondary block" onClick={requestQr}
                    disabled={qrPhase === 'loading'}>
                    <Ic.Refresh/> {qrPhase === 'loading' ? 'Aguardando…' : 'Atualizar QR Code'}
                  </button>
              }
            </div>
          )}
        </>
      )}

      {/* ── Aba Código ── */}
      {mode === 'code' && (
        <>
          {(codePhase === 'idle' || codePhase === 'loading') && (
            <div style={{ padding: '16px 16px 0' }}>
              <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 12, lineHeight: 1.5 }}>
                Informe o número do WhatsApp para receber um código de pareamento.
              </div>
              <div className="field" style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-3)', display: 'block', marginBottom: 4 }}>
                  Número (com DDI)
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="5521999999999"
                  disabled={codePhase === 'loading'}
                  onKeyDown={e => e.key === 'Enter' && requestCode()}
                  style={{ width: '100%' }}
                />
              </div>
              {codeError && (
                <div style={{ fontSize: 12, color: 'var(--rose, #e55)', marginBottom: 8 }}>{codeError}</div>
              )}
              <button className="btn primary block" onClick={requestCode} disabled={codePhase === 'loading' || !phone.trim()}>
                {codePhase === 'loading'
                  ? <><Ic.Refresh style={{ animation: 'wpp-spin 1s linear infinite' }}/> Aguardando código…</>
                  : <><Ic.KeyRound/> Solicitar código</>}
              </button>
            </div>
          )}

          {codePhase === 'code' && (
            <div className="pair-code">
              <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 4 }}>
                Digite este código no WhatsApp
              </div>
              {renderDigits(pairCode)}
              <div className="qr-timer">
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: codeTimer > 15 ? 'var(--accent)' : 'var(--rose, #e55)' }}/>
                expira em {fmt(codeTimer)}
              </div>
              <button className="btn ghost" style={{ marginTop: 12, width: '100%', fontSize: 12.5 }}
                onClick={() => { setCodePhase('idle'); clearInterval(codeTimerRef.current); }}>
                Usar outro número
              </button>
            </div>
          )}

          {codePhase === 'connected' && (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--accent)' }}>
              <Ic.PhonePlugged style={{ width: 36, height: 36, margin: '20px auto 10px' }}/>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>Conectado!</div>
            </div>
          )}

          {codePhase !== 'connected' && (
            <div className="instructions" style={{ marginTop: codePhase === 'idle' || codePhase === 'loading' ? 16 : 0 }}>
              <h5>Onde digitar o código</h5>
              <ol>
                <li>Abra o WhatsApp no celular</li>
                <li>Toque em Aparelhos conectados → Conectar aparelho</li>
                <li>Escolha "Conectar com número de telefone"</li>
                <li>Digite o código exibido acima</li>
              </ol>
            </div>
          )}
        </>
      )}

      <div className="sp-tip">
        <Ic.Info className="icon"/>
        <div>
          <strong>Dica</strong>{' '}
          Após conectar, mensagens serão enviadas automaticamente conforme os gatilhos configurados no workspace.
        </div>
      </div>
    </div>
  );
}
