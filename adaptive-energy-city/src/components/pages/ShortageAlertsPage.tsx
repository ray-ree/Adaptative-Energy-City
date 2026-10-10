/** ShortageAlertsPage — live shortage + violation log driven by simStore */
import React from 'react';
import { useSimStore } from '../../store/simStore';

const SEVERITY_COLOR: Record<string, string> = {
  overloaded: '#dc2626',
  warning:    '#d97706',
  normal:     '#16a34a',
  solar:      '#2563eb',
  inactive:   '#6b7280',
};

export default function ShortageAlertsPage() {
  const buildings      = useSimStore(s => s.buildings);
  const result         = useSimStore(s => s.schedulingResult);
  const slots          = useSimStore(s => s.slots);
  const currentSlot   = useSimStore(s => s.currentSlot);
  const networkStatus  = useSimStore(s => s.networkStatus);
  const status         = useSimStore(s => s.status);
  const gridCapacityKW = useSimStore(s => s.gridCapacityKW);

  const current = slots[currentSlot];
  const overloadedBuildings = buildings.filter(b => b.status === 'overloaded');
  const warningBuildings    = buildings.filter(b => b.status === 'warning');
  const isShortage          = networkStatus === 'overloaded' || status === 'shortage';

  const overload = current
    ? Math.max(0, current.gridImportKW - gridCapacityKW)
    : 0;

  return (
    <div className="page-content">
      <div className="page-header">
        <h2 className="page-title">🔔 Shortage Alerts</h2>
        <p className="page-desc">Active power shortages, affected buildings, severity levels, and resolution status.</p>
      </div>

      {/* City-wide status banner */}
      <div
        className="alert-banner"
        style={{
          background: isShortage ? '#fee2e2' : '#dcfce7',
          border: `1.5px solid ${isShortage ? '#fca5a5' : '#86efac'}`,
          color:  isShortage ? '#dc2626' : '#15803d',
        }}
      >
        <span style={{ fontSize: 20 }}>{isShortage ? '🚨' : '✅'}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {isShortage ? 'GRID OVERLOAD DETECTED' : 'City Grid Operating Normally'}
          </div>
          <div style={{ fontSize: 12, marginTop: 2 }}>
            {isShortage
              ? `Grid import ${current?.gridImportKW ?? 0} kW exceeds capacity ${gridCapacityKW} kW (+${overload} kW overload) at ${current?.label ?? '--'}`
              : `Grid import ${current?.gridImportKW ?? 0} kW within ${gridCapacityKW} kW capacity at ${current?.label ?? '--'}`}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 13 }}>
          {result?.remainingViolations ?? 0} violations
        </div>
      </div>

      {/* Overloaded buildings */}
      {overloadedBuildings.length > 0 && (
        <div className="alert-section">
          <div className="alert-section-title" style={{ color: '#dc2626' }}>
            🔴 Overloaded Buildings ({overloadedBuildings.length})
          </div>
          <div className="alert-cards">
            {overloadedBuildings.map(b => {
              const runningKW = b.baseDemandKW + b.devices.filter(d => d.status === 'running').reduce((a, d) => a + d.powerKW, 0);
              const overloadKW = Math.max(0, runningKW - b.solarCapacityKW - b.gridCapacityKW);
              return (
                <div key={b.id} className="alert-card overloaded">
                  <div className="alert-card-header">
                    <span style={{ fontWeight: 700 }}>{b.name}</span>
                    <span className="status-badge status-overloaded">Overloaded</span>
                  </div>
                  <div className="alert-card-body">
                    <div>Type: <strong>{b.type.replace('_', ' ')}</strong></div>
                    <div>Running demand: <strong>{runningKW} kW</strong></div>
                    <div>Grid capacity: <strong>{b.gridCapacityKW} kW</strong></div>
                    <div>Solar offset: <strong>{b.solarCapacityKW} kW</strong></div>
                    <div style={{ color: '#dc2626', fontWeight: 700 }}>Overload: +{overloadKW} kW</div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{b.label}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Warning buildings */}
      {warningBuildings.length > 0 && (
        <div className="alert-section">
          <div className="alert-section-title" style={{ color: '#d97706' }}>
            🟡 High-Demand Buildings ({warningBuildings.length})
          </div>
          <div className="alert-cards">
            {warningBuildings.map(b => {
              const runningKW = b.baseDemandKW + b.devices.filter(d => d.status === 'running').reduce((a, d) => a + d.powerKW, 0);
              return (
                <div key={b.id} className="alert-card warning">
                  <div className="alert-card-header">
                    <span style={{ fontWeight: 700 }}>{b.name}</span>
                    <span className="status-badge status-warning">High Demand</span>
                  </div>
                  <div className="alert-card-body">
                    <div>Running demand: <strong>{runningKW} kW</strong></div>
                    <div>Grid capacity: <strong>{b.gridCapacityKW} kW</strong></div>
                    <div style={{ color: '#d97706' }}>Utilisation: {Math.round((runningKW / b.gridCapacityKW) * 100)}%</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {overloadedBuildings.length === 0 && warningBuildings.length === 0 && (
        <div className="empty-state">
          <div style={{ fontSize: 40 }}>✅</div>
          <div style={{ fontWeight: 600, fontSize: 16, color: '#15803d' }}>No Active Alerts</div>
          <div style={{ color: '#6b7280', fontSize: 13 }}>All buildings are operating within capacity.</div>
        </div>
      )}

      {/* Scheduling decisions */}
      {result && result.rescheduledDevices.length > 0 && (
        <div className="table-card" style={{ marginTop: 16 }}>
          <div className="table-card-title">🔄 Rescheduled to Resolve Shortage</div>
          <table className="data-table">
            <thead>
              <tr><th>Building</th><th>Device</th><th>Priority</th><th>Power</th><th>Moved to Slot</th><th>Reason</th></tr>
            </thead>
            <tbody>
              {result.rescheduledDevices.map(({ buildingId, device }) => (
                <tr key={device.id}>
                  <td style={{ fontWeight: 600 }}>{buildingId.replace(/_/g, ' ')}</td>
                  <td>{device.name}</td>
                  <td><span className={`priority-badge priority-${device.priority}`}>{device.priority}</span></td>
                  <td>{device.powerKW} kW</td>
                  <td>Slot {device.assignedSlot}</td>
                  <td style={{ fontSize: 11, color: '#6b7280' }}>{device.rescheduleReason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
