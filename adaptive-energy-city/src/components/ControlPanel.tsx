import React from 'react';
import { useSimStore } from '../store/simStore';
import type { SimulationEvent } from '../types/energy';

const SPEED_OPTIONS = [0.5, 1, 2, 4, 8];

export default function ControlPanel() {
  const status = useSimStore(s => s.status);
  const currentSlot = useSimStore(s => s.currentSlot);
  const speedMultiplier = useSimStore(s => s.speedMultiplier);
  const gridCapacityKW = useSimStore(s => s.gridCapacityKW);
  const solarDropFactor = useSimStore(s => s.solarDropFactor);
  const priceSpikeMultiplier = useSimStore(s => s.priceSpikeMultiplier);
  const demandBoostKW = useSimStore(s => s.demandBoostKW);
  const slots = useSimStore(s => s.slots);

  const startSimulation = useSimStore(s => s.startSimulation);
  const pauseSimulation = useSimStore(s => s.pauseSimulation);
  const resetSimulation = useSimStore(s => s.resetSimulation);
  const advanceSlot = useSimStore(s => s.advanceSlot);
  const setSlot = useSimStore(s => s.setSlot);
  const setSpeed = useSimStore(s => s.setSpeed);
  const triggerEvent = useSimStore(s => s.triggerEvent);
  const runDemo = useSimStore(s => s.runDemo);

  const isRunning = status === 'running' || status === 'shortage';
  const currentLabel = slots[currentSlot]?.label ?? '--:--';

  function btn(onClick: () => void, label: string, color: string, disabled = false) {
    return (
      <button
        className={`ctrl-btn ctrl-btn-${color}`}
        onClick={onClick}
        disabled={disabled}
      >
        {label}
      </button>
    );
  }

  function eventBtn(ev: SimulationEvent, label: string, color: string) {
    return btn(() => triggerEvent(ev), label, color);
  }

  return (
    <div className="control-panel">
      <h3 className="panel-title">Simulation Controls</h3>

      {/* ── Primary Controls ─────────────────────────────── */}
      <div className="ctrl-section">
        <div className="ctrl-label">Simulation</div>
        <div className="ctrl-row">
          {btn(startSimulation, '▶ Start', 'green', isRunning)}
          {btn(pauseSimulation, '⏸ Pause', 'yellow', !isRunning)}
          {btn(resetSimulation, '↺ Reset', 'gray')}
          {btn(advanceSlot, '⏭ +15min', 'blue')}
        </div>
      </div>

      {/* ── Demo Button ───────────────────────────────────── */}
      <div className="ctrl-section">
        <button className="demo-btn" onClick={runDemo}>
          ⚡ Run Power Shortage Demo
        </button>
        <p className="demo-hint">
          Instantly triggers solar drop + grid overload at 10:00 AM so you can watch the scheduler respond in real time.
        </p>
      </div>

      {/* ── Time Slider ───────────────────────────────────── */}
      <div className="ctrl-section">
        <div className="ctrl-label">
          Time of Day: <span className="ctrl-value">{currentLabel}</span>
        </div>
        <input
          type="range"
          min={0}
          max={95}
          value={currentSlot}
          onChange={e => setSlot(Number(e.target.value))}
          className="time-slider"
        />
        <div className="slider-labels">
          <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:45</span>
        </div>
      </div>

      {/* ── Speed ────────────────────────────────────────── */}
      <div className="ctrl-section">
        <div className="ctrl-label">Simulation Speed</div>
        <div className="speed-row">
          {SPEED_OPTIONS.map(s => (
            <button
              key={s}
              className={`speed-btn ${speedMultiplier === s ? 'speed-btn-active' : ''}`}
              onClick={() => setSpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      {/* ── Event Controls ───────────────────────────────── */}
      <div className="ctrl-section">
        <div className="ctrl-label">⚡ Trigger Events</div>
        <div className="ctrl-grid2">
          {eventBtn('solar_drop', '☀️↓ Solar Drop', 'blue')}
          {eventBtn('price_spike', '💰↑ Price Spike', 'amber')}
          {eventBtn('reduce_grid', '🔌↓ Reduce Grid', 'red')}
          {eventBtn('increase_demand', '📈 More Demand', 'orange')}
          {eventBtn('restore_normal', '✅ Restore Normal', 'green')}
        </div>
      </div>

      {/* ── Current State Readout ────────────────────────── */}
      <div className="ctrl-section state-readout">
        <div className="ctrl-label">Current Conditions</div>
        <div className="state-item">
          <span>☀️ Solar</span>
          <span className="state-bar-wrap">
            <span className="state-bar" style={{ width: `${solarDropFactor * 100}%`, background: '#2563eb' }} />
          </span>
          <span>{Math.round(solarDropFactor * 100)}%</span>
        </div>
        <div className="state-item">
          <span>🔌 Grid</span>
          <span className="state-bar-wrap">
            <span className="state-bar" style={{ width: `${(gridCapacityKW / 400) * 100}%`, background: '#6b7280' }} />
          </span>
          <span>{gridCapacityKW} kW</span>
        </div>
        <div className="state-item">
          <span>💰 Price</span>
          <span className="state-bar-wrap">
            <span className="state-bar" style={{ width: `${Math.min(100, (priceSpikeMultiplier / 3) * 100)}%`, background: '#d97706' }} />
          </span>
          <span>{priceSpikeMultiplier.toFixed(1)}×</span>
        </div>
        <div className="state-item">
          <span>📈 Boost</span>
          <span className="state-bar-wrap">
            <span className="state-bar" style={{ width: `${Math.min(100, (demandBoostKW / 200) * 100)}%`, background: '#dc2626' }} />
          </span>
          <span>+{demandBoostKW} kW</span>
        </div>
      </div>
    </div>
  );
}
