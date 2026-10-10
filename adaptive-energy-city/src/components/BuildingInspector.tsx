import React from 'react';
import { useSimStore } from '../store/simStore';
import type { Building } from '../types/energy';

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f59e0b',
  flexible: '#3b82f6',
  deferrable: '#6b7280',
};

const STATUS_COLORS: Record<string, string> = {
  running: '#22c55e',
  rescheduled: '#f59e0b',
  delayed: '#f97316',
  off: '#6b7280',
};

const BUILDING_ICONS: Record<string, string> = {
  hospital: '🏥',
  factory: '🏭',
  office: '🏢',
  mall: '🛍️',
  residential: '🏘️',
  solar_farm: '☀️',
  substation: '⚡',
  ev_station: '🔌',
};

export default function BuildingInspector() {
  const buildings = useSimStore(s => s.buildings);
  const selectedId = useSimStore(s => s.selectedBuildingId);
  const selectBuilding = useSimStore(s => s.selectBuilding);
  const slots = useSimStore(s => s.slots);
  const currentSlot = useSimStore(s => s.currentSlot);
  const solarDropFactor = useSimStore(s => s.solarDropFactor);

  const building = buildings.find(b => b.id === selectedId);

  if (!building) {
    return (
      <div className="inspector-empty">
        <div className="inspector-icon-empty">🏙️</div>
        <div className="inspector-hint">Click any building in the city map to inspect its energy details and scheduling actions.</div>
        {/* Quick building list */}
        <div className="building-list">
          {buildings.map(b => (
            <button key={b.id} className="building-list-item" onClick={() => selectBuilding(b.id)}>
              <span>{BUILDING_ICONS[b.type]}</span>
              <span className="building-list-name">{b.name}</span>
              <span className={`building-list-status status-${b.status}`}>●</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const currentSlotData = slots[currentSlot];
  const totalDeviceDemand = building.devices.reduce((sum, d) => {
    if ((d.status === 'running' || d.status === 'rescheduled') &&
        currentSlot >= d.assignedSlot && currentSlot < d.assignedSlot + d.durationSlots) {
      return sum + d.powerKW;
    }
    return sum;
  }, 0);
  const totalDemand = building.baseDemandKW + totalDeviceDemand;
  const solarGen = building.solarCapacityKW * (currentSlotData?.solarFactor ?? 0) * solarDropFactor;
  const netGrid = Math.max(0, totalDemand - solarGen);
  const isOverCapacity = netGrid > building.gridCapacityKW;

  return (
    <div className="inspector">
      <div className="inspector-header">
        <span className="inspector-icon-lg">{BUILDING_ICONS[building.type]}</span>
        <div>
          <div className="inspector-name">{building.name}</div>
          <div className="inspector-type">{building.type.replace(/_/g, ' ')}</div>
        </div>
        <button className="inspector-close" onClick={() => selectBuilding(null)}>✕</button>
      </div>

      {building.label && (
        <div className="inspector-label">{building.label}</div>
      )}

      {/* Status badge */}
      <div className={`inspector-status-badge isb-${building.status}`}>
        {building.status === 'normal' && '✓ Normal'}
        {building.status === 'warning' && '⚠ High Demand'}
        {building.status === 'overloaded' && '✕ Overloaded'}
        {building.status === 'solar' && '☀ Solar Active'}
        {building.status === 'inactive' && '— Inactive'}
      </div>
      <div className="inspector-metrics">
        <div className="insp-metric">
          <span className="insp-label">Total Demand</span>
          <span className="insp-value" style={{ color: '#d97706' }}>{totalDemand.toFixed(1)} kW</span>
        </div>
        <div className="insp-metric">
          <span className="insp-label">Solar Generation</span>
          <span className="insp-value" style={{ color: '#2563eb' }}>{solarGen.toFixed(1)} kW</span>
        </div>
        <div className="insp-metric">
          <span className="insp-label">Net Grid Import</span>
          <span className="insp-value" style={{ color: isOverCapacity ? '#dc2626' : '#16a34a' }}>
            {netGrid.toFixed(1)} kW
          </span>
        </div>
        <div className="insp-metric">
          <span className="insp-label">Connection Limit</span>
          <span className="insp-value" style={{ color: '#6b7280' }}>{building.gridCapacityKW} kW</span>
        </div>
        <div className="insp-metric">
          <span className="insp-label">Tariff</span>
          <span className="insp-value">₹{building.tariffRsPerKWh}/kWh</span>
        </div>
        <div className="insp-metric">
          <span className="insp-label">Solar Capacity</span>
          <span className="insp-value" style={{ color: '#2563eb' }}>{building.solarCapacityKW} kW</span>
        </div>
      </div>

      {isOverCapacity && (
        <div className="insp-alert">
          ⚠️ Grid import ({netGrid.toFixed(0)} kW) exceeds connection limit ({building.gridCapacityKW} kW)
        </div>
      )}

      {/* Capacity bar */}
      <div className="capacity-bar-wrap">
        <div className="capacity-bar-label">
          <span>Grid Usage</span>
          <span>{Math.min(100, Math.round((netGrid / building.gridCapacityKW) * 100))}%</span>
        </div>
        <div className="capacity-bar-bg">
          <div
            className="capacity-bar-fill"
            style={{
              width: `${Math.min(100, (netGrid / building.gridCapacityKW) * 100)}%`,
              background: isOverCapacity ? '#ef4444' : netGrid > building.gridCapacityKW * 0.8 ? '#f59e0b' : '#22c55e',
            }}
          />
        </div>
      </div>

      {/* Devices */}
      {building.devices.length > 0 && (
        <div className="devices-section">
          <div className="devices-header">Equipment</div>
          {building.devices.map(d => {
            const isActive = (d.status === 'running' || d.status === 'rescheduled') &&
              currentSlot >= d.assignedSlot && currentSlot < d.assignedSlot + d.durationSlots;
            return (
              <div key={d.id} className={`device-row ${isActive ? 'device-active' : 'device-inactive'}`}>
                <div className="device-info">
                  <span className="device-name">{d.name}</span>
                  <span className="priority-badge priority-sm" style={{ background: PRIORITY_COLORS[d.priority] + '22', color: PRIORITY_COLORS[d.priority], border: `1px solid ${PRIORITY_COLORS[d.priority]}` }}>
                    {d.priority}
                  </span>
                </div>
                <div className="device-stats">
                  <span className="device-power">{d.powerKW} kW</span>
                  <span className="device-status" style={{ color: STATUS_COLORS[d.status] ?? '#6b7280' }}>
                    ● {d.status}
                  </span>
                </div>
                {d.rescheduleReason && (
                  <div className="device-reason">{d.rescheduleReason}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <button className="inspector-back" onClick={() => selectBuilding(null)}>← Back to city overview</button>
    </div>
  );
}
