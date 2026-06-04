import React from 'react';
import Ic from '../icons';

function QrArt({ variant = 0 }) {
  const size = 29;
  const cells = React.useMemo(() => {
    const rng = (i) => {
      const x = Math.sin((i + 1) * (7.31 + variant * 0.37)) * 10000;
      return (x - Math.floor(x)) > 0.5;
    };
    const arr = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const inFinder = (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);
        if (inFinder) continue;
        if (rng(y * size + x)) arr.push([x, y]);
      }
    }
    return arr;
  }, [variant]);

  const Finder = ({ x, y }) => (
    <g transform={`translate(${x} ${y})`}>
      <rect width="7" height="7" rx="1.2" fill="#111"/>
      <rect x="1" y="1" width="5" height="5" rx="0.6" fill="#fff"/>
      <rect x="2" y="2" width="3" height="3" rx="0.4" fill="#111"/>
    </g>
  );

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="200" height="200" shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff"/>
      <Finder x={0} y={0}/>
      <Finder x={size - 7} y={0}/>
      <Finder x={0} y={size - 7}/>
      {cells.map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="1" height="1" fill="#111"/>
      ))}
      <rect x={size/2 - 2.5} y={size/2 - 2.5} width="5" height="5" rx="1" fill="#fff"/>
      <rect x={size/2 - 1.5} y={size/2 - 1.5} width="3" height="3" rx="0.6" fill="var(--accent, #10b981)"/>
    </svg>
  );
}

export default function ConnectPanel({ session, mode, setMode, qrVariant, onRefresh, timer, onClose }) {
  const pairCode = React.useMemo(() => {
    const seed = (session?.id || 'x') + qrVariant;
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 8; i++) {
      h = Math.abs(h * 1103515245 + 12345) | 0;
      out += chars[Math.abs(h) % chars.length];
    }
    return out;
  }, [session?.id, qrVariant]);

  return (
    <div className="side-panel">
      <div className="sp-head">
        <div className="mark"><Ic.Link/></div>
        <div>
          <h4>Conectar WhatsApp</h4>
          <div className="session-tag">{session.name} · {session.id}</div>
        </div>
        <button className="icon-btn sp-close" onClick={onClose}><Ic.X/></button>
      </div>

      <div className="sp-segmented">
        <button className={mode === 'qr' ? 'active' : ''} onClick={() => setMode('qr')}>
          <Ic.Qr/> QR Code
        </button>
        <button className={mode === 'code' ? 'active' : ''} onClick={() => setMode('code')}>
          <Ic.KeyRound/> Código
        </button>
      </div>

      {mode === 'qr' && (
        <>
          <div className="qr-wrap">
            <div className="qr-frame qr-corners"><span/>
              <QrArt variant={qrVariant}/>
            </div>
            <div className="qr-timer">
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: timer > 10 ? 'var(--accent)' : 'var(--rose)',
              }}/>
              expira em {String(Math.floor(timer/60)).padStart(1,'0')}:{String(timer%60).padStart(2,'0')}
            </div>
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
            <button className="btn secondary block" onClick={onRefresh}>
              <Ic.Refresh/> Atualizar QR Code
            </button>
          </div>
        </>
      )}

      {mode === 'code' && (
        <>
          <div className="pair-code">
            <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
              Digite este código no seu WhatsApp
            </div>
            <div className="digits">
              {pairCode.split('').map((d, i) => (
                <div key={i} className="digit">{d}</div>
              ))}
            </div>
            <div className="qr-timer">
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }}/>
              válido por 60 segundos
            </div>
          </div>

          <div className="instructions">
            <h5>Onde inserir</h5>
            <ol>
              <li>Abra o WhatsApp no celular</li>
              <li>Toque em Aparelhos conectados → Conectar aparelho</li>
              <li>Escolha "Conectar com número de telefone"</li>
              <li>Digite o código acima</li>
            </ol>
          </div>

          <div className="sp-refresh">
            <button className="btn secondary block" onClick={onRefresh}>
              <Ic.Refresh/> Gerar novo código
            </button>
          </div>
        </>
      )}

      <div className="sp-tip">
        <Ic.Info className="icon"/>
        <div>
          <strong>Dica</strong>
          Após conectar, mensagens serão enviadas automaticamente conforme os gatilhos
          configurados no workspace.
        </div>
      </div>
    </div>
  );
}
