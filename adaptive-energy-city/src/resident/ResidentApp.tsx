/**
 * ResidentApp — Resident Energy Dashboard
 * ==========================================
 * Route: /Adaptative-Energy-City/resident
 *
 * Shows live energy data, forecasts, alerts, and schedules
 * specific to ONE resident's building only.
 * Data isolation is enforced by the backend — each resident_id
 * maps to exactly one building_id.
 */
import React, { useState, useEffect, useId } from 'react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import { useResidentStream } from './useResidentStream';

const API = 'http://127.0.0.1:8000';

const BUILDINGS = [
  { id: 'b_hospital',     label: '🏥 City Hospital',          type: 'hospital'    },
  { id: 'b_factory_a',    label: '🏭 Smart Factory A',        type: 'factory'     },
  { id: 'b_office_tower', label: '🏢 Sunrise Office Tower',   type: 'office'      },
  { id: 'b_mall',         label: '🏪 Galaxy Shopping Mall',   type: 'mall'        },
  { id: 'b_residential',  label: '🏠 Green Residences',       type: 'residential' },
];

// ── Persisted resident ID (localStorage) ──────────────────────────────────────
function useResidentId() {
  const [id, setId] = useState<string | null>(() => localStorage.getItem('resident_id'));
  const save = (newId: string) => { localStorage.setItem('resident_id', newId); setId(newId); };
  const clear = () => { localStorage.removeItem('resident_id'); setId(null); };
  return { id, save, clear };
}

// ── Onboarding screen ─────────────────────────────────────────────────────────
function OnboardingScreen({ onDone }: { onDone: (residentId: string) => void }) {
  const [name,     setName]     = useState('');
  const [bldId,    setBldId]    = useState('b_residential');
  const [loading,  setLoading]  = useState(false);
  const [err,      setErr]      = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setErr('Please enter your name.'); return; }
    setLoading(true); setErr('');
    const resident_id = `r_${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
    try {
      const res = await fetch(`${API}/api/resident/onboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resident_id, building_id: bldId }),
      });
      if (!res.ok) throw new Error(await res.text());
      onDone(resident_id);
    } catch (e: any) {
      setErr(e.message?.includes('fetch') ?
        'Cannot reach backend. Run:  cd backend && python api.py' :
        (e.message ?? 'Unknown error'));
    } finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(135deg,#1a2744 0%,#0f4c75 50%,#1b6ca8 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter,system-ui,sans-serif',
    }}>
      <div style={{ background:'#fff', borderRadius:20, padding:40, width:460, boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ fontSize:40, textAlign:'center', marginBottom:8 }}>🏠</div>
        <h1 style={{ textAlign:'center', fontSize:22, fontWeight:800, color:'#1a2744', margin:'0 0 4px' }}>
          Resident Energy Dashboard
        </h1>
        <p style={{ textAlign:'center', fontSize:12, color:'#6b7280', marginBottom:28 }}>
          ⚠ Simulated data — for demonstration only
        </p>

        <form onSubmit={handleSubmit}>
          <label style={labelStyle}>Your Name</label>
          <input style={inputStyle} value={name} onChange={e=>setName(e.target.value)}
            placeholder="e.g. Ravi Kumar" autoFocus />

          <label style={labelStyle}>Select Your Building</label>
          <select style={inputStyle} value={bldId} onChange={e=>setBldId(e.target.value)}>
            {BUILDINGS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>

          {err && (
            <div style={{ background:'#fee2e2', color:'#dc2626', borderRadius:8, padding:'10px 12px',
              fontSize:12, marginBottom:12, border:'1px solid #fca5a5' }}>
              {err}
            </div>
          )}

          <button type="submit" disabled={loading} style={submitBtnStyle}>
            {loading ? '⏳ Connecting…' : '🚀 Enter Dashboard'}
          </button>
        </form>

        <div style={{ marginTop:20, textAlign:'center', fontSize:11, color:'#9ca3af' }}>
          Backend must be running at <code style={{ background:'#f3f4f6', padding:'1px 4px', borderRadius:4 }}>
            http://127.0.0.1:8000</code>
          <br />
          <code style={{ background:'#f3f4f6', padding:'2px 6px', borderRadius:4, marginTop:4, display:'inline-block' }}>
            cd backend &amp;&amp; python api.py
          </code>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display:'block', fontSize:12, fontWeight:700, color:'#374151', marginBottom:6, marginTop:16,
};
const inputStyle: React.CSSProperties = {
  width:'100%', padding:'10px 12px', borderRadius:8, border:'1.5px solid #d1d5db',
  fontSize:14, fontFamily:'inherit', boxSizing:'border-box', outline:'none',
};
const submitBtnStyle: React.CSSProperties = {
  marginTop:20, width:'100%', padding:'12px', borderRadius:10, border:'none',
  background:'linear-gradient(135deg,#1b6ca8,#0f4c75)', color:'#fff',
  fontWeight:700, fontSize:15, cursor:'pointer', letterSpacing:'0.02em',
};

