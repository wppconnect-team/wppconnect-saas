import React from 'react';
import Ic from '../icons';
import { NAV_MAIN, NAV_DEV, NAV_ACCT } from '../../data';

export function Sidebar({ currentNav, onNav, onLogout, open, onClose, collapsed, onToggleCollapse }) {
  const handleNav = (id) => { onNav(id); onClose?.(); };

  const Section = ({ title, items }) => (
    <>
      <div className="nav-section">{title}</div>
      {items.map(item => {
        const Icon = Ic[item.icon];
        const active = currentNav === item.id;
        return (
          <button key={item.id}
            className={"nav-item" + (active ? " active" : "")}
            title={collapsed ? item.label : undefined}
            onClick={() => handleNav(item.id)}>
            <Icon className="icon"/>
            <span>{item.label}</span>
            {item.count !== undefined && <span className="count">{item.count}</span>}
          </button>
        );
      })}
    </>
  );

  return (
    <>
      {open && <div className="sidebar-overlay" onClick={onClose}/>}
      <aside className={"sidebar" + (open ? " open" : "") + (collapsed ? " collapsed" : "")}>
        <div className="brand">
          <div className="brand-mark">Wpp</div>
          {!collapsed && (
            <div className="brand-name">
              Wppconnect
              <small>workspace</small>
            </div>
          )}
          <button className="sidebar-collapse-btn"
            onClick={onToggleCollapse}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}>
            {collapsed ? <Ic.ChevronRight style={{ width: 13, height: 13 }}/> : <Ic.ChevronLeft style={{ width: 13, height: 13 }}/>}
          </button>
        </div>

        <Section title="Principal" items={NAV_MAIN} />
        <Section title="Desenvolvedor" items={NAV_DEV} />
        <Section title="Conta" items={NAV_ACCT} />

        <div className="sidebar-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button className="user-chip" style={{ flex: 1, minWidth: 0, width: 'auto' }}
              title={collapsed ? 'Perfil' : undefined}>
              <div className="avatar">MR</div>
              <div className="info">
                <div className="name">Marcos Ribeiro</div>
                <div className="mail">marcos@Wppconnect.io</div>
              </div>
            </button>
            <button className="icon-btn" onClick={onLogout} title="Sair"
              style={{ flexShrink: 0, color: 'var(--ink-3)' }}>
              <Ic.Logout style={{ width: 15, height: 15 }}/>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

export function Topbar({ onNewSession }) {
  return (
    <div className="topbar">
      <div className="crumbs">
        <span>Workspace</span>
        <span className="sep">/</span>
        <span>Engajamento</span>
        <span className="sep">/</span>
        <span className="current">Conexões</span>
      </div>
      <div className="topbar-spacer"/>
      <div className="search">
        <Ic.Search style={{ color: 'var(--ink-4)' }}/>
        <input placeholder="Buscar sessões, contatos, logs…" />
        <span className="kbd">⌘K</span>
      </div>
      <button className="icon-btn" title="Novidades">
        <Ic.Bell/>
        <span className="dot"/>
      </button>
      <button className="icon-btn" title="Ajuda">
        <Ic.Help/>
      </button>
    </div>
  );
}
