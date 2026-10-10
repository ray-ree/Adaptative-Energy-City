/**
 * ForecastingPage — ML-powered 24-hour energy forecasts
 * ========================================================
 * Connects to the Python FastAPI backend at port 8000.
 * Displays demand forecast, tariff chart, shortage-risk timeline,
 * model metrics, and forecast-aware schedule recommendations.
 */
import React, { useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import { useForecast } from '../../hooks/useForecast';

const BUILDINGS = [
  { id: 'b_hospital',     label: '🏥 City Hospital'        },
  { id: 'b_factory_a',    label: '🏭 Smart Factory A'       },
  { id: 'b_office_tower', label: '🏢 Sunrise Office Tower'   },
  { id: 'b_mall',         label: '🏪 Galaxy Shopping Mall'   },
  { id: 'b_residential',  label: '🏠 Green Residences'       },
];

// ── Tooltip ──────────────────────────────────────────────────────────────────
function Tip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'#fff', border:'1px solid #e4e1db', borderRadius:8, padding:'8px 12px', fontSize:11 }}>
      <div style={{ fontWeight:700, marginBottom:4 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color }}>
          {p.name}: <strong>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</strong>
          {p.dataKey?.includes('kw') || p.dataKey?.includes('demand') || p.dataKey?.includes('solar') || p.dataKey?.includes('import') ? ' kW' : ''}
        </div>
      ))}
    </div>
  );
}

