import React from 'react';
import Ic from '../icons';

export function Stats({ filter, onFilter, counts }) {
  const items = [
    { id: 'all', label: 'Total', value: counts.total, icon: 'Phone', cls: 'total', delta: '+2' },
    { id: 'connected', label: 'Conectado', value: counts.connected, icon: 'Check', cls: 'connected', delta: '99.1%' },
    { id: 'pending', label: 'Pendente', value: counts.pending, icon: 'Refresh', cls: 'pending' },
    { id: 'offline', label: 'Desconectado', value: counts.offline, icon: 'X', cls: 'offline' },
  ];
  return (
    <div className="stats">
      {items.map(it => {
        const Icon = Ic[it.icon];
        return (
          <div key={it.id}
            className={"stat" + (filter === it.id ? " active" : "")}
            onClick={() => onFilter(it.id)}>
            <div className={"stat-icon " + it.cls}><Icon/></div>
            <div>
              <div className="stat-value">{String(it.value).padStart(2,'0')}</div>
              <div className="stat-label">{it.label}</div>
              {it.delta && <span className="stat-delta">↑ {it.delta}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Tabs({ tab, setTab, total }) {
  const items = [
    { id: 'sessoes', label: 'Sessões', icon: 'Phone', badge: total },
    { id: 'templates', label: 'Templates', icon: 'Doc', badge: 12 },
    { id: 'recuperacao', label: 'Recuperação', icon: 'Refresh' },
    { id: 'falhas', label: 'Falhas', icon: 'Info', badge: 3 },
  ];
  return (
    <div className="tabs-row">
      {items.map(it => {
        const Icon = Ic[it.icon];
        return (
          <button key={it.id}
            className={"tab" + (tab === it.id ? " active" : "")}
            onClick={() => setTab(it.id)}>
            <Icon/>
            {it.label}
            {it.badge !== undefined && <span className="badge">{it.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function statusPill(status) {
  const map = {
    connected: { cls: 'connected', label: 'Conectado' },
    qr: { cls: 'qr', label: 'QR Pronto' },
    pending: { cls: 'pending', label: 'Pendente' },
    offline: { cls: 'offline', label: 'Desconectado' },
  };
  const s = map[status];
  return <span className={"pill " + s.cls}><span className="dot"/>{s.label}</span>;
}

export function SessionCard({ session, selected, onSelect, onAction, menuOpen, onToggleMenu }) {
  const actions = [
    { id: 'configurar', label: 'Configurar Produtos', icon: 'Tag' },
    { id: 'status', label: 'Verificar Status', icon: 'ChartBar' },
    { id: 'qr', label: 'Ver QR Code', icon: 'Qr' },
    { id: 'copy', label: 'Copiar Token', icon: 'Clipboard' },
    { id: 'logs', label: 'Ver Logs', icon: 'List' },
    { id: 'delete', label: 'Deletar', icon: 'Trash', danger: true },
  ];
  return (
    <div className={"session " + session.status + (selected ? " selected" : "")}
         onClick={() => onSelect(session.id)}>
      <div className="session-top">
        {statusPill(session.status)}
        <div style={{ position: 'relative' }}>
          <button className="kbd-btn" onClick={(e) => { e.stopPropagation(); onToggleMenu(session.id); }}>
            <Ic.Dots/>
          </button>
          {menuOpen && (
            <div className="dropdown" onClick={(e) => e.stopPropagation()}>
              {actions.slice(0,3).map(a => {
                const Icon = Ic[a.icon];
                return (
                  <button key={a.id}
                    className={"dropdown-item" + (a.danger ? " danger" : "")}
                    onClick={() => onAction(session, a.id)}>
                    <Icon className="icon"/>{a.label}
                  </button>
                );
              })}
              <div className="dropdown-sep"/>
              {actions.slice(3,5).map(a => {
                const Icon = Ic[a.icon];
                return (
                  <button key={a.id} className="dropdown-item" onClick={() => onAction(session, a.id)}>
                    <Icon className="icon"/>{a.label}
                  </button>
                );
              })}
              <div className="dropdown-sep"/>
              <button className="dropdown-item danger" onClick={() => onAction(session, 'delete')}>
                <Ic.Trash className="icon"/>Deletar
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="session-body">
        <div className="session-phone-icon">
          {session.status === 'connected' ? <Ic.PhonePlugged/> : <Ic.Phone/>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="session-name">{session.name}</div>
          <div className="session-num mono">{session.phone}</div>
        </div>
      </div>

      <div className="session-meta">
        <div className="meta-row">
          <Ic.Folder style={{ color: 'var(--ink-4)', width: 13, height: 13 }}/>
          <span>{session.tag}</span>
        </div>
        <div className="meta-row">
          <span>Criado</span>
          <span className="mono">{session.created}</span>
        </div>
      </div>

      <div className="session-meta" style={{ borderTop: 0, paddingTop: 2, marginTop: 2 }}>
        <div className="meta-row">
          <span>Msgs</span>
          <span className="mono">{session.messagesToday.toLocaleString('pt-BR')}</span>
        </div>
        <div className="meta-row">
          <span>{session.lastActivity}</span>
        </div>
      </div>
    </div>
  );
}
