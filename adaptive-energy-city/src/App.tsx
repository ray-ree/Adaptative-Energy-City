import React, { useEffect, Suspense, lazy, useState } from 'react';
import { useSimStore } from './store/simStore';
import Dashboard from './components/Dashboard';
import ControlPanel from './components/ControlPanel';
import DecisionPanel from './components/DecisionPanel';
import WelcomeScreen from './components/WelcomeScreen';
import City2DView from './components/City2DView';
import BuildingFocusView from './components/BuildingFocusView';
import EnergyMonitoringPage from './components/pages/EnergyMonitoringPage';
import ShortageAlertsPage   from './components/pages/ShortageAlertsPage';
import SchedulingPage       from './components/pages/SchedulingPage';
import ReportsPage          from './components/pages/ReportsPage';
import SettingsPage         from './components/pages/SettingsPage';

const CityCanvas = lazy(() => import('./components/CityCanvas'));

// ─── Nav definition ───────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'overview',    icon: '🏙️', label: 'City Overview'     },
  { id: 'monitoring',  icon: '📊', label: 'Energy Monitoring'  },
  { id: 'alerts',      icon: '🔔', label: 'Shortage Alerts'    },
  { id: 'scheduling',  icon: '📅', label: 'Scheduling'         },
  { id: 'reports',     icon: '📄', label: 'Reports'            },
  { id: 'settings',    icon: '⚙️', label: 'Settings'           },
] as const;
type NavId = (typeof NAV_ITEMS)[number]['id'];