// ── Risk badge ─────────────────────────────────────────────────────────────────
function RiskBadge({ cat }: { cat: string }) {
  const c: Record<string,{bg:string;fg:string}> = {
    Low:    {bg:'#dcfce7',fg:'#16a34a'},
    Medium: {bg:'#fef3c7',fg:'#d97706'},
    High:   {bg:'#fee2e2',fg:'#dc2626'},
  };
  const s = c[cat] ?? {bg:'#f3f4f6',fg:'#6b7280'};
  return <span style={{background:s.bg,color:s.fg,borderRadius:99,padding:'2px 10px',fontSize:11,fontWeight:700}}>{cat}</span>;
}

// ── Stat card ──────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, unit, color='#1a2744', sub }:
  { icon:string; label:string; value:string|number; unit?:string; color?:string; sub?:React.ReactNode }) {
  return (
    <div style={{ background:'#fff', borderRadius:14, padding:'16px 18px', boxShadow:'0 2px 8px rgba(0,0,0,0.07)',
      border:'1px solid #e8ecf0', flex:1, minWidth:130 }}>
      <div style={{ fontSize:22, marginBottom:4 }}>{icon}</div>
      <div style={{ fontSize:11, fontWeight:600, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.06em' }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:800, color, marginTop:2 }}>
        {value}<span style={{ fontSize:13, fontWeight:500, color:'#9ca3af', marginLeft:3 }}>{unit}</span>
      </div>
      {sub && <div style={{ fontSize:10, color:'#9ca3af', marginTop:2 }}>{sub}</div>}
    </div>
  );
}

// ── Chart tooltip ──────────────────────────────────────────────────────────────
function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'#fff', border:'1px solid #e4e1db', borderRadius:8, padding:'8px 12px', fontSize:11 }}>
      <div style={{ fontWeight:700, marginBottom:4 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color }}>
          {p.name}: <strong>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</strong>
        </div>
      ))}
    </div>
  );
}

