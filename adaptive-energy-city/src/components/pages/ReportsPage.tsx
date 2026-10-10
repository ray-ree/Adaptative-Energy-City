/** ReportsPage — before/after energy stats, peak demand, cost outcomes, export */
import React, { useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useSimStore } from '../../store/simStore';

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #e4e1db', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color }}>
          {p.name}: <strong>{p.value}</strong>
        </div>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  const result         = useSimStore(s => s.schedulingResult);
  const buildings      = useSimStore(s => s.buildings);
  const slots          = useSimStore(s => s.slots);
  const currentSlot   = useSimStore(s => s.currentSlot);
  const gridCapacityKW = useSimStore(s => s.gridCapacityKW);
  const solarDropFactor = useSimStore(s => s.solarDropFactor);

  const current = slots[currentSlot];

  const buildingReport = buildings.map(b => {
    const runningKW = b.baseDemandKW + b.devices.filter(d => d.status === 'running').reduce((a, d) => a + d.powerKW, 0);
    return { name: b.name.split(' ').slice(0,2).join(' '), demand: runningKW, capacity: b.gridCapacityKW, solar: b.solarCapacityKW };
  });

  const compareData = result
    ? [
        { metric: 'Peak Demand (kW)', Original: result.originalPeakDemandKW, Revised: result.revisedPeakDemandKW },
        { metric: 'Daily Cost (₹÷10)', Original: Math.round(result.originalCostRs / 10), Revised: Math.round(result.revisedCostRs / 10) },
      ]
    : [];

  const exportCSV = useCallback(() => {
    if (!result) return;
    const rows = [
      ['Metric', 'Value'],
      ['Original Peak Demand (kW)', result.originalPeakDemandKW],
      ['Revised Peak Demand (kW)',  result.revisedPeakDemandKW],
      ['Original Daily Cost (₹)',   result.originalCostRs],
      ['Revised Daily Cost (₹)',    result.revisedCostRs],
      ['Solar Used (kWh)',          result.solarUsedKWh],
      ['Grid Imported (kWh)',       result.gridImportKWh],
      ['Activities Delayed',        result.delayedActivities],
      ['Deadlines Met',             result.deadlinesMet],
      ['Deadlines Missed',          result.deadlinesMissed],
      ['Remaining Violations',      result.remainingViolations],
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'energy_report.csv';
    a.click(); URL.revokeObjectURL(url);
  }, [result]);

  return (
    <div className="page-content">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 className="page-title">📄 Reports</h2>
          <p className="page-desc">Before-and-after energy statistics, peak demand, costs, and scheduling outcomes.</p>
        </div>
        <button className="ctrl-btn" onClick={exportCSV} disabled={!result} title="Export results as CSV">
          ⬇️ Export CSV
        </button>
      </div>

      {!result && (
        <div className="empty-state">
          <div style={{ fontSize: 36 }}>📊</div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>No Simulation Data Yet</div>
          <div style={{ color: '#6b7280', fontSize: 13 }}>Run the simulation or trigger an event to generate a report.</div>
        </div>
      )}

      {result && (
        <>
          {/* Summary comparison */}
          <div className="kpi-row">
            {[
              { label: 'Original Peak', value: `${result.originalPeakDemandKW} kW`, color: '#d97706', sub: 'Before scheduling' },
              { label: 'Revised Peak',  value: `${result.revisedPeakDemandKW} kW`,  color: result.revisedPeakDemandKW < result.originalPeakDemandKW ? '#16a34a' : '#dc2626', sub: 'After scheduling' },
              { label: 'Original Cost', value: `₹${result.originalCostRs.toLocaleString()}`, color: '#374151', sub: 'Before scheduling' },
              { label: 'Revised Cost',  value: `₹${result.revisedCostRs.toLocaleString()}`,  color: result.revisedCostRs < result.originalCostRs ? '#16a34a' : '#d97706', sub: 'After scheduling' },
              { label: 'Solar Used',    value: `${result.solarUsedKWh} kWh`,      color: '#2563eb', sub: 'On-site generation' },
              { label: 'Grid Import',   value: `${result.gridImportKWh} kWh`,      color: '#374151', sub: 'From grid' },
              { label: 'Cost Saving',   value: `₹${Math.max(0, result.originalCostRs - result.revisedCostRs).toLocaleString()}`, color: '#16a34a', sub: 'By rescheduling' },
              { label: 'Feasible',      value: result.feasible ? 'Yes ✅' : 'No ❌', color: result.feasible ? '#16a34a' : '#dc2626', sub: 'All deadlines met' },
            ].map(k => (
              <div key={k.label} className="kpi-card">
                <div className="kpi-label">{k.label}</div>
                <div className="kpi-value" style={{ color: k.color }}>{k.value}</div>
                <div style={{ fontSize: 10, color: '#9ca3af' }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Before vs after chart */}
          <div className="chart-card" style={{ marginTop: 16 }}>
            <div className="chart-card-title">📊 Before vs After Scheduling</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={compareData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e1db" />
                <XAxis dataKey="metric" tick={{ fill: '#374151', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="Original" fill="#d97706" radius={[4,4,0,0]} />
                <Bar dataKey="Revised"  fill="#16a34a" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Per-building demand vs capacity */}
          <div className="chart-card" style={{ marginTop: 14 }}>
            <div className="chart-card-title">🏢 Per-Building Demand vs Capacity</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={buildingReport} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e1db" />
                <XAxis dataKey="name" tick={{ fill: '#374151', fontSize: 10 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="demand"   fill="#d97706" radius={[4,4,0,0]} name="Demand (kW)" />
                <Bar dataKey="capacity" fill="#6b7280" radius={[4,4,0,0]} name="Capacity (kW)" />
                <Bar dataKey="solar"    fill="#2563eb" radius={[4,4,0,0]} name="Solar (kW)" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Detailed table */}
          <div className="table-card" style={{ marginTop: 14 }}>
            <div className="table-card-title">📋 Full Report</div>
            <table className="data-table">
              <thead><tr><th>Metric</th><th>Before Scheduling</th><th>After Scheduling</th><th>Change</th></tr></thead>
              <tbody>
                {[
                  {
                    m: 'Peak Demand (kW)',
                    before: result.originalPeakDemandKW,
                    after:  result.revisedPeakDemandKW,
                    good: result.revisedPeakDemandKW <= result.originalPeakDemandKW,
                  },
                  {
                    m: 'Daily Cost (₹)',
                    before: result.originalCostRs,
                    after:  result.revisedCostRs,
                    good: result.revisedCostRs <= result.originalCostRs,
                  },
                  {
                    m: 'Grid Import (kWh)',
                    before: result.gridImportKWh,
                    after:  result.gridImportKWh,
                    good: true,
                  },
                ].map(row => {
                  const diff = row.after - row.before;
                  return (
                    <tr key={row.m}>
                      <td style={{ fontWeight: 600 }}>{row.m}</td>
                      <td>{row.before.toLocaleString()}</td>
                      <td style={{ color: row.good ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{row.after.toLocaleString()}</td>
                      <td style={{ color: diff <= 0 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>
                        {diff > 0 ? '+' : ''}{diff.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
