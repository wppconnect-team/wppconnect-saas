import React from 'react';
import { io } from 'socket.io-client';
import Ic from '../icons';

const WPP_SERVER = import.meta.env.VITE_WPP_SERVER ?? 'http://localhost:21465/api';
const WPP_SOCKET = import.meta.env.VITE_WPP_SOCKET ?? 'http://localhost:21465';

export default function QrCodeModal({ session, initialQr, initialTimer = 60, onClose, onConnected, onAbort, onQr }) {
  const [phase, setPhase]     = React.useState(initialQr ? 'qr' : 'loading');
  const [mode, setMode]       = React.useState('qr');
  const [qrImage, setQrImage] = React.useState(initialQr ?? null);
  const [timer, setTimer]     = React.useState(initialQr ? initialTimer : 60);
  const [errorMsg, setErrorMsg] = React.useState('');
  const socketRef    = React.useRef(null);
  const timerRef     = React.useRef(null);
  const headersRef   = React.useRef({});
  const requestQrRef = React.useRef(null);
  const phaseRef     = React.useRef(initialQr ? 'qr' : 'loading');

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
      await fetch(`${WPP_SERVER}/${session.id}/start-session`, {
        method: 'POST',
        headers: { ...headersRef.current, 'Content-Type': 'application/json' },
      });
    } catch {
      setErrorMsg('Não foi possível conectar ao servidor WppConnect.');
      setPhase('error');
    }
  }, [session.id]);

  React.useEffect(() => { requestQrRef.current = requestQr; }, [requestQr]);
  React.useEffect(() => { phaseRef.current = phase; }, [phase]);

  React.useEffect(() => {
    const token = session.wppToken || session.id;
    headersRef.current = { Authorization: `Bearer ${token}` };

    const socket = io(WPP_SOCKET, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.off('qrCode').on('qrCode', (data) => {
      if (data.session === session.id) {
        setQrImage(data.data);
        setPhase('qr');
        startTimer();
        onQr?.(session.id, data.data);
      }
    });

    socket.off('session-logged').on('session-logged', (status) => {
      if (status.session === session.id) {
        clearInterval(timerRef.current);
        localStorage.setItem('@WPPConnect-Token', JSON.stringify({
          session: session.id,
          token:   token,
        }));
        setPhase('connected');
        onConnected?.(session.id);
        setTimeout(onClose, 2000);
      }
    });

    const init = async () => {
      try {
        const res  = await fetch(`${WPP_SERVER}/${session.id}/check-connection-session`, { headers: headersRef.current });
        const data = await res.json();
        if (data.status) {
          clearInterval(timerRef.current);
          setPhase('connected');
          onConnected?.(session.id);
          setTimeout(onClose, 2000);
        } else {
          await fetch(`${WPP_SERVER}/${session.id}/start-session`, {
            method: 'POST',
            headers: { ...headersRef.current, 'Content-Type': 'application/json' },
          });
        }
      } catch {
        setErrorMsg('Não foi possível conectar ao servidor WppConnect. Verifique se ele está em execução.');
        setPhase('error');
      }
    };

    if (initialQr) startTimer(initialTimer); // QR em cache — timer com tempo restante
    init();

    return () => {
      socket.disconnect();
      clearInterval(timerRef.current);
    };
  }, [session.id]);

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
