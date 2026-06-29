import React from 'react';
import Ic from '../icons';
import { sessionsService } from '../../services/sessions';

export default function QrCodeModal({ session, initialQr, initialTimer = 60, onClose, onConnected, onAbort, onQr }) {
  const [phase, setPhase]     = React.useState(initialQr ? 'qr' : 'loading');
  const [mode, setMode]       = React.useState('qr');
  const [qrImage, setQrImage] = React.useState(initialQr ?? null);
  const [timer, setTimer]     = React.useState(initialQr ? initialTimer : 60);
  const [errorMsg, setErrorMsg] = React.useState('');
  const timerRef     = React.useRef(null);
  const requestQrRef = React.useRef(null);
  const phaseRef     = React.useRef(initialQr ? 'qr' : 'loading');
  const pollRef      = React.useRef(null);

  const handleClose = React.useCallback(() => {
    if (phaseRef.current !== 'connected') onAbort?.(session.id);
    onClose();
  }, [onClose, onAbort, session.id]);

  const startTimer = React.useCallback((from = 60) => {
    clearInterval(timerRef.current);
    setTimer(from);
    timerRef.current = setInterval(() => {
      setTimer(t => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          requestQrRef.current?.();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  }, []);

  const requestQr = React.useCallback(async () => {
    setPhase('loading');
    try {
      const start = await sessionsService.start(session.id, { waitQrCode: false });
      if (typeof start.qrcode === 'string') {
        setQrImage(start.qrcode);
        setPhase('qr');
        startTimer();
        onQr?.(session.id, start.qrcode);
      }
    } catch {
      setErrorMsg('Não foi possível conectar ao servidor WppConnect.');
      setPhase('error');
    }
  }, [session.id]);

  React.useEffect(() => { requestQrRef.current = requestQr; }, [requestQr]);
  React.useEffect(() => { phaseRef.current = phase; }, [phase]);

  React.useEffect(() => {
    const applyStatus = (data) => {
      const status = String(data?.status ?? '').toLowerCase();
      if (['connected', 'inchat', 'islogged', 'authenticated'].includes(status)) {
        clearInterval(timerRef.current);
        clearInterval(pollRef.current);
        setPhase('connected');
        onConnected?.(session.id);
        setTimeout(onClose, 2000);
      }
    };

    const refreshQr = async () => {
      try {
        const data = await sessionsService.qrcode(session.id);
        if (typeof data.qrcode === 'string') {
          setQrImage(data.qrcode);
          setPhase('qr');
          startTimer();
          onQr?.(session.id, data.qrcode);
        }
        applyStatus(data);
      } catch {
        // O container pode estar iniciando; o polling tenta novamente.
      }
    };

    if (initialQr) startTimer(initialTimer); // QR em cache — timer com tempo restante
    requestQr();
    pollRef.current = setInterval(async () => {
      try {
        const data = await sessionsService.status(session.id);
        applyStatus(data);
        if (typeof data.qrcode === 'string') {
          setQrImage(data.qrcode);
          setPhase('qr');
          startTimer();
          onQr?.(session.id, data.qrcode);
        } else {
          await refreshQr();
        }
      } catch {
        // Mantém a tentativa até o usuário fechar o modal.
      }
    }, 2000);

    return () => {
      clearInterval(pollRef.current);
      clearInterval(timerRef.current);
    };
  }, [initialQr, initialTimer, onClose, onConnected, onQr, requestQr, session.id, startTimer]);

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(1, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div onClick={e => e.stopPropagation()} className="side-panel" style={{ position: 'relative', width: 320 }}>

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
              {phase === 'loading' && (
                <div style={{ width: 200, height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--ink-3)' }}>
                  <Ic.Refresh style={{ width: 28, height: 28, animation: 'wpp-spin 1s linear infinite' }}/>
                  <span style={{ fontSize: 12.5 }}>Aguardando QR…</span>
                </div>
              )}

              {phase === 'qr' && qrImage && (
                <div className="qr-frame qr-corners">
                  <span/>
                  <img src={qrImage} alt="QR Code" style={{ width: 200, height: 200, display: 'block' }}/>
                </div>
              )}

              {phase === 'connected' && (
                <div style={{ width: 200, height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--accent)' }}>
                  <Ic.PhonePlugged style={{ width: 36, height: 36 }}/>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>Conectado!</span>
                </div>
              )}

              {phase === 'error' && (
                <div style={{ width: 200, height: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--rose, #e55)', padding: 16, textAlign: 'center' }}>
                  <Ic.X style={{ width: 28, height: 28 }}/>
                  <span style={{ fontSize: 12, lineHeight: 1.5 }}>{errorMsg}</span>
                </div>
              )}

              {phase === 'qr' && (
                <div className="qr-timer">
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: timer > 10 ? 'var(--accent)' : 'var(--rose, #e55)' }}/>
                  expira em {fmt(timer)}
                </div>
              )}
            </div>

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

            <div className="sp-refresh">
              <button className="btn secondary block" onClick={requestQr}>
                <Ic.Refresh/> Atualizar QR Code
              </button>
            </div>
          </>
        )}

        {/* ── Aba Código ── */}
        {mode === 'code' && (
          <>
            <div className="pair-code">
              <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
                Funcionalidade disponível em breve
              </div>
            </div>

            <div className="sp-refresh">
              <button className="btn secondary block" onClick={() => setMode('qr')}>
                <Ic.Qr/> Usar QR Code
              </button>
            </div>
          </>
        )}

        {/* Dica */}
        <div className="sp-tip">
          <Ic.Info className="icon"/>
          <div>
            <strong>Dica</strong>{' '}
            Após conectar, mensagens serão enviadas automaticamente conforme os gatilhos configurados no workspace.
          </div>
        </div>

      </div>
    </div>
  );
}
