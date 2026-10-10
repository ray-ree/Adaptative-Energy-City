import React, { useEffect, Suspense, lazy, useState } from 'react';
import { useSimStore } from './store/simStore';
import Dashboard from './components/Dashboard';
import ControlPanel from './components/ControlPanel';
import DecisionPanel from './components/DecisionPanel';
import BuildingInspector from './components/BuildingInspector';
import WelcomeScreen from './components/WelcomeScreen';
import City2DView from './components/City2DView';

const CityCanvas = lazy(() => import('./components/CityCanvas'));

// ─── Left sidebar nav items ───────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'overview',    icon: '🏙️', label: 'City Overview' },
  { id: 'monitoring',  icon: '📊', label: 'Energy Monitoring' },
  { id: 'alerts',      icon: '🔔', label: 'Shortage Alerts' },
  { id: 'scheduling',  icon: '📅', label: 'Scheduling' },
  { id: 'reports',     icon: '📄', label: 'Reports' },
  { id: 'settings',    icon: '⚙️', label: 'Settings' },
];

export default function App() {
  const showWelcome    = useSimStore(s => s.showWelcome);
  const view           = useSimStore(s => s.view);
  const toggleView     = useSimStore(s => s.toggleView);
  const tick           = useSimStore(s => s.tick);
  const status         = useSimStore(s => s.status);
  const speedMultiplier = useSimStore(s => s.speedMultiplier);
  const networkStatus  = useSimStore(s => s.networkStatus);
  const slots          = useSimStore(s => s.slots);
  const currentSlot    = useSimStore(s => s.currentSlot);
  const gridCapacityKW = useSimStore(s => s.gridCapacityKW);
  const solarDropFactor = useSimStore(s => s.solarDropFactor);
  const result         = useSimStore(s => s.schedulingResult);

  const [activeNav, setActiveNav] = useState('overview');

  // Simulation ticker
  useEffect(() => {
    if (status !== 'running' && status !== 'shortage') return;
    const id = setInterval(tick, Math.max(200, 2000 / speedMultiplier));
    return () => clearInterval(id);
  }, [status, speedMultiplier, tick]);

  const current = slots[currentSlot];

  // Network status styling
  const statusStyle: Record<string, { bg: string; border: string; color: string }> = {
    normal:     { bg: '#dcfce7', border: '#86efac', color: '#16a34a' },
    warning:    { bg: '#fef3c7', border: '#fcd34d', color: '#d97706' },
    overloaded: { bg: '#fee2e2', border: '#fca5a5', color: '#dc2626' },
    solar:      { bg: '#dbeafe', border: '#93c5fd', color: '#2563eb' },
    inactive:   { bg: '#f3f4f6', border: '#d1d5db', color: '#6b7280' },
  };
  const ss = statusStyle[networkStatus] ?? statusStyle.normal;
  const statusLabel = {
    normal: '✓ Normal', warning: '⚠ High Demand',
    overloaded: '✕ Overloaded', solar: '☀ Solar', inactive: '— Inactive',
  }[networkStatus] ?? networkStatus;

  return (
    <div className="app">
      {showWelcome && <WelcomeScreen />}

      {/* ── Header ── */}
      <header className="app-header">
        <div className="header-brand">
          <div className="header-logo">⚡</div>
          <div>
            <div className="header-title">Adaptive Energy City</div>
            <div className="header-sub">Smart Energy Management Simulator</div>
          </div>
        </div>

        <div className="header-center">
          <div className="header-time">
            🕐 {current?.label ?? '--:--'}
          </div>
          <div
            className="network-status"
            style={{ background: ss.bg, borderColor: ss.border, color: ss.color }}
          >
            <span
              className={`status-dot ${networkStatus === 'overloaded' ? 'pulse' : ''}`}
              style={{ background: ss.color }}
            />
            City Grid: {statusLabel}
          </div>
          {status === 'shortage' && (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 20, padding: '3px 10px', fontSize: 10, color: '#dc2626', fontWeight: 700 }}>
              🚨 SHORTAGE ACTIVE
            </div>
          )}
        </div>

        <div className="header-actions">
          <button className="view-toggle-btn" onClick={toggleView} title="Toggle 3D/2D view">
            {view === '3d' ? '🗺️ 2D View' : '🏙️ 3D View'}
          </button>
          <span className="header-link" title="Educational simulator — not certified engineering software">
            ℹ️ Info
          </span>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="app-main">

        {/* Left sidebar – navigation + quick metrics */}
        <aside className="left-sidebar">
          <div className="sidebar-section">
            <div className="sidebar-section-title">Navigation</div>
            <nav className="sidebar-nav">
              {NAV_ITEMS.map(item => (
                <button
                  key={item.id}
                  className={`nav-item ${activeNav === item.id ? 'active' : ''}`}
                  onClick={() => setActiveNav(item.id)}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Quick summary metrics */}
          <div className="sidebar-metrics">
            <div className="sidebar-section-title" style={{ padding: '0 0 4px' }}>Live Summary</div>
            <div className="sidebar-metric">
              <span className="sm-icon">⚡</span>
              <div className="sm-body">
                <div className="sm-label">Total Demand</div>
                <div className="sm-value">
                  {current?.totalDemandKW ?? 0}<span className="sm-unit"> kW</span>
                </div>
              </div>
            </div>
            <div className="sidebar-metric">
              <span className="sm-icon">☀️</span>
              <div className="sm-body">
                <div className="sm-label">Solar Gen.</div>
                <div className="sm-value">
                  {current?.solarGenKW ?? 0}<span className="sm-unit"> kW</span>
                </div>
              </div>
            </div>
            <div className="sidebar-metric">
              <span className="sm-icon">🔌</span>
              <div className="sm-body">
                <div className="sm-label">Grid Import</div>
                <div className="sm-value" style={{ color: (current?.gridImportKW ?? 0) > gridCapacityKW ? '#dc2626' : undefined }}>
                  {current?.gridImportKW ?? 0}<span className="sm-unit"> kW</span>
                </div>
              </div>
            </div>
            <div className="sidebar-metric">
              <span className="sm-icon">💰</span>
              <div className="sm-body">
                <div className="sm-label">Tariff</div>
                <div className="sm-value">
                  ₹{(current?.priceRsPerKWh ?? 0).toFixed(2)}<span className="sm-unit">/kWh</span>
                </div>
              </div>
            </div>
            {result && result.remainingViolations > 0 && (
              <div className="sidebar-metric" style={{ border: '1px solid #fca5a5', background: '#fee2e2' }}>
                <span className="sm-icon">⚠️</span>
                <div className="sm-body">
                  <div className="sm-label">Violations</div>
                  <div className="sm-value" style={{ color: '#dc2626' }}>
                    {result.remainingViolations}
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Centre – city map + dashboard */}
        <div className="center-col">
          <div className="city-container">
            {/* Map hint */}
            <div className="map-hint">
              {view === '3d'
                ? '🏙️ Drag to rotate · Scroll to zoom · Click a building to inspect'
                : '🗺️ Click a building to inspect energy data'}
            </div>

            {/* 3D city */}
            <div style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, display: view === '3d' ? 'block' : 'none' }}>
              <Suspense fallback={
                <div className="city-loading">
                  <div className="loading-spinner" />
                  <span>Loading city map…</span>
                </div>
              }>
                <CityCanvas />
              </Suspense>
            </div>

            {/* 2D network view */}
            <div style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, display: view === '2d' ? 'block' : 'none' }}>
              <City2DView />
            </div>

            {/* Map legend */}
            <div className="map-legend">
              <div className="legend-title">Energy Status</div>
              <div className="legend-items">
                {[
                  { color: '#16a34a', label: 'Normal operation' },
                  { color: '#d97706', label: 'High demand / Warning' },
                  { color: '#dc2626', label: 'Overloaded / Shortage' },
                  { color: '#2563eb', label: 'Solar generation' },
                  { color: '#9ca3af', label: 'Inactive / Deferred' },
                ].map(({ color, label }) => (
                  <div key={label} className="legend-item">
                    <div className="legend-dot" style={{ background: color }} />
                    {label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Dashboard below city */}
          <Dashboard />
        </div>

        {/* Right panel – controls + inspector + decisions */}
        <aside className="right-col">
          <ControlPanel />
          <BuildingInspector />
          <DecisionPanel />
        </aside>
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <span>🏙️ Adaptive Energy City — Educational Energy Simulator</span>
        <span>⚠️ For planning & learning purposes only.</span>
        <span>React · Three.js · Recharts</span>
      </footer>
    </div>
  );
}
