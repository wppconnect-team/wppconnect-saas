import React from 'react';
import Ic from '../components/icons';
import { statusPill } from '../components/sessions';
import { dashboardService } from '../services/dashboard';

function timeAgo(date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs} h`;
  return `há ${Math.floor(hrs / 24)} d`;
}

function SparkLine({ data, color = 'var(--accent)' }) {
  const w = 120, h = 36, max = Math.max(...data), min = Math.min(...data);
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / (max - min || 1)) * h;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline fill="none" stroke={color} strokeWidth="1.75" points={points}/>
      <polyline fill={color} fillOpacity="0.08" stroke="none"
        points={`0,${h} ${points} ${w},${h}`}/>
    </svg>
  );
}

function BarChart() {
  const days = ['Qua', 'Qui', 'Sex', 'Sáb', 'Dom', 'Seg', 'Ter'];
  const data = [12400, 14800, 16200, 8400, 6800, 18900, 19600];
  const max = Math.max(...data);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 220, padding: '10px 0' }}>
      {days.map((day, i) => {
        const v = data[i];
        const pct = (v / max) * 100;
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 6 }}>
              {(v/1000).toFixed(1)}k
            </div>
            <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
              <div style={{
                width: '100%', maxWidth: 56,
                height: `${pct}%`,
                background: i === 5 ? 'var(--accent)' : 'var(--accent-soft)',
                border: '1px solid ' + (i === 5 ? 'var(--accent)' : 'var(--accent-border)'),
                borderRadius: '6px 6px 0 0',
              }}/>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 500, marginTop: 8 }}>{day}</div>
          </div>
        );
      })}
    </div>
  );
}

const LOG_ICON = { ok: 'Check', info: 'Info', warn: 'Webhook', error: 'Info' };
const LOG_TYPE = { ok: 'enviado', info: 'novo', warn: 'webhook', error: 'erro' };

export default function DashboardPage({ toast }) {
  const [data, setData] = React.useState(null);

  React.useEffect(() => {
    dashboardService.get()
      .then(setData)
      .catch(console.error);
  }, []);

  const sessionStats  = data?.sessions  ?? { messagesToday: 0, connected: 0, total: 0 };
  const webhookStats  = data?.webhooks  ?? { avgDelivery: 0 };
  const topSessions   = data?.topSessions  ?? [];
  const recentLogs    = data?.recentLogs   ?? [];

  const kpis = [
    {
      label: 'Mensagens hoje',
      value: Number(sessionStats.messagesToday).toLocaleString('pt-BR'),
      delta: 'hoje',
      spark: [30,42,38,55,60,58,72,80,75,88],
    },
    {
      label: 'Taxa de entrega',
      value: Number(webhookStats.avgDelivery).toFixed(1) + '%',
      delta: 'média webhooks',
      spark: [96,97,97,98,98,98,99,99,98,99],
    },
    {
      label: 'Sessões ativas',
      value: `${sessionStats.connected}/${sessionStats.total}`,
      delta: 'conectadas',
      spark: [2,2,3,3,2,2,2,2,2,2],
    },
    {
      label: 'Tempo médio resp.',
      value: '1m 42s',
      delta: '-8s',
      spark: [120,110,108,100,95,98,92,90,102,102],
    },
  ];

  const events = recentLogs.map(log => ({
    when: timeAgo(log.createdAt),
    type: LOG_TYPE[log.level] ?? 'enviado',
    what: log.message,
    icon: LOG_ICON[log.level] ?? 'Info',
  }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <div className="page-sub">Visão geral do workspace. Últimas 24 horas.</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <select className="btn secondary" style={{ appearance: 'auto' }}>
            <option>Últimas 24h</option><option>7 dias</option><option>30 dias</option>
          </select>
          <button className="btn primary"><Ic.Download/> Relatório</button>
        </div>
      </div>

      <div className="stats" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {kpis.map(k => (
          <div className="stat" key={k.label} style={{ cursor: 'default' }}>
            <div style={{ flex: 1 }}>
              <div className="stat-label" style={{ marginTop: 0 }}>{k.label}</div>
              <div className="stat-value" style={{ marginTop: 4 }}>{k.value}</div>
              <span className="stat-delta">{k.delta}</span>
            </div>
            <SparkLine data={k.spark}/>
          </div>
        ))}
      </div>

      <div className="content-grid" style={{ gridTemplateColumns: '1fr 320px' }}>
        <div>
          <div className="section-head">
            <h3>Volume de mensagens · últimos 7 dias</h3>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn ghost" style={{ fontSize: 12 }}>Enviadas</button>
              <button className="btn secondary" style={{ fontSize: 12 }}>Recebidas</button>
            </div>
          </div>
          <div className="card-panel">
            <BarChart/>
          </div>

          <div className="section-head" style={{ marginTop: 20 }}>
            <h3>Sessões com mais tráfego</h3>
          </div>
          <div className="card-panel">
            <table className="data-table">
              <thead><tr>
                <th>Sessão</th><th>Status</th><th style={{textAlign:'right'}}>Hoje</th>
                <th style={{textAlign:'right'}}>7d</th><th style={{textAlign:'right'}}>Entrega</th>
              </tr></thead>
              <tbody>
                {topSessions.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: 'var(--ink-4)' }}>
                      Sem dados
                    </td>
                  </tr>
                )}
                {topSessions.map((s, i) => (
                  <tr key={s.id}>
                    <td><b>{s.name}</b><div className="mono" style={{fontSize:11,color:'var(--ink-3)'}}>{s.phone}</div></td>
                    <td>{statusPill(s.status)}</td>
                    <td className="mono" style={{textAlign:'right'}}>{Number(s.messagesToday).toLocaleString('pt-BR')}</td>
                    <td className="mono" style={{textAlign:'right'}}>{(Number(s.messagesToday) * 6 + i * 800).toLocaleString('pt-BR')}</td>
                    <td className="mono" style={{textAlign:'right', color:'var(--accent-ink)'}}>{(97.2 + i * 0.3).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="section-head"><h3>Atividade recente</h3></div>
          <div className="card-panel" style={{ padding: 0 }}>
            <ul className="event-list">
              {events.length === 0 && (
                <li style={{ padding: '20px 16px', color: 'var(--ink-4)', fontSize: 13 }}>Sem atividade recente</li>
              )}
              {events.map((e, i) => {
                const Icon = Ic[e.icon];
                return (
                  <li key={i}>
                    <div className={"event-icon " + e.type}><Icon/></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, lineHeight: 1.35 }}>{e.what}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 3 }}>{e.when}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
