/** SettingsPage — grid capacity, solar factor, speed, display preferences */
import React from 'react';
import { useSimStore } from '../../store/simStore';

export default function SettingsPage() {
  const gridCapacityKW      = useSimStore(s => s.gridCapacityKW);
  const solarDropFactor     = useSimStore(s => s.solarDropFactor);
  const priceSpikeMultiplier = useSimStore(s => s.priceSpikeMultiplier);
  const demandBoostKW       = useSimStore(s => s.demandBoostKW);
  const speedMultiplier     = useSimStore(s => s.speedMultiplier);
  const triggerEvent        = useSimStore(s => s.triggerEvent);
  const setSpeed            = useSimStore(s => s.setSpeed);
  const setSlot             = useSimStore(s => s.setSlot);
  const currentSlot         = useSimStore(s => s.currentSlot);
  const resetSimulation     = useSimStore(s => s.resetSimulation);

  return (
    <div className="page-content">
      <div className="page-header">
        <h2 className="page-title">⚙️ Settings</h2>
        <p className="page-desc">Adjust simulation parameters, grid capacity, solar output, and display preferences.</p>
      </div>

      <div className="settings-grid">

        {/* Simulation Parameters */}
        <div className="settings-card">
          <div className="settings-card-title">🔌 Grid &amp; Power</div>

          <div className="setting-row">
            <label className="setting-label">
              Grid Capacity
              <span className="setting-value-badge">{gridCapacityKW} kW</span>
            </label>
            <input
              type="range" min={100} max={600} step={20} value={gridCapacityKW}
              className="setting-slider"
              onChange={e => {
                const s = useSimStore.getState();
                const patch = { ...s, gridCapacityKW: +e.target.value };
                useSimStore.getState().triggerEvent('restore_normal');
              }}
            />
            <div className="setting-hint">Max power the grid feeder can supply to the district.</div>
          </div>

          <div className="setting-row">
            <label className="setting-label">
              Solar Generation Factor
              <span className="setting-value-badge">{Math.round(solarDropFactor * 100)}%</span>
            </label>
            <input
              type="range" min={0.05} max={1} step={0.05} value={solarDropFactor}
              className="setting-slider"
              onChange={() => {}}
            />
            <div className="setting-hint">
              Use the Solar Drop button in Controls to reduce solar. Restore Normal resets to 100%.
            </div>
          </div>

          <div className="setting-row">
            <label className="setting-label">
              Price Spike Multiplier
              <span className="setting-value-badge">{priceSpikeMultiplier.toFixed(1)}×</span>
            </label>
            <div className="setting-hint">
              Use the Price Spike event button to increase tariff. Current: {priceSpikeMultiplier.toFixed(1)}×
            </div>
          </div>

          <div className="setting-row">
            <label className="setting-label">
              Demand Boost
              <span className="setting-value-badge">+{demandBoostKW} kW</span>
            </label>
            <div className="setting-hint">Extra kW added to city demand via More Demand event.</div>
          </div>
        </div>

        {/* Simulation Speed */}
        <div className="settings-card">
          <div className="settings-card-title">⚡ Simulation Speed</div>
          <div className="setting-row">
            <label className="setting-label">
              Speed Multiplier
              <span className="setting-value-badge">{speedMultiplier}×</span>
            </label>
            <div className="speed-btns">
              {[0.5, 1, 2, 4, 8].map(s => (
                <button
                  key={s}
                  className={`speed-btn ${speedMultiplier === s ? 'active' : ''}`}
                  onClick={() => setSpeed(s)}
                >
                  {s}×
                </button>
              ))}
            </div>
            <div className="setting-hint">
              At 1× speed, each 15-min slot advances every 2 seconds of real time.
            </div>
          </div>

          <div className="setting-row">
            <label className="setting-label">
              Jump to Time Slot
              <span className="setting-value-badge">Slot {currentSlot} ({String(Math.floor((currentSlot*15)/60)).padStart(2,'0')}:{String((currentSlot*15)%60).padStart(2,'0')})</span>
            </label>
            <input
              type="range" min={0} max={95} step={1} value={currentSlot}
              className="setting-slider"
              onChange={e => setSlot(+e.target.value)}
            />
            <div className="setting-hint">Drag to jump to any 15-minute interval of the day.</div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="settings-card">
          <div className="settings-card-title">🎮 Quick Actions</div>
          <div className="settings-actions">
            <button className="ctrl-btn danger"   onClick={() => triggerEvent('solar_drop')}>☁️ Drop Solar to 20%</button>
            <button className="ctrl-btn warning"  onClick={() => triggerEvent('price_spike')}>💰 Spike Electricity Price</button>
            <button className="ctrl-btn warning"  onClick={() => triggerEvent('reduce_grid')}>🔌 Reduce Grid Capacity</button>
            <button className="ctrl-btn warning"  onClick={() => triggerEvent('increase_demand')}>📈 Boost Demand +50 kW</button>
            <button className="ctrl-btn success"  onClick={() => triggerEvent('restore_normal')}>✅ Restore All to Normal</button>
            <button className="ctrl-btn"          onClick={resetSimulation} style={{ background: '#f3f4f6', color: '#374151' }}>🔄 Full Reset</button>
          </div>
        </div>

        {/* About */}
        <div className="settings-card">
          <div className="settings-card-title">ℹ️ About</div>
          <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
            <p><strong>Adaptive Energy City</strong> is an interactive solar-aware energy management and scheduling simulator for buildings and urban districts.</p>
            <p style={{ marginTop: 8 }}>It uses a <strong>priority-based scheduling engine</strong> — no machine learning. Critical loads (ICU, safety) are never rescheduled. Flexible and deferrable loads are moved to lower-cost time slots to stay within grid capacity.</p>
            <p style={{ marginTop: 8 }}><strong>Cost formula:</strong> Grid Import (kW) × 0.25 h × Price (₹/kWh) per 15-minute interval.</p>
            <p style={{ marginTop: 8, color: '#6b7280', fontSize: 11 }}>⚠️ For educational and planning purposes only. Does not model real voltage, current, or electrical losses.</p>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8, fontSize: 11, color: '#9ca3af' }}>
            <span>React 19</span>·<span>Three.js</span>·<span>Recharts</span>·<span>Zustand</span>
          </div>
        </div>

      </div>
    </div>
  );
}
