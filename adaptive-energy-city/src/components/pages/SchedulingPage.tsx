/** SchedulingPage — original vs revised schedules, device assignments, decisions */
import React from 'react';
import { useSimStore } from '../../store/simStore';

const SLOT_MIN = 15;
function slotToTime(s: number) {
  const m = s * SLOT_MIN;
  return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
}

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, flexible: 2, deferrable: 3 };

export default function SchedulingPage() {
  const buildings  = useSimStore(s => s.buildings);
  const result     = useSimStore(s => s.schedulingResult);
  const explanations = useSimStore(s => s.explanations);
  const triggerEvent = useSimStore(s => s.triggerEvent);

  const allDevices = buildings.flatMap(b =>
    b.devices.map(d => ({ ...d, buildingName: b.name, buildingId: b.id }))
  ).sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4));

  const rescheduledIds = new Set(result?.rescheduledDevices.map(r => r.device.id) ?? []);

  return (
    <div className="page-content">
      <div className="page-header">
        <h2 className="page-title">📅 Scheduling</h2>
        <p className="page-desc">View appliance schedules, deferred activities, deadlines, and the scheduling engine's decisions.</p>
      </div>

      {/* Summary stats */}
      {result && (
        <div className="kpi-row">
          {[
            { label: 'Original Peak', value: `${result.originalPeakDemandKW} kW`, color: '#d97706' },
            { label: 'Revised Peak',  value: `${result.revisedPeakDemandKW} kW`,  color: result.revisedPeakDemandKW < result.originalPeakDemandKW ? '#16a34a' : '#dc2626' },
            { label: 'Original Cost', value: `₹${result.originalCostRs.toLocaleString()}`, color: '#374151' },
            { label: 'Revised Cost',  value: `₹${result.revisedCostRs.toLocaleString()}`,  color: result.revisedCostRs < result.originalCostRs ? '#16a34a' : '#d97706' },
            { label: 'Deferred',      value: `${result.delayedActivities}`,         color: '#d97706' },
            { label: 'Violations',    value: `${result.remainingViolations}`,        color: result.remainingViolations > 0 ? '#dc2626' : '#16a34a' },
            { label: 'Deadlines Met', value: `${result.deadlinesMet}`,               color: '#16a34a' },
            { label: 'Deadlines Missed', value: `${result.deadlinesMissed}`,         color: result.deadlinesMissed > 0 ? '#dc2626' : '#16a34a' },
          ].map(k => (
            <div key={k.label} className="kpi-card">
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-value" style={{ color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Recalculate button */}
      <div style={{ display: 'flex', gap: 10, margin: '12px 0' }}>
        <button className="ctrl-btn warning" onClick={() => triggerEvent('increase_demand')}>
          📈 Increase Demand
        </button>
        <button className="ctrl-btn danger"  onClick={() => triggerEvent('solar_drop')}>
          ☁️ Solar Drop
        </button>
        <button className="ctrl-btn success" onClick={() => triggerEvent('restore_normal')}>
          ✅ Restore Normal
        </button>
      </div>

      {/* Full device schedule table */}
      <div className="table-card">
        <div className="table-card-title">📋 Complete Appliance Schedule</div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Building</th>
              <th>Appliance</th>
              <th>Priority</th>
              <th>Power (kW)</th>
              <th>State</th>
              <th>Earliest</th>
              <th>Deadline</th>
              <th>Assigned Slot</th>
              <th>Duration</th>
              <th>Changed?</th>
            </tr>
          </thead>
          <tbody>
            {allDevices.map(d => (
              <tr key={d.id} style={{ background: rescheduledIds.has(d.id) ? '#fffbeb' : undefined }}>
                <td style={{ fontSize: 11, color: '#6b7280' }}>{d.buildingName}</td>
                <td style={{ fontWeight: 600 }}>{d.name}</td>
                <td><span className={`priority-badge priority-${d.priority}`}>{d.priority}</span></td>
                <td>{d.powerKW}</td>
                <td>
                  <span className={`status-badge ${d.status === 'running' ? 'status-normal' : d.status === 'delayed' || d.status === 'rescheduled' ? 'status-warning' : 'status-inactive'}`}>
                    {d.status}
                  </span>
                </td>
                <td style={{ fontSize: 11 }}>{slotToTime(d.earliestSlot)}</td>
                <td style={{ fontSize: 11 }}>{slotToTime(d.deadlineSlot)}</td>
                <td style={{ fontWeight: 600, color: rescheduledIds.has(d.id) ? '#d97706' : undefined }}>
                  {slotToTime(d.assignedSlot)}
                </td>
                <td style={{ fontSize: 11 }}>{d.durationSlots * 15} min</td>
                <td>
                  {rescheduledIds.has(d.id)
                    ? <span style={{ color: '#d97706', fontWeight: 700 }}>🔄 Moved</span>
                    : <span style={{ color: '#16a34a' }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Explanation log */}
      {explanations.length > 0 && (
        <div className="table-card" style={{ marginTop: 14 }}>
          <div className="table-card-title">🤖 Scheduling Engine Decisions</div>
          <div style={{ maxHeight: 280, overflowY: 'auto', padding: '8px 12px' }}>
            {explanations.map((msg, i) => (
              <div key={i} style={{
                padding: '5px 0',
                borderBottom: '1px solid #f0ede8',
                fontSize: 12,
                color: msg.startsWith('✅') ? '#15803d' : msg.startsWith('⚠') || msg.startsWith('🚨') ? '#b45309' : '#374151',
              }}>
                {msg}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
