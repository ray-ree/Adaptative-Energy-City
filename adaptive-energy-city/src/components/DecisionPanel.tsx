import React, { useRef, useEffect } from 'react';
import { useSimStore } from '../store/simStore';

export default function DecisionPanel() {
  const explanations = useSimStore(s => s.explanations);
  const result = useSimStore(s => s.schedulingResult);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [explanations]);

  function getIcon(msg: string) {
    if (msg.startsWith('✅')) return 'success';
    if (msg.startsWith('⚠️')) return 'warning';
    if (msg.startsWith('🚨')) return 'error';
    if (msg.startsWith('⏰')) return 'reschedule';
    if (msg.startsWith('❌')) return 'error';
    if (msg.startsWith('🏢')) return 'building';
    if (msg.startsWith('💰')) return 'price';
    if (msg.startsWith('☀️')) return 'solar';
    if (msg.startsWith('📈')) return 'demand';
    if (msg.startsWith('🔌')) return 'grid';
    return 'info';
  }

  return (
    <div className="decision-panel">
      <h3 className="panel-title">🤖 Why Did the AI Make This Decision?</h3>
      <p className="decision-desc">
        This panel shows transparent, rule-based explanations for every scheduling decision.
        No machine learning — just priority rules and capacity constraints.
      </p>

      {/* ── Rescheduled Devices Table ─────────────────── */}
      {result && result.rescheduledDevices.length > 0 && (
        <div className="rescheduled-section">
          <div className="rescheduled-header">Rescheduled Equipment</div>
          <div className="rescheduled-table-wrap">
            <table className="rescheduled-table">
              <thead>
                <tr>
                  <th>Building</th>
                  <th>Device</th>
                  <th>Priority</th>
                  <th>Power</th>
                  <th>New Slot</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {result.rescheduledDevices.map(({ buildingId, device }) => (
                  <tr key={device.id}>
                    <td>{buildingId.replace(/_/g, ' ')}</td>
                    <td>{device.name}</td>
                    <td>
                      <span className={`priority-badge priority-${device.priority}`}>
                        {device.priority}
                      </span>
                    </td>
                    <td>{device.powerKW} kW</td>
                    <td>Slot {device.assignedSlot}</td>
                    <td className="reason-cell">{device.rescheduleReason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Explanation Log ───────────────────────────── */}
      <div className="explanation-log" ref={listRef}>
        {explanations.map((msg, i) => (
          <div key={i} className={`explanation-item explanation-${getIcon(msg)}`}>
            <span className="explanation-text">{msg}</span>
          </div>
        ))}
      </div>

      {/* ── Scenario info ─────────────────────────────── */}
      <div className="scenario-info">
        <div className="scenario-title">📖 About the Scheduling Engine</div>
        <ul className="scenario-list">
          <li><strong>Critical loads</strong> (ICU, safety systems) are never moved.</li>
          <li><strong>High priority</strong> loads (HVAC, production) are kept running when feasible.</li>
          <li><strong>Flexible loads</strong> (water heating, food court) are shifted to less-loaded slots.</li>
          <li><strong>Deferrable loads</strong> (EV charging, laundry) are postponed to cheaper slots within deadlines.</li>
          <li>Cost = grid import (kW) × 0.25 h × price (₹/kWh) per 15-min interval.</li>
          <li>A shortage is declared only when grid import exceeds feeder capacity.</li>
        </ul>
      </div>
    </div>
  );
}
