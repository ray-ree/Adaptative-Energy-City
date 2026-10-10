/**
 * EnergyMonitoringPage — Live charts and metrics for all buildings.
 * Uses actual simStore data, no invented values.
 */
import React from 'react';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';
import { useSimStore } from '../../store/simStore';

const COLORS = {
  demand:   '#d97706',
  solar:    '#2563eb',
  grid:     '#16a34a',
  cost:     '#7c3aed',
  capacity: '#dc2626',
};

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #e4e1db', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 4, color: '#374151' }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color }}>
          {p.name}: <strong>{p.value}</strong>
        </div>
      ))}
    </div>
  );
}

export default function EnergyMonitoringPage() {
  const slots          = useSimStore((s: any) => s.slots);
  const currentSlot   = useSimStore((s: any) => s.currentSlot);
  const gridCapacityKW = useSimStore((s: any) => s.gridCapacityKW);
  const buildings      = useSimStore((s: any) => s.buildings);
  const current        = slots[currentSlot];

  const demandData = slots.filter((_, i) => i % 4 === 0).map(s => ({
    time: s.label,
    Demand: s.totalDemandKW,
    Solar: s.solarGenKW,
    Capacity: gridCapacityKW,
  }));

  const importData = slots.filter((_, i) => i % 4 === 0).map(s => ({
    time: s.label,
    'Grid Import': s.gridImportKW,
    Solar: s.solarGenKW,
  }));

  const costData = slots.filter((_, i) => i % 4 === 0).map(s => ({
    time: s.label,
    Cost: parseFloat((s.costRs).toFixed(1)),
  }));

  const totalSolar    = current?.solarGenKW ?? 0;
  const totalDemand   = current?.totalDemandKW ?? 0;
  const gridImport    = current?.gridImportKW ?? 0;
  const price         = current?.priceRsPerKWh ?? 0;
  const slotCost      = current?.costRs ?? 0;
  const utilisation   = gridCapacityKW > 0 ? Math.min(100, Math.round((gridImport / gridCapacityKW) * 100)) : 0;

  return (
    <div className="page-content">
      <div className="page-header">
        <h2 className="page-title">📊 Energy Monitoring</h2>
        <p className="page-desc">Real-time electricity demand, solar generation, grid import and cost across all buildings.</p>
      </div>

      {/* KPI row */}
      <div className="kpi-row">
        {[
          { icon: '⚡', label: 'Total Demand',   value: `${totalDemand} kW`,        color: COLORS.demand },
          { icon: '☀️', label: 'Solar Gen.',     value: `${totalSolar} kW`,         color: COLORS.solar },
          { icon: '🔌', label: 'Grid Import',    value: `${gridImport} kW`,         color: gridImport > gridCapacityKW ? '#dc2626' : COLORS.grid },
          { icon: '🏗️', label: 'Grid Capacity', value: `${gridCapacityKW} kW`,     color: '#6b7280' },
          { icon: '💰', label: 'Price',          value: `₹${price}/kWh`,            color: COLORS.cost },
          { icon: '📋', label: 'Slot Cost',      value: `₹${slotCost}`,            color: '#16a34a' },
          { icon: '📈', label: 'Utilisation',    value: `${utilisation}%`,          color: utilisation > 90 ? '#dc2626' : '#6b7280' },
        ].map(k => (
          <div key={k.label} className="kpi-card">
            <div className="kpi-icon">{k.icon}</div>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-card-title">⚡ Demand vs Capacity (kW)</div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={demandData}>
              <defs>
                <linearGradient id="gDemand" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={COLORS.demand} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={COLORS.demand} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gSolar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={COLORS.solar} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={COLORS.solar} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e1db" />
              <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 9 }} interval={3} />
              <YAxis tick={{ fill: '#64748b', fontSize: 9 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={gridCapacityKW} stroke="#dc2626" strokeDasharray="4 3" label={{ value: 'Limit', fill: '#dc2626', fontSize: 9 }} />
              <ReferenceLine x={slots[currentSlot]?.label} stroke="#6b7280" strokeDasharray="3 2" />
              <Area type="monotone" dataKey="Demand" stroke={COLORS.demand} fill="url(#gDemand)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="Solar"  stroke={COLORS.solar}  fill="url(#gSolar)"  strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <div className="chart-card-title">☀️ Solar vs Grid Import (kW)</div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={importData}>
              <defs>
                <linearGradient id="gImport" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={COLORS.grid} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={COLORS.grid} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e1db" />
              <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 9 }} interval={3} />
              <YAxis tick={{ fill: '#64748b', fontSize: 9 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="Grid Import" stroke={COLORS.grid}  fill="url(#gImport)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Solar"        stroke={COLORS.solar} strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <div className="chart-card-title">💰 Cost per 15-min Slot (₹)</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={costData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e1db" />
              <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 9 }} interval={3} />
              <YAxis tick={{ fill: '#64748b', fontSize: 9 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="Cost" fill={COLORS.cost} radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Building table */}
      <div className="table-card">
        <div className="table-card-title">🏢 Per-Building Status</div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Building</th><th>Type</th><th>Demand (kW)</th>
              <th>Solar (kW)</th><th>Grid Cap. (kW)</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {buildings.map(b => (
              <tr key={b.id}>
                <td style={{ fontWeight: 600 }}>{b.name}</td>
                <td style={{ textTransform: 'capitalize' }}>{b.type.replace('_', ' ')}</td>
                <td>{b.baseDemandKW + b.devices.filter(d => d.status === 'running').reduce((a,d) => a+d.powerKW, 0)}</td>
                <td>{b.solarCapacityKW}</td>
                <td>{b.gridCapacityKW}</td>
                <td>
                  <span className={`status-badge status-${b.status}`}>{b.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