// ── Risk badge ────────────────────────────────────────────────────────────────
function RiskBadge({ cat }: { cat: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    Low:    { bg: '#dcfce7', color: '#16a34a' },
    Medium: { bg: '#fef3c7', color: '#d97706' },
    High:   { bg: '#fee2e2', color: '#dc2626' },
  };
  const s = colors[cat] ?? { bg: '#f3f4f6', color: '#6b7280' };
  return (
    <span style={{ background: s.bg, color: s.color, borderRadius: 99, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
      {cat}
    </span>
  );
}

// ── Metrics table ─────────────────────────────────────────────────────────────
function MetricsPanel({ metrics }: { metrics: any }) {
  const bldId = Object.keys(metrics.buildings ?? {})[0];
  const bm    = metrics.buildings?.[bldId];
  if (!bm) return null;
  return (
    <div className="table-card" style={{ marginTop: 14 }}>
      <div className="table-card-title">🔬 Model Evaluation (Test Set — Synthetic Data)</div>
      <div style={{ padding: '10px 14px', fontSize: 12, color: '#d97706', fontWeight: 600, background: '#fffbeb', borderBottom: '1px solid #e4e1db' }}>
        ⚠ Metrics are measured on synthetic simulated data. They do NOT reflect real-world forecasting accuracy.
      </div>
      <table className="data-table">
        <thead>
          <tr><th>Model</th><th>Metric</th><th>ML Model</th><th>Baseline</th><th>Notes</th></tr>
        </thead>
        <tbody>
          {Object.entries(metrics.buildings).map(([bid, m]: [string, any]) => (
            <React.Fragment key={bid}>
              <tr style={{ background: '#f8f7f5' }}>
                <td colSpan={5} style={{ fontWeight: 700, fontSize: 11, color: '#6b7280', textTransform: 'uppercase' }}>
                  {bid.replace('b_','').replace('_',' ')}
                </td>
              </tr>
              <tr>
                <td>Demand Forecast</td>
                <td>MAE / RMSE (kW)</td>
                <td style={{ color: '#16a34a', fontWeight: 600 }}>
                  {m.demand.model_mae_kw} / {m.demand.model_rmse_kw}
                </td>
                <td style={{ color: '#d97706' }}>{m.demand.baseline_mae_kw}</td>
                <td style={{ fontSize: 10, color: '#6b7280' }}>
                  {m.demand.improvement_pct}% better than same-hour-yesterday
                </td>
              </tr>
              <tr>
                <td>Price Peak</td>
                <td>F1 / AUC</td>
                <td style={{ color: '#16a34a', fontWeight: 600 }}>
                  {m.price_peak.f1} / {m.price_peak.roc_auc}
                </td>
                <td>—</td>
                <td style={{ fontSize: 10, color: '#6b7280' }}>{m.price_peak.note?.slice(0, 60)}</td>
              </tr>
              <tr>
                <td>Shortage Risk</td>
                <td>F1 / AUC</td>
                <td style={{ color: '#16a34a', fontWeight: 600 }}>
                  {m.shortage_risk.f1} / {m.shortage_risk.roc_auc}
                </td>
                <td>—</td>
                <td style={{ fontSize: 10, color: '#6b7280' }}>Threshold 0.40 for safety</td>
              </tr>
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Risk heatmap ──────────────────────────────────────────────────────────────
function RiskHeatmap({ forecast }: { forecast: any[] }) {
  if (!forecast.length) return null;
  return (
    <div className="chart-card" style={{ marginTop: 14 }}>
      <div className="chart-card-title">🗓 24-Hour Risk Heatmap</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '8px 0' }}>
        {forecast.map((f, i) => (
          <div key={i} title={`${f.timestamp?.slice(11,16)} — ${f.risk_category} (prob: ${(f.shortage_prob*100).toFixed(0)}%)`}
            style={{
              width: 28, height: 28, borderRadius: 6,
              background: f.risk_color ?? '#6b7280',
              opacity: 0.85,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, color: '#fff', fontWeight: 700,
              cursor: 'default',
            }}>
            {f.hour ?? '?'}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 11 }}>
        {[{ color:'#16a34a',label:'Low' },{ color:'#d97706',label:'Medium' },{ color:'#dc2626',label:'High' }].map(l => (
          <div key={l.label} style={{ display:'flex', alignItems:'center', gap:4 }}>
            <div style={{ width:12, height:12, borderRadius:3, background:l.color }} />
            {l.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ForecastingPage() {
  const [selectedBuilding, setSelectedBuilding] = useState('b_hospital');
  const {
    forecast, cityForecast, notifications,
    metrics, status, loading, error,
    backendOnline, refresh, generateDataset, trainModels,
  } = useForecast(selectedBuilding);

  const [training, setTraining] = useState(false);
  const [trainMsg, setTrainMsg] = useState('');

  const handleTrain = async () => {
    setTraining(true);
    setTrainMsg('Training… this may take 30–90 seconds.');
    try {
      const r = await trainModels();
      setTrainMsg('Training complete! Refreshing data…');
    } catch {
      setTrainMsg('Training failed. Check that backend is running.');
    }
    setTraining(false);
  };

  const handleGenerate = async () => {
    setTrainMsg('Generating dataset…');
    try {
      await generateDataset();
      setTrainMsg('Dataset generated. Now train models.');
    } catch {
      setTrainMsg('Generation failed. Check backend.');
    }
  };

  // Chart data
  const demandChartData = forecast.map(f => ({
    time:           f.timestamp?.slice(11, 16),
    'Predicted Demand': f.pred_demand_kw,
    'Predicted Solar':  f.pred_solar_kw,
    'Grid Import':      f.pred_grid_import_kw,
    'Grid Capacity':    f.grid_capacity_kw,
  }));

  const tariffChartData = forecast.map(f => ({
    time:   f.timestamp?.slice(11, 16),
    Tariff: f.pred_tariff,
    Peak:   f.price_peak ? f.pred_tariff : null,
  }));

  const riskChartData = forecast.map(f => ({
    time:            f.timestamp?.slice(11, 16),
    'Shortage Risk': Math.round(f.shortage_prob * 100),
    color:           f.risk_color,
  }));

  const cityChartData = cityForecast.map(f => ({
    time:           f.timestamp?.slice(11, 16),
    'City Demand':  f.total_demand_kw,
    'City Solar':   f.total_solar_kw,
    'Grid Import':  f.total_grid_import_kw,
    'Grid Capacity': f.city_grid_capacity_kw,
  }));

  return (
    <div className="page-content">
      {/* ── Header ── */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 className="page-title">🤖 ML Forecasting</h2>
          <p className="page-desc">24-hour machine-learning energy demand, tariff, and shortage-risk forecasts.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{
            background: backendOnline ? '#dcfce7' : '#fee2e2',
            border: `1px solid ${backendOnline ? '#86efac' : '#fca5a5'}`,
            borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700,
            color: backendOnline ? '#16a34a' : '#dc2626',
          }}>
            {backendOnline ? '🟢 Backend Online' : '🔴 Backend Offline'}
          </div>
          <button className="ctrl-btn" onClick={refresh} disabled={loading}>
            {loading ? '⏳ Loading…' : '🔄 Refresh'}
          </button>
        </div>
      </div>

      {/* ── Synthetic data banner ── */}
      <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 12 }}>
        <strong>⚠ SYNTHETIC DATA</strong> — All forecasts are generated from a simulated 365-day synthetic dataset.
        They do <strong>not</strong> represent real building demand or real electricity market prices.
        Metrics are measured on the simulated environment only.
      </div>

      {/* ── Backend offline error ── */}
      {error && (
        <div className="alert-banner" style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#dc2626', marginBottom: 16 }}>
          <div style={{ fontSize: 24 }}>⚠</div>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Python Backend Required</div>
            <div style={{ fontSize: 12 }}>{error}</div>
            <code style={{ fontSize: 11, background: '#fff', padding: '4px 8px', borderRadius: 6, marginTop: 6, display: 'inline-block' }}>
              cd backend &amp;&amp; python api.py
            </code>
          </div>
        </div>
      )}

      {/* ── Setup controls (if not ready) ── */}
      {backendOnline && status && (!status.dataset_exists || !status.models_trained) && (
        <div className="settings-card" style={{ marginBottom: 16 }}>
          <div className="settings-card-title">🛠 Setup Required</div>
          <div style={{ fontSize: 13, color: '#374151', marginBottom: 12 }}>
            {!status.dataset_exists && <div>1. Generate the synthetic dataset (43,800 rows, ~5 seconds)</div>}
            {!status.models_trained && <div>{!status.dataset_exists ? '2.' : '1.'} Train the ML models (15 models, ~60 seconds)</div>}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {!status.dataset_exists && (
              <button className="ctrl-btn warning" onClick={handleGenerate}>📊 Generate Dataset</button>
            )}
            {status.dataset_exists && !status.models_trained && (
              <button className="ctrl-btn success" onClick={handleTrain} disabled={training}>
                {training ? '⏳ Training…' : '🧠 Train ML Models'}
              </button>
            )}
          </div>
          {trainMsg && <div style={{ marginTop: 10, fontSize: 12, color: '#374151' }}>{trainMsg}</div>}
        </div>
      )}

      {/* ── Building selector ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Forecast for:</span>
        {BUILDINGS.map(b => (
          <button key={b.id}
            className={`speed-btn ${selectedBuilding === b.id ? 'active' : ''}`}
            onClick={() => setSelectedBuilding(b.id)}
            style={{ fontSize: 12 }}>
            {b.label}
          </button>
        ))}
      </div>

      {/* ── KPIs ── */}
      {forecast.length > 0 && (
        <div className="kpi-row">
          {[
            { label: 'Peak Demand (24h)', value: `${Math.max(...forecast.map(f=>f.pred_demand_kw)).toFixed(0)} kW`, color: '#d97706', icon: '⚡' },
            { label: 'Peak Solar (24h)',  value: `${Math.max(...forecast.map(f=>f.pred_solar_kw)).toFixed(0)} kW`,  color: '#2563eb', icon: '☀️' },
            { label: 'High Risk Hours',   value: `${forecast.filter(f=>f.risk_category==='High').length}`,           color: '#dc2626', icon: '🔴' },
            { label: 'Peak Tariff Hours', value: `${forecast.filter(f=>f.price_peak).length}`,                       color: '#d97706', icon: '💰' },
            { label: 'Min Margin',        value: `${Math.min(...forecast.map(f=>f.pred_margin_kw)).toFixed(0)} kW`, color: '#16a34a', icon: '📊' },
            { label: 'Model',             value: forecast[0]?.model_used ?? '—',                                     color: '#6b7280', icon: '🤖' },
          ].map(k => (
            <div key={k.label} className="kpi-card">
              <div className="kpi-icon">{k.icon}</div>
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-value" style={{ color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Charts ── */}
      {forecast.length > 0 && (
        <div className="charts-grid">

          {/* Demand chart */}
          <div className="chart-card" style={{ gridColumn: 'span 2' }}>
            <div className="chart-card-title">📈 24-Hour Demand Forecast — {BUILDINGS.find(b=>b.id===selectedBuilding)?.label}</div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={demandChartData}>
                <defs>
                  <linearGradient id="gDemand" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#d97706" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#d97706" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gSolar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#2563eb" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e1db" />
                <XAxis dataKey="time" tick={{ fill:'#64748b', fontSize:10 }} interval={2} />
                <YAxis tick={{ fill:'#64748b', fontSize:10 }} />
                <Tooltip content={<Tip />} />
                <Legend />
                <Area type="monotone" dataKey="Predicted Demand" stroke="#d97706" fill="url(#gDemand)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="Predicted Solar"  stroke="#2563eb" fill="url(#gSolar)"  strokeWidth={2} dot={false} />
                <Line  type="monotone" dataKey="Grid Capacity"   stroke="#dc2626" strokeDasharray="5 3" strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Tariff chart */}
          <div className="chart-card">
            <div className="chart-card-title">💰 Predicted Tariff (₹/kWh)</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={tariffChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e1db" />
                <XAxis dataKey="time" tick={{ fill:'#64748b', fontSize:9 }} interval={3} />
                <YAxis tick={{ fill:'#64748b', fontSize:9 }} />
                <Tooltip content={<Tip />} />
                <Bar dataKey="Tariff" radius={[3,3,0,0]}>
                  {tariffChartData.map((d, i) => (
                    <Cell key={i} fill={d.Tariff >= 14 ? '#dc2626' : d.Tariff >= 8 ? '#d97706' : '#16a34a'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>
              Red=Peak ₹14 · Amber=Mid ₹8 · Green=Off-peak ₹4–6 (SIMULATED rates)
            </div>
          </div>

          {/* Risk chart */}
          <div className="chart-card">
            <div className="chart-card-title">⚠ Shortage Risk Probability (%)</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={riskChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e1db" />
                <XAxis dataKey="time" tick={{ fill:'#64748b', fontSize:9 }} interval={3} />
                <YAxis domain={[0, 100]} tick={{ fill:'#64748b', fontSize:9 }} />
                <Tooltip content={<Tip />} />
                <ReferenceLine y={60} stroke="#dc2626" strokeDasharray="4 2" label={{ value:'High', fill:'#dc2626', fontSize:9 }} />
                <ReferenceLine y={25} stroke="#d97706" strokeDasharray="4 2" label={{ value:'Med', fill:'#d97706', fontSize:9 }} />
                <Bar dataKey="Shortage Risk" radius={[3,3,0,0]}>
                  {riskChartData.map((d, i) => (
                    <Cell key={i} fill={d.color ?? '#6b7280'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Risk heatmap ── */}
      {forecast.length > 0 && <RiskHeatmap forecast={forecast} />}

      {/* ── Upcoming alerts ── */}
      {forecast.length > 0 && (
        <div className="table-card" style={{ marginTop: 14 }}>
          <div className="table-card-title">📋 Upcoming High-Risk & High-Price Periods</div>
          <table className="data-table">
            <thead>
              <tr><th>Time</th><th>Demand (kW)</th><th>Solar (kW)</th><th>Grid Import</th><th>Tariff</th><th>Risk</th><th>Recommended Action</th></tr>
            </thead>
            <tbody>
              {forecast.filter(f => f.risk_category !== 'Low' || f.price_peak).map((f, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{f.timestamp?.slice(11, 16)}</td>
                  <td>{f.pred_demand_kw}</td>
                  <td style={{ color: '#2563eb' }}>{f.pred_solar_kw}</td>
                  <td style={{ color: f.pred_grid_import_kw > f.grid_capacity_kw * 0.9 ? '#dc2626' : '#374151', fontWeight: 600 }}>
                    {f.pred_grid_import_kw}
                  </td>
                  <td style={{ color: f.price_peak ? '#dc2626' : '#374151', fontWeight: f.price_peak ? 700 : 400 }}>
                    ₹{f.pred_tariff}
                  </td>
                  <td><RiskBadge cat={f.risk_category} /></td>
                  <td style={{ fontSize: 11, color: '#6b7280' }}>{f.action ?? '—'}</td>
                </tr>
              ))}
              {forecast.filter(f => f.risk_category !== 'Low' || f.price_peak).length === 0 && (
                <tr><td colSpan={7} style={{ textAlign:'center', color:'#16a34a', fontWeight:600 }}>✅ No high-risk or high-price periods in next 24h</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── City-level chart ── */}
      {cityForecast.length > 0 && (
        <div className="chart-card" style={{ marginTop: 14 }}>
          <div className="chart-card-title">🏙 City-Level 24h Forecast (All Buildings)</div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={cityChartData}>
              <defs>
                <linearGradient id="gCity" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#d97706" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#d97706" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e1db" />
              <XAxis dataKey="time" tick={{ fill:'#64748b', fontSize:10 }} interval={2} />
              <YAxis tick={{ fill:'#64748b', fontSize:10 }} />
              <Tooltip content={<Tip />} />
              <Legend />
              <Area type="monotone" dataKey="City Demand" stroke="#d97706" fill="url(#gCity)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="City Solar"  stroke="#2563eb" fill="none" strokeWidth={2} dot={false} strokeDasharray="4 2" />
              <Line  type="monotone" dataKey="Grid Capacity" stroke="#dc2626" strokeDasharray="4 3" strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Notifications ── */}
      {notifications.length > 0 && (
        <div className="table-card" style={{ marginTop: 14 }}>
          <div className="table-card-title">🔔 ML Forecast Notifications</div>
          {notifications.map(n => (
            <div key={n.id} style={{
              padding: '12px 16px', borderBottom: '1px solid #f0ede8',
              background: n.severity === 'high' ? '#fff8f8' : '#fffdf5',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: n.severity === 'high' ? '#dc2626' : '#d97706' }}>
                {n.message}
              </div>
              {n.action && (
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                  💡 {n.action}
                </div>
              )}
              <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>
                {n.timestamp?.slice(0, 16)} · {n.building}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Metrics ── */}
      {metrics && <MetricsPanel metrics={metrics} />}

      {/* ── Train button (when backend is online but models not yet shown) ── */}
      {backendOnline && status?.dataset_exists && !metrics && (
        <div style={{ marginTop: 14 }}>
          <button className="ctrl-btn success" onClick={handleTrain} disabled={training}>
            {training ? '⏳ Training…' : '🧠 Train ML Models'}
          </button>
          {trainMsg && <div style={{ marginTop: 8, fontSize: 12 }}>{trainMsg}</div>}
        </div>
      )}
    </div>
  );
}
