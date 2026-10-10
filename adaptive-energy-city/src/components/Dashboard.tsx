import React from 'react';
import { useSimStore } from '../store/simStore';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';

// ─── Metric Card ──────────────────────────────────────────────────────────────
function MetricCard({ label, value, unit, color = '#22c55e', icon, tooltip }: {
  label: string; value: string | number; unit?: string; color?: string; icon: string; tooltip?: string;
}) {
  return (
    <div className="metric-card" title={tooltip}>
      <div className="metric-icon" style={{ color }}>{icon}</div>
      <div className="metric-body">
        <div className="metric-label">{label}</div>
        <div className="metric-value" style={{ color }}>
          {value}{unit && <span className="metric-unit"> {unit}</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="tooltip-label">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
          {p.unit ?? ''}
        </p>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const slots = useSimStore(s => s.slots);
  const currentSlot = useSimStore(s => s.currentSlot);
  const gridCapacityKW = useSimStore(s => s.gridCapacityKW);
  const solarDropFactor = useSimStore(s => s.solarDropFactor);
  const result = useSimStore(s => s.schedulingResult);
  const status = useSimStore(s => s.status);

  const current = slots[currentSlot];
  const timeLabel = current?.label ?? '--:--';

  // Demand vs capacity over 24h (sample every 4 slots = 1h)
  const demandData = slots.filter((_, i) => i % 4 === 0).map(s => ({
    time: s.label,
    Demand: s.totalDemandKW,
    Capacity: s.gridCapacityKW,
    Solar: s.solarGenKW,
    GridImport: s.gridImportKW,
  }));

  // Price over day
  const priceData = slots.filter((_, i) => i % 4 === 0).map(s => ({
    time: s.label,
    Price: +s.priceRsPerKWh.toFixed(2),
  }));

  // Cost over day
  const costData = slots.filter((_, i) => i % 4 === 0).map(s => ({
    time: s.label,
    Cost: s.costRs,
  }));

  const statusColor = {
    idle: '#6b7280',
    running: '#22c55e',
    paused: '#f59e0b',
    shortage: '#ef4444',
    resolved: '#3b82f6',
  }[status] ?? '#6b7280';

  const statusLabel = {
    idle: '⏸ Idle',
    running: '▶ Running',
    paused: '⏸ Paused',
    shortage: '🚨 Shortage',
    resolved: '✅ Resolved',
  }[status] ?? status;

  return (
    <div className="dashboard">
      {/* ─── Status bar ─────────────────────────────────── */}
      <div className="status-bar">
        <div className="status-pill" style={{ background: statusColor + '22', borderColor: statusColor, color: statusColor }}>
          {statusLabel}
        </div>
        <div className="status-time">🕐 {timeLabel}</div>
        <div className="status-solar">
          ☀️ Solar at {Math.round(solarDropFactor * 100)}%
        </div>
      </div>

      {/* ─── Key Metrics ─────────────────────────────────── */}
      <div className="metrics-grid">
        <MetricCard icon="⚡" label="Total Demand" value={current?.totalDemandKW ?? 0} unit="kW" color="#d97706" tooltip="Total electricity demand across all buildings" />
        <MetricCard icon="☀️" label="Solar Generation" value={current?.solarGenKW ?? 0} unit="kW" color="#2563eb" tooltip="Solar energy currently being generated" />
        <MetricCard icon="🔌" label="Grid Import" value={current?.gridImportKW ?? 0} unit="kW" color={current?.gridImportKW > gridCapacityKW ? '#dc2626' : '#16a34a'} tooltip="Electricity imported from the main grid" />
        <MetricCard icon="🏗️" label="Grid Capacity" value={gridCapacityKW} unit="kW" color="#6b7280" tooltip="Maximum electricity the grid feeder can supply" />
        <MetricCard icon="💰" label="Current Price" value={current?.priceRsPerKWh?.toFixed(2) ?? '--'} unit="₹/kWh" color="#d97706" tooltip="Current electricity tariff rate" />
        <MetricCard icon="📊" label="Slot Cost" value={current?.costRs ?? 0} unit="₹" color="#16a34a" tooltip="Estimated cost for this 15-minute interval" />
        {result && (
          <>
            <MetricCard icon="🔄" label="Delayed Activities" value={result.delayedActivities} color="#d97706" tooltip="Number of flexible loads rescheduled" />
            <MetricCard icon="⚠️" label="Violations" value={result.remainingViolations} color={result.remainingViolations > 0 ? '#dc2626' : '#16a34a'} tooltip="Remaining capacity violations after scheduling" />
          </>
        )}
      </div>

      {/* ─── Charts ──────────────────────────────────────── */}
      <div className="charts-grid">
        {/* Demand vs Capacity */}
        <div className="chart-card">
          <h4 className="chart-title">⚡ Demand vs Capacity (kW)</h4>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={demandData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="demGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="solGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e1db" />
              <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 9 }} interval={3} />
              <YAxis tick={{ fill: '#64748b', fontSize: 9 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
              <ReferenceLine y={gridCapacityKW} stroke="#ef4444" strokeDasharray="4 2" label={{ value: 'Limit', fill: '#ef4444', fontSize: 9 }} />
              <Area type="monotone" dataKey="Demand" stroke="#f59e0b" fill="url(#demGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="Solar" stroke="#3b82f6" fill="url(#solGrad)" strokeWidth={2} />
              <Line type="monotone" dataKey="Capacity" stroke="#ef4444" strokeDasharray="5 2" strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Solar throughout day */}
        <div className="chart-card">
          <h4 className="chart-title">☀️ Solar Generation (kW)</h4>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={demandData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="solGrad2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e1db" />
              <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 9 }} interval={3} />
              <YAxis tick={{ fill: '#64748b', fontSize: 9 }} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="Solar" stroke="#3b82f6" fill="url(#solGrad2)" strokeWidth={2} />
              <ReferenceLine x={slots[currentSlot]?.label} stroke="#6b7280" strokeDasharray="3 2" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Price chart */}
        <div className="chart-card">
          <h4 className="chart-title">💰 Electricity Price (₹/kWh)</h4>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={priceData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e1db" />
              <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 9 }} interval={3} />
              <YAxis tick={{ fill: '#64748b', fontSize: 9 }} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="Price" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Cost chart */}
        <div className="chart-card">
          <h4 className="chart-title">📊 Energy Cost per Hour (₹)</h4>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={costData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e1db" />
              <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 9 }} interval={3} />
              <YAxis tick={{ fill: '#64748b', fontSize: 9 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="Cost" fill="#22c55e" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ─── Scheduling Results ───────────────────────────── */}
      {result && (
        <div className="results-card">
          <h4 className="results-title">📋 Scheduling Results — Before vs After</h4>
          <div className="results-grid">
            <div className="result-item">
              <span className="result-label">Original Peak Demand</span>
              <span className="result-value">{result.originalPeakDemandKW} kW</span>
            </div>
            <div className="result-item">
              <span className="result-label">Revised Peak Demand</span>
              <span className="result-value" style={{ color: result.revisedPeakDemandKW < result.originalPeakDemandKW ? '#16a34a' : '#dc2626' }}>
                {result.revisedPeakDemandKW} kW
              </span>
            </div>
            <div className="result-item">
              <span className="result-label">Original Daily Cost</span>
              <span className="result-value">₹{result.originalCostRs.toLocaleString()}</span>
            </div>
            <div className="result-item">
              <span className="result-label">Revised Daily Cost</span>
              <span className="result-value" style={{ color: result.revisedCostRs < result.originalCostRs ? '#16a34a' : '#d97706' }}>
                ₹{result.revisedCostRs.toLocaleString()}
              </span>
            </div>
            <div className="result-item">
              <span className="result-label">Solar Used</span>
              <span className="result-value" style={{ color: '#2563eb' }}>{result.solarUsedKWh} kWh</span>
            </div>
            <div className="result-item">
              <span className="result-label">Grid Imported</span>
              <span className="result-value">{result.gridImportKWh} kWh</span>
            </div>
            <div className="result-item">
              <span className="result-label">Activities Delayed</span>
              <span className="result-value" style={{ color: '#d97706' }}>{result.delayedActivities}</span>
            </div>
            <div className="result-item">
              <span className="result-label">Deadlines Met / Missed</span>
              <span className="result-value">
                <span style={{ color: '#16a34a' }}>{result.deadlinesMet}</span>
                {' / '}
                <span style={{ color: '#dc2626' }}>{result.deadlinesMissed}</span>
              </span>
            </div>
          </div>
          <div className={`feasibility-badge ${result.feasible ? 'feasible' : 'infeasible'}`}>
            {result.feasible
              ? '✅ Schedule is feasible — all capacity limits respected'
              : `⚠️ ${result.remainingViolations} capacity violation(s) remain after scheduling`}
          </div>
          {result.revisedCostRs < result.originalCostRs && (
            <div className="savings-badge">
              💰 Cost saving: ₹{(result.originalCostRs - result.revisedCostRs).toLocaleString()} by shifting to cheaper time slots
            </div>
          )}
        </div>
      )}
    </div>
  );
}