// ── Main resident dashboard ───────────────────────────────────────────────────
function ResidentDashboard({ residentId, onLogout }:
  { residentId: string; onLogout: () => void }) {
  const { snapshot, alerts, schedule, forecast, connected, backendOnline, lastUpdated, streamError }
    = useResidentStream(residentId);

  const bldName = snapshot?.building_name ?? 'Loading…';
  const lastTs  = lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '—';

  // Forecast chart data
  const demandData = forecast.map(f => ({
    time: f.timestamp?.slice(11,16),
    'Demand (kW)':  f.pred_demand_kw,
    'Solar (kW)':   f.pred_solar_kw,
    'Capacity':     f.grid_capacity_kw,
  }));

  const tariffData = forecast.map(f => ({
    time: f.timestamp?.slice(11,16),
    'Tariff ₹/kWh': f.pred_tariff,
    color: f.pred_tariff >= 14 ? '#dc2626' : f.pred_tariff >= 8 ? '#d97706' : '#16a34a',
  }));

  const riskData = forecast.map(f => ({
    time: f.timestamp?.slice(11,16),
    'Risk %': Math.round(f.shortage_prob * 100),
    color: f.risk_color,
  }));

  return (
    <div style={{ minHeight:'100vh', background:'#f4f6f9', fontFamily:'Inter,system-ui,sans-serif' }}>

      {/* ── Top bar ── */}
      <header style={{ background:'#fff', borderBottom:'1px solid #e4e1db', padding:'12px 24px',
        display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:100 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ fontSize:28, fontWeight:900, color:'#1a2744' }}>⚡</div>
          <div>
            <div style={{ fontWeight:800, fontSize:16, color:'#1a2744' }}>Resident Energy Dashboard</div>
            <div style={{ fontSize:11, color:'#6b7280' }}>{bldName} · {residentId.split('_')[1]?.replace(/_/g,' ') ?? residentId}</div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          {/* Live indicator */}
          <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, fontWeight:600,
            color: connected ? '#16a34a' : '#dc2626' }}>
            <div style={{ width:8, height:8, borderRadius:'50%',
              background: connected ? '#16a34a' : '#dc2626',
              animation: connected ? 'pulse 2s infinite' : 'none' }} />
            {connected ? `Live · ${lastTs}` : 'Reconnecting…'}
          </div>
          <div style={{ background:'#fef3c7', border:'1px solid #fcd34d', borderRadius:20,
            padding:'3px 10px', fontSize:10, fontWeight:700, color:'#d97706' }}>
            ⚠ SIMULATED
          </div>
          <button onClick={onLogout} style={{ padding:'6px 14px', borderRadius:8, border:'1px solid #d1d5db',
            background:'#fff', fontSize:12, cursor:'pointer', color:'#374151' }}>
            ← Switch Building
          </button>
        </div>
      </header>

      <div style={{ maxWidth:1280, margin:'0 auto', padding:'20px 24px' }}>

        {/* ── Backend offline warning ── */}
        {!backendOnline && (
          <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:12, padding:'14px 18px',
            marginBottom:16, color:'#dc2626', fontSize:13 }}>
            <strong>🔌 Backend offline.</strong> Start it with:{' '}
            <code style={{ background:'#fff', padding:'2px 6px', borderRadius:4 }}>cd backend &amp;&amp; python api.py</code>
            {streamError && <div style={{ marginTop:4, fontSize:11 }}>{streamError}</div>}
          </div>
        )}

        {/* ── Shortage alerts ── */}
        {alerts.length > 0 && (
          <div style={{ marginBottom:16 }}>
            {alerts.slice(0, 3).map(a => (
              <div key={a.alert_id} style={{
                background: a.risk_level === 'High' ? '#fff1f2' : '#fffbeb',
                border: `1px solid ${a.risk_level === 'High' ? '#fca5a5' : '#fcd34d'}`,
                borderLeft: `4px solid ${a.risk_level === 'High' ? '#dc2626' : '#d97706'}`,
                borderRadius:12, padding:'14px 18px', marginBottom:8,
                display:'flex', gap:12, alignItems:'flex-start',
              }}>
                <div style={{ fontSize:24 }}>{a.risk_level === 'High' ? '🚨' : '⚠️'}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:13, color:'#1a2744' }}>
                    {a.risk_level} shortage risk · {a.window_label} warning · {a.predicted_time?.slice(11,16)}
                  </div>
                  <div style={{ fontSize:12, color:'#4b5563', marginTop:3 }}>
                    Predicted demand <strong>{a.pred_demand_kw} kW</strong> vs capacity <strong>{a.capacity_kw} kW</strong>
                    {a.deficit_kw > 0 && <> · Deficit: <strong style={{color:'#dc2626'}}>{a.deficit_kw} kW</strong></>}
                  </div>
                  {a.action && <div style={{ fontSize:11, color:'#6b7280', marginTop:4 }}>💡 {a.action}</div>}
                </div>
                <RiskBadge cat={a.risk_level} />
              </div>
            ))}
          </div>
        )}

        {/* ── Live KPI row ── */}
        {snapshot && (
          <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:16 }}>
            <StatCard icon="⚡" label="Live Demand"   value={snapshot.current_demand_kw.toFixed(1)} unit="kW" color="#d97706" />
            <StatCard icon="☀️" label="Solar Now"     value={snapshot.current_solar_kw.toFixed(1)}  unit="kW" color="#2563eb" />
            <StatCard icon="🔌" label="Grid Import"   value={snapshot.current_import_kw.toFixed(1)} unit="kW"
              color={snapshot.current_import_kw > snapshot.grid_capacity_kw * 0.9 ? '#dc2626' : '#374151'} />
            <StatCard icon="💰" label="Tariff Now"    value={`₹${snapshot.current_tariff}`}  color="#7c3aed" sub="per kWh (simulated)" />
            <StatCard icon="📊" label="Grid Capacity" value={snapshot.grid_capacity_kw} unit="kW" />
            <StatCard icon="🔴" label="24h Risk"      value={`${(snapshot.max_risk_24h*100).toFixed(0)}%`}
              color={snapshot.max_risk_24h > 0.6 ? '#dc2626' : snapshot.max_risk_24h > 0.25 ? '#d97706' : '#16a34a'}
              sub={`Risk: ${snapshot.risk_category}`} />
          </div>
        )}

        {/* ── Forecast charts ── */}
        {forecast.length > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:14, marginBottom:16 }}>

            {/* Demand chart */}
            <div style={{ background:'#fff', borderRadius:14, padding:'16px', boxShadow:'0 2px 8px rgba(0,0,0,0.07)', border:'1px solid #e8ecf0' }}>
              <div style={{ fontWeight:700, fontSize:13, color:'#1a2744', marginBottom:12 }}>📈 24-Hour Demand Forecast</div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={demandData}>
                  <defs>
                    <linearGradient id="gD" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#d97706" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#d97706" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                  <XAxis dataKey="time" tick={{fontSize:9}} interval={3}/>
                  <YAxis tick={{fontSize:9}}/>
                  <Tooltip content={<ChartTip/>}/>
                  <Legend wrapperStyle={{fontSize:10}}/>
                  <Area type="monotone" dataKey="Demand (kW)" stroke="#d97706" fill="url(#gD)" strokeWidth={2} dot={false}/>
                  <Line type="monotone" dataKey="Solar (kW)"  stroke="#2563eb" strokeWidth={1.5} dot={false}/>
                  <Line type="monotone" dataKey="Capacity"    stroke="#dc2626" strokeDasharray="4 2" strokeWidth={1} dot={false}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Tariff chart */}
            <div style={{ background:'#fff', borderRadius:14, padding:'16px', boxShadow:'0 2px 8px rgba(0,0,0,0.07)', border:'1px solid #e8ecf0' }}>
              <div style={{ fontWeight:700, fontSize:13, color:'#1a2744', marginBottom:12 }}>💰 Predicted Tariff</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={tariffData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                  <XAxis dataKey="time" tick={{fontSize:9}} interval={4}/>
                  <YAxis tick={{fontSize:9}}/>
                  <Tooltip content={<ChartTip/>}/>
                  <Bar dataKey="Tariff ₹/kWh" radius={[3,3,0,0]}>
                    {tariffData.map((d,i)=><Cell key={i} fill={d.color}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div style={{fontSize:9,color:'#9ca3af',marginTop:4}}>🔴 Peak ₹14 · 🟡 Mid ₹8 · 🟢 Off-peak ₹4–6 (SIMULATED)</div>
            </div>

            {/* Risk chart */}
            <div style={{ background:'#fff', borderRadius:14, padding:'16px', boxShadow:'0 2px 8px rgba(0,0,0,0.07)', border:'1px solid #e8ecf0' }}>
              <div style={{ fontWeight:700, fontSize:13, color:'#1a2744', marginBottom:12 }}>⚠ Shortage Risk %</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={riskData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                  <XAxis dataKey="time" tick={{fontSize:9}} interval={4}/>
                  <YAxis domain={[0,100]} tick={{fontSize:9}}/>
                  <Tooltip content={<ChartTip/>}/>
                  <ReferenceLine y={60} stroke="#dc2626" strokeDasharray="3 2"/>
                  <ReferenceLine y={25} stroke="#d97706" strokeDasharray="3 2"/>
                  <Bar dataKey="Risk %" radius={[3,3,0,0]}>
                    {riskData.map((d,i)=><Cell key={i} fill={d.color}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── Bottom row: schedule + alerts table ── */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>

          {/* Recommended schedule */}
          <div style={{ background:'#fff', borderRadius:14, padding:'16px', boxShadow:'0 2px 8px rgba(0,0,0,0.07)', border:'1px solid #e8ecf0' }}>
            <div style={{ fontWeight:700, fontSize:13, color:'#1a2744', marginBottom:4 }}>
              📅 Adaptive Schedule {schedule ? `(v${schedule.version})` : ''}
            </div>
            <div style={{ fontSize:10, color:'#9ca3af', marginBottom:10 }}>
              ⚠ Recommended schedule only — no physical device control.
              {schedule?.trigger === 'auto' && ' Auto-updated due to forecast change.'}
            </div>
            {schedule ? (
              <>
                <div style={{ display:'flex', gap:10, marginBottom:12 }}>
                  {[
                    {label:'Original cost',   val:`₹${schedule.original_cost_rs}`, color:'#d97706'},
                    {label:'Revised cost',    val:`₹${schedule.revised_cost_rs}`,  color:'#16a34a'},
                    {label:'Estimated saving',val:`₹${schedule.saving_rs}`,        color:'#7c3aed'},
                  ].map(s=>(
                    <div key={s.label} style={{flex:1,background:'#f8f7f5',borderRadius:10,padding:'8px',textAlign:'center'}}>
                      <div style={{fontSize:10,color:'#6b7280'}}>{s.label}</div>
                      <div style={{fontSize:15,fontWeight:800,color:s.color}}>{s.val}</div>
                    </div>
                  ))}
                </div>
                {schedule.rescheduled.length > 0 ? (
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                    <thead>
                      <tr style={{borderBottom:'1px solid #e8ecf0'}}>
                        {['From','To','Load (kW)','Saving (₹)','Reason'].map(h=>(
                          <th key={h} style={{textAlign:'left',padding:'4px 6px',color:'#6b7280',fontWeight:600,fontSize:10}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {schedule.rescheduled.map((r,i)=>(
                        <tr key={i} style={{borderBottom:'1px solid #f5f5f5'}}>
                          <td style={{padding:'5px 6px',color:'#dc2626',fontWeight:600}}>{r.from_ts?.slice(11,16)}</td>
                          <td style={{padding:'5px 6px',color:'#16a34a',fontWeight:600}}>{r.to_ts?.slice(11,16)}</td>
                          <td style={{padding:'5px 6px'}}>{r.flex_kw}</td>
                          <td style={{padding:'5px 6px',color:'#7c3aed',fontWeight:600}}>₹{r.saving_rs}</td>
                          <td style={{padding:'5px 6px',color:'#6b7280',fontSize:10,maxWidth:180}}>{r.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{textAlign:'center',color:'#16a34a',fontWeight:600,padding:16}}>
                    ✅ No rescheduling needed — conditions are optimal.
                  </div>
                )}
                {!schedule.feasible && (
                  <div style={{background:'#fee2e2',color:'#dc2626',borderRadius:8,padding:'8px 12px',marginTop:10,fontSize:11,fontWeight:600}}>
                    ⚠ Infeasible: essential demand alone exceeds available grid capacity.
                    Scheduling cannot resolve this — notify the grid operator.
                  </div>
                )}
              </>
            ) : (
              <div style={{textAlign:'center',color:'#9ca3af',padding:24}}>
                {backendOnline ? '⏳ Waiting for initial schedule…' : '🔌 Connect backend to see schedule'}
              </div>
            )}
          </div>

          {/* Alert history */}
          <div style={{ background:'#fff', borderRadius:14, padding:'16px', boxShadow:'0 2px 8px rgba(0,0,0,0.07)', border:'1px solid #e8ecf0' }}>
            <div style={{ fontWeight:700, fontSize:13, color:'#1a2744', marginBottom:10 }}>
              🔔 Alert History ({alerts.length})
            </div>
            {alerts.length === 0 ? (
              <div style={{textAlign:'center',color:'#16a34a',fontWeight:600,padding:24}}>
                ✅ No alerts — grid conditions look good.
              </div>
            ) : (
              <div style={{maxHeight:280,overflowY:'auto'}}>
                {alerts.map(a=>(
                  <div key={a.alert_id} style={{
                    borderLeft:`3px solid ${a.risk_level==='High'?'#dc2626':'#d97706'}`,
                    paddingLeft:10, marginBottom:10, paddingBottom:10,
                    borderBottom:'1px solid #f5f5f5',
                  }}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <span style={{fontWeight:700,fontSize:12,color:'#1a2744'}}>
                        {a.window_label} warning · {a.predicted_time?.slice(11,16)}
                      </span>
                      <RiskBadge cat={a.risk_level}/>
                    </div>
                    <div style={{fontSize:11,color:'#4b5563',marginTop:3}}>
                      Demand {a.pred_demand_kw} kW · Cap {a.capacity_kw} kW
                      {a.deficit_kw>0 && <span style={{color:'#dc2626'}}> · Deficit {a.deficit_kw} kW</span>}
                    </div>
                    {a.action && <div style={{fontSize:10,color:'#6b7280',marginTop:2}}>💡 {a.action}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ marginTop:20, textAlign:'center', fontSize:10, color:'#9ca3af' }}>
          ⚠ All data is SYNTHETIC / SIMULATED. Not real energy measurements or market prices.
          Adaptive Energy City · Resident Dashboard
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}

// ── Root component ─────────────────────────────────────────────────────────────
export default function ResidentApp() {
  const { id: residentId, save, clear } = useResidentId();

  if (!residentId) {
    return <OnboardingScreen onDone={save} />;
  }
  return <ResidentDashboard residentId={residentId} onLogout={clear} />;
}