export default function App() {
  const showWelcome       = useSimStore(s => s.showWelcome);
  const view              = useSimStore(s => s.view);
  const toggleView        = useSimStore(s => s.toggleView);
  const tick              = useSimStore(s => s.tick);
  const status            = useSimStore(s => s.status);
  const speedMultiplier   = useSimStore(s => s.speedMultiplier);
  const networkStatus     = useSimStore(s => s.networkStatus);
  const slots             = useSimStore(s => s.slots);
  const currentSlot       = useSimStore(s => s.currentSlot);
  const gridCapacityKW    = useSimStore(s => s.gridCapacityKW);
  const result            = useSimStore(s => s.schedulingResult);
  const selectedBuildingId = useSimStore(s => s.selectedBuildingId);
  const selectBuilding    = useSimStore(s => s.selectBuilding);

  const [activeNav, setActiveNav] = useState<NavId>('overview');
  // Track if we're in building focus mode
  const [focusMode, setFocusMode] = useState(false);

  // Simulation ticker
  useEffect(() => {
    if (status !== 'running' && status !== 'shortage') return;
    const id = setInterval(tick, Math.max(200, 2000 / speedMultiplier));
    return () => clearInterval(id);
  }, [status, speedMultiplier, tick]);

  // When a building is clicked in 3D, enter focus mode
  const handleBuildingClick = (id: string) => {
    selectBuilding(id);
    setFocusMode(true);
    // Ensure we're on overview so the focus view renders
    setActiveNav('overview');
  };

  // Exit focus mode
  const handleBackToCity = () => {
    setFocusMode(false);
    selectBuilding(null);
  };

  // When navigating away from overview, exit focus mode
  const handleNavClick = (id: NavId) => {
    setActiveNav(id);
    if (id !== 'overview') {
      setFocusMode(false);
    }
  };

  // Also exit focus mode if selectedBuildingId gets cleared externally
  useEffect(() => {
    if (!selectedBuildingId) setFocusMode(false);
  }, [selectedBuildingId]);

  const current = slots[currentSlot];

  // Status badge styling
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

  // ── Alert badge for nav items ──────────────────────────────────────────────
  const alertCount = result?.remainingViolations ?? 0;

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
          <div className="header-time">🕐 {current?.label ?? '--:--'}</div>
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
            <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:20, padding:'3px 10px', fontSize:10, color:'#dc2626', fontWeight:700 }}>
              🚨 SHORTAGE ACTIVE
            </div>
          )}
        </div>

        <div className="header-actions">
          {activeNav === 'overview' && !focusMode && (
            <button className="view-toggle-btn" onClick={toggleView} title="Toggle 3D/2D view">
              {view === '3d' ? '🗺️ 2D View' : '🏙️ 3D View'}
            </button>
          )}
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
                  className={`nav-item ${activeNav === item.id && !focusMode ? 'active' : ''}`}
                  onClick={() => handleNavClick(item.id)}
                  style={{ position: 'relative' }}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                  {/* Alert badge on Shortage Alerts nav */}
                  {item.id === 'alerts' && alertCount > 0 && (
                    <span style={{
                      position:'absolute', right:8, top:'50%', transform:'translateY(-50%)',
                      background:'#dc2626', color:'#fff', borderRadius:99, padding:'0 5px',
                      fontSize:10, fontWeight:700, lineHeight:'16px',
                    }}>
                      {alertCount}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>

          {/* Quick summary metrics */}
          <div className="sidebar-metrics">
            <div className="sidebar-section-title" style={{ padding:'0 0 4px' }}>Live Summary</div>
            <div className="sidebar-metric">
              <span className="sm-icon">⚡</span>
              <div className="sm-body">
                <div className="sm-label">Total Demand</div>
                <div className="sm-value">{current?.totalDemandKW ?? 0}<span className="sm-unit"> kW</span></div>
              </div>
            </div>
            <div className="sidebar-metric">
              <span className="sm-icon">☀️</span>
              <div className="sm-body">
                <div className="sm-label">Solar Gen.</div>
                <div className="sm-value">{current?.solarGenKW ?? 0}<span className="sm-unit"> kW</span></div>
              </div>
            </div>
            <div className="sidebar-metric">
              <span className="sm-icon">🔌</span>
              <div className="sm-body">
                <div className="sm-label">Grid Import</div>
                <div className="sm-value" style={{ color:(current?.gridImportKW ?? 0) > gridCapacityKW ? '#dc2626' : undefined }}>
                  {current?.gridImportKW ?? 0}<span className="sm-unit"> kW</span>
                </div>
              </div>
            </div>
            <div className="sidebar-metric">
              <span className="sm-icon">💰</span>
              <div className="sm-body">
                <div className="sm-label">Tariff</div>
                <div className="sm-value">₹{(current?.priceRsPerKWh ?? 0).toFixed(2)}<span className="sm-unit">/kWh</span></div>
              </div>
            </div>
            {result && result.remainingViolations > 0 && (
              <div className="sidebar-metric" style={{ border:'1px solid #fca5a5', background:'#fee2e2' }}>
                <span className="sm-icon">⚠️</span>
                <div className="sm-body">
                  <div className="sm-label">Violations</div>
                  <div className="sm-value" style={{ color:'#dc2626' }}>{result.remainingViolations}</div>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* ── Centre column – page content ── */}
        <div className="center-col">

          {/* ── BUILDING FOCUS MODE ── */}
          {activeNav === 'overview' && focusMode && selectedBuildingId && (
            <BuildingFocusView onBack={handleBackToCity} />
          )}

          {/* ── CITY OVERVIEW (normal mode) ── */}
          {activeNav === 'overview' && !focusMode && (
            <>
              <div className="city-container">
                <div className="map-hint">
                  {view === '3d'
                    ? '🏙️ Drag to rotate · Scroll to zoom · Click a building to inspect'
                    : '🗺️ Click a building to inspect energy data'}
                </div>

                {/* 3D city */}
                <div style={{ width:'100%', height:'100%', position:'absolute', inset:0, display: view === '3d' ? 'block' : 'none' }}>
                  <Suspense fallback={
                    <div className="city-loading">
                      <div className="loading-spinner" />
                      <span>Loading city map…</span>
                    </div>
                  }>
                    {/* Pass building-click handler to override default select */}
                    <CityCanvasWithFocus onBuildingClick={handleBuildingClick} />
                  </Suspense>
                </div>

                {/* 2D network view */}
                <div style={{ width:'100%', height:'100%', position:'absolute', inset:0, display: view === '2d' ? 'block' : 'none' }}>
                  <City2DView />
                </div>

                {/* Map legend */}
                <div className="map-legend">
                  <div className="legend-title">Energy Status</div>
                  <div className="legend-items">
                    {[
                      { color:'#16a34a', label:'Normal operation' },
                      { color:'#d97706', label:'High demand / Warning' },
                      { color:'#dc2626', label:'Overloaded / Shortage' },
                      { color:'#2563eb', label:'Solar generation' },
                      { color:'#9ca3af', label:'Inactive / Deferred' },
                    ].map(({ color, label }) => (
                      <div key={label} className="legend-item">
                        <div className="legend-dot" style={{ background:color }} />
                        {label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <Dashboard />
            </>
          )}

          {/* ── OTHER PAGES ── */}
          {activeNav === 'monitoring' && <EnergyMonitoringPage />}
          {activeNav === 'alerts'     && <ShortageAlertsPage />}
          {activeNav === 'scheduling' && <SchedulingPage />}
          {activeNav === 'reports'    && <ReportsPage />}
          {activeNav === 'settings'   && <SettingsPage />}
        </div>

        {/* Right panel – controls + decisions (overview only, not in focus mode) */}
        {activeNav === 'overview' && !focusMode && (
          <aside className="right-col">
            <ControlPanel />
            <DecisionPanel />
          </aside>
        )}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <span>🏙️ Adaptive Energy City — Educational Energy Simulator</span>
        <span>⚠️ For planning &amp; learning purposes only.</span>
        <span>React · Three.js · Recharts</span>
      </footer>
    </div>
  );
}

// ─── Wrapper that intercepts building clicks to trigger focus mode ─────────────
function CityCanvasWithFocus({ onBuildingClick }: { onBuildingClick: (id: string) => void }) {
  const selectBuilding = useSimStore(s => s.selectBuilding);

  // Override selectBuilding in the store temporarily via a wrapper
  // We inject a custom click handler via a context or prop drilling.
  // Since CityCanvas reads selectBuilding directly from the store, we
  // monkey-patch the selectBuilding call via a render wrapper approach.
  // The cleanest solution: CityCanvas calls selectBuilding(id) and we
  // listen to selectedBuildingId changes here, triggering focusMode.
  useEffect(() => {
    // Patch: override selectBuilding in the store to also call onBuildingClick
    const orig = useSimStore.getState().selectBuilding;
    useSimStore.setState({
      selectBuilding: (id) => {
        orig(id);
        if (id) onBuildingClick(id);
      },
    });
    return () => {
      useSimStore.setState({ selectBuilding: orig });
    };
  }, [onBuildingClick]);

  return (
    <Suspense fallback={
      <div className="city-loading">
        <div className="loading-spinner" />
        <span>Loading city map…</span>
      </div>
    }>
      <CityCanvas />
    </Suspense>
  );
}
