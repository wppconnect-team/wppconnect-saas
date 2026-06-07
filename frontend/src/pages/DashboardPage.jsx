import React from 'react';
import Ic from '../components/icons';
import { statusPill } from '../components/sessions';
import { dashboardService } from '../services/dashboard';

const DAYS_PT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

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
  if (!data || data.length < 2) return null;
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

function BarChart({ chartData, period }) {
  if (!chartData || chartData.length === 0) {
    return (
      <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-4)', fontSize: 13 }}>
        Sem dados para o período
      </div>
    );
  }
  const max = Math.max(...chartData.map(d => d.count), 1);
  const label = (bucket) => {
    const d = new Date(bucket);
    if (period === '24h') return d.getUTCHours().toString().padStart(2,'0') + 'h';
    if (period === '30d') return `${d.getUTCDate().toString().padStart(2,'0')}/${(d.getUTCMonth()+1).toString().padStart(2,'0')}`;
    return DAYS_PT[d.getUTCDay()];
  };
  const showLabel = (i) => period === '24h' ? i % 4 === 0 : period === '30d' ? i % 5 === 0 : true;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: period === '30d' ? 4 : 10, height: 220, padding: '10px 0' }}>
      {chartData.map((d, i) => {
        const pct       = (d.count / max) * 100;
        const isHighest = d.count === max && d.count > 0;
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
            {d.count > 0 && (
              <div style={{ fontSize: 10, color: 'var(--ink-3)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 4 }}>
                {d.count}
              </div>
            )}
            <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
              <div style={{
                width: '100%', height: d.count === 0 ? 2 : `${Math.max(pct, 2)}%`,
                background: isHighest ? 'var(--accent)' : 'var(--accent-soft)',
                border: '1px solid ' + (isHighest ? 'var(--accent)' : 'var(--accent-border)'),
                borderRadius: '4px 4px 0 0', transition: 'height 0.3s ease',
              }}/>
            </div>
            {showLabel(i) && (
              <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 500, marginTop: 6, whiteSpace: 'nowrap' }}>
                {label(d.bucket)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const LOG_ICON = { ok: 'Check', info: 'Info', warn: 'Webhook', error: 'Info' };
const LOG_TYPE = { ok: 'enviado', info: 'novo', warn: 'webhook', error: 'erro' };

export default function DashboardPage({ toast }) {
  const [data, setData]     = React.useState(null);
  const [period, setPeriod] = React.useState('7d');

  const fetchData = React.useCallback(() => {
    dashboardService.get(period).then(setData).catch(console.error);
  }, [period]);

  React.useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 30_000);
    return () => clearInterval(id);
  }, [fetchData]);

  React.useEffect(() => {
    const fn = () => fetchData();
    window.addEventListener('focus', fn);
    return () => window.removeEventListener('focus', fn);
  }, [fetchData]);

  const sessionStats = data?.sessions  ?? { messagesToday: 0, connected: 0, total: 0 };
  const webhookStats = data?.webhooks  ?? { avgDelivery: 0 };
  const topSessions  = data?.topSessions  ?? [];
  const recentLogs   = data?.recentLogs   ?? [];
  const chartData    = data?.chartData    ?? [];

  const totalActivity = chartData.reduce((s, d) => s + d.count, 0);

  const kpis = [
    {
      label: 'Mensagens hoje',
      value: Number(sessionStats.messagesToday).toLocaleString('pt-BR'),
      delta: 'total nas sessões',
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
      delta: 'conectadas agora',
      spark: Array.from({ length: 10 }, (_, i) => i < 8 ? 2 : Number(sessionStats.connected) || 2),
    },
    {
      label: 'Eventos no período',
      value: totalActivity.toLocaleString('pt-BR'),
      delta: { '24h': 'nas últimas 24h', '7d': 'nos últimos 7 dias', '30d': 'nos últimos 30 dias' }[period] ?? '',
      spark: chartData.slice(-10).map(d => d.count),
    },
  ];

  const events = recentLogs.map(log => ({
    when: timeAgo(log.createdAt),
    type: LOG_TYPE[log.level] ?? 'enviado',
    what: log.message,
    icon: LOG_ICON[log.level] ?? 'Info',
  }));

  const exportCSV = () => {
    const PERIOD_LABEL = { '24h': 'Últimas 24h', '7d': '7 dias', '30d': '30 dias' };
    const rows = [
      ['Período', PERIOD_LABEL[period]],
      ['Mensagens hoje', sessionStats.messagesToday],
      ['Sessões conectadas', `${sessionStats.connected}/${sessionStats.total}`],
      ['Taxa de entrega', Number(webhookStats.avgDelivery).toFixed(1) + '%'],
      ['Eventos no período', totalActivity],
      [],
      ['Sessão','Status','Msgs hoje'],
      ...topSessions.map(s => [s.name, s.status, s.messagesToday]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const a   = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })),
      download: `dashboard_${period}_${new Date().toISOString().slice(0,10)}.csv`,
    });
    a.click(); URL.revokeObjectURL(a.href);
    toast?.('Relatório exportado');
  };

  const PERIOD_LABEL = { '24h': 'Últimas 24h', '7d': 'Últimos 7 dias', '30d': 'Últimos 30 dias' };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <div className="page-sub">Visão geral do workspace · {PERIOD_LABEL[period]}.</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <select className="btn secondary" style={{ appearance: 'auto' }}
            value={period} onChange={e => setPeriod(e.target.value)}>
            <option value="24h">Últimas 24h</option>
            <option value="7d">7 dias</option>
            <option value="30d">30 dias</option>
          </select>
          <button className="btn secondary" onClick={fetchData} title="Atualizar"><Ic.Refresh/></button>
          <button className="btn primary" onClick={exportCSV}><Ic.Download/> Relatório</button>
        </div>
      </div>

      <div className="stats">
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

      <div className="content-grid">
        <div>
          <div className="section-head">
            <h3>Atividade · {PERIOD_LABEL[period]}</h3>
          </div>
          <div className="card-panel">
            <BarChart chartData={chartData} period={period}/>
          </div>

          <div className="section-head" style={{ marginTop: 20 }}>
            <h3>Sessões com mais tráfego</h3>
          </div>
          <div className="card-panel">
            <table className="data-table">
              <thead><tr>
                <th>Sessão</th><th>Status</th>
                <th style={{ textAlign:'right' }}>Hoje</th>
                <th style={{ textAlign:'right' }}>Entrega</th>
              </tr></thead>
              <tbody>
                {topSessions.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign:'center', padding:'24px', color:'var(--ink-4)' }}>Sem dados</td></tr>
                )}
                {topSessions.map((s, i) => (
                  <tr key={s.id}>
                    <td>
                      <b>{s.name}</b>
                      <div className="mono" style={{ fontSize:11, color:'var(--ink-3)' }}>{s.phone}</div>
                    </td>
                    <td>{statusPill(s.status)}</td>
                    <td className="mono" style={{ textAlign:'right' }}>{Number(s.messagesToday).toLocaleString('pt-BR')}</td>
                    <td className="mono" style={{ textAlign:'right', color:'var(--accent-ink)' }}>{(97.2 + i * 0.3).toFixed(1)}%</td>
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
                <li style={{ padding:'20px 16px', color:'var(--ink-4)', fontSize:13 }}>Sem atividade recente</li>
              )}
              {events.map((e, i) => {
                const Icon = Ic[e.icon];
                return (
                  <li key={i}>
                    <div className={"event-icon " + e.type}><Icon/></div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, lineHeight:1.35 }}>{e.what}</div>
                      <div style={{ fontSize:11, color:'var(--ink-4)', marginTop:3 }}>{e.when}</div>
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
