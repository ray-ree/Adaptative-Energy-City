/**
 * BuildingFocusView — immersive single-building inspection mode.
 * Shows a dedicated 3D close-up, energy stats, appliance schedule, and scheduling decisions.
 */
import React, { Suspense, useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useSimStore } from '../store/simStore';
import type { Building, Device } from '../types/energy';

// ─── Colour helpers ───────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  normal:     '#16a34a',
  warning:    '#d97706',
  overloaded: '#dc2626',
  solar:      '#2563eb',
  inactive:   '#6b7280',
};
const BUILDING_PALETTE = [
  '#e8e2d6','#ddd8cc','#d4cfc3','#ccc7bc','#c4bfb4',
  '#d8d3c8','#e0dbd0','#cdc9be','#bfbbb1','#c9c5ba',
];
function seededColor(id: string) {
  const s = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return BUILDING_PALETTE[s % BUILDING_PALETTE.length];
}
const PRIORITY_COLOR: Record<string, string> = {
  critical:   '#dc2626',
  high:       '#d97706',
  flexible:   '#2563eb',
  deferrable: '#6b7280',
};
function slotTime(s: number) {
  const m = s * 15;
  return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
}

// ─── Miniature 3D building model ─────────────────────────────────────────────
function FocusModel({ building }: { building: Building }) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const baseColor = seededColor(building.id);

  const dims: [number,number,number] = useMemo(() => {
    const m: Record<string,[number,number,number]> = {
      hospital:    [2.2,3.8,2.0],
      factory:     [3.2,1.6,2.6],
      office:      [1.6,5.5,1.6],
      mall:        [3.4,1.2,3.4],
      residential: [1.4,2.4,1.4],
      solar_farm:  [2.8,0.2,2.8],
      substation:  [1.2,1.2,1.2],
      ev_station:  [1.0,0.9,1.0],
    };
    return m[building.type] ?? [1.4,2.4,1.4];
  }, [building.type]);

  const [w,h,d] = dims;
  const hasStatus = building.status !== 'normal' && building.status !== 'solar';
  const statusEmissive = STATUS_COLOR[building.status] ?? '#16a34a';

  // Gentle rotation
  useFrame((_, dt) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += dt * 0.18;
    }
  });

  return (
    <group>
      {/* Body */}
      <mesh ref={meshRef} castShadow receiveShadow position={[0, h/2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial
          color={baseColor}
          emissive={hasStatus ? statusEmissive : '#000000'}
          emissiveIntensity={hasStatus ? 0.35 : 0}
          roughness={0.78}
          metalness={0.05}
        />
      </mesh>
      {/* Roof */}
      <mesh position={[0, h+0.06, 0]}>
        <boxGeometry args={[w+0.1, 0.12, d+0.1]} />
        <meshStandardMaterial color="#bfbcb5" roughness={0.9} />
      </mesh>
      {/* Windows front */}
      {[...Array(Math.floor(h/0.6))].map((_,r) =>
        [w*-0.25, 0, w*0.25].map((xo, c) => (
          <mesh key={`w${r}-${c}`} position={[xo, 0.5 + r*0.6, d/2+0.02]}>
            <boxGeometry args={[0.22, 0.28, 0.03]} />
            <meshStandardMaterial color="#b8cfe0" roughness={0.15} metalness={0.5} />
          </mesh>
        ))
      )}
      {/* Solar panels */}
      {building.solarCapacityKW > 0 && (
        <group position={[0, h+0.1, 0]}>
          {[-1,0,1].map(ri => (
            <mesh key={ri} position={[0, 0.05+ri*0.02, ri*d*0.22]} rotation={[-0.28,0,0]}>
              <boxGeometry args={[w*0.78, 0.04, d*0.2]} />
              <meshStandardMaterial color="#1e3355" roughness={0.18} metalness={0.75} />
            </mesh>
          ))}
        </group>
      )}
      {/* Selection ring */}
      {hasStatus && (
        <mesh rotation={[-Math.PI/2,0,0]} position={[0,0.02,0]}>
          <ringGeometry args={[Math.max(w,d)*0.7, Math.max(w,d)*0.85, 36]} />
          <meshBasicMaterial color={statusEmissive} transparent opacity={0.65} depthTest={false} />
        </mesh>
      )}
      {/* Ground */}
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,0,0]} receiveShadow>
        <circleGeometry args={[Math.max(w,d)*1.1, 32]} />
        <meshStandardMaterial color="#e8e4db" roughness={1} />
      </mesh>
      {/* Building label */}
      <Text position={[0, h+0.7, 0]} fontSize={0.28} color="#202124" outlineColor="#ffffff" outlineWidth={0.01} anchorX="center" anchorY="bottom">
        {building.name}
      </Text>
    </group>
  );
}

// ─── Chart tooltip ────────────────────────────────────────────────────────────
function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'#fff', border:'1px solid #e4e1db', borderRadius:8, padding:'6px 10px', fontSize:11 }}>
      <div style={{ fontWeight:600, marginBottom:2 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color:p.color }}>{p.name}: <strong>{p.value}</strong></div>
      ))}
    </div>
  );
}

// ─── Device row ───────────────────────────────────────────────────────────────
function DeviceRow({ d, rescheduled }: { d: Device; rescheduled: boolean }) {
  return (
    <tr style={{ background: rescheduled ? '#fffbeb' : undefined }}>
      <td style={{ fontWeight:600 }}>{d.name}</td>
      <td>{d.powerKW} kW</td>
      <td>
        <span className={`priority-badge priority-${d.priority}`}>{d.priority}</span>
      </td>
      <td>
        <span className={`status-badge ${d.status === 'running' ? 'status-normal' : d.status === 'delayed' || d.status === 'rescheduled' ? 'status-warning' : 'status-inactive'}`}>
          {d.status}
        </span>
      </td>
      <td style={{ fontSize:11, color:'#6b7280' }}>{slotTime(d.assignedSlot)}</td>
      <td style={{ fontSize:11, color:'#6b7280' }}>{slotTime(d.deadlineSlot)}</td>
      <td style={{ fontSize:11, color:'#6b7280' }}>{d.durationSlots * 15} min</td>
      <td>
        {rescheduled
          ? <span style={{ color:'#d97706', fontWeight:700 }}>🔄 Moved</span>
          : <span style={{ color:'#16a34a' }}>—</span>}
      </td>
    </tr>
  );
}

// ─── Main BuildingFocusView ───────────────────────────────────────────────────
export default function BuildingFocusView({ onBack }: { onBack: () => void }) {
  const selectedId = useSimStore(s => s.selectedBuildingId);
  const buildings  = useSimStore(s => s.buildings);
  const result     = useSimStore(s => s.schedulingResult);
  const slots      = useSimStore(s => s.slots);
  const currentSlot = useSimStore(s => s.currentSlot);
  const gridCapacityKW = useSimStore(s => s.gridCapacityKW);
  const selectBuilding = useSimStore(s => s.selectBuilding);

  const building = buildings.find(b => b.id === selectedId);
  if (!building) return null;

  const current = slots[currentSlot];
  const rescheduledIds = new Set(
    result?.rescheduledDevices.filter(r => r.buildingId === building.id).map(r => r.device.id) ?? []
  );

  // Energy calculations from actual data
  const runningDeviceKW = building.devices.filter(d => d.status === 'running').reduce((a, d) => a + d.powerKW, 0);
  const totalDemandKW   = building.baseDemandKW + runningDeviceKW;
  const solarFactor     = current?.solarFactor ?? 0;
  const solarGenKW      = Math.round(building.solarCapacityKW * solarFactor);
  const gridImportKW    = Math.max(0, totalDemandKW - solarGenKW);
  const remainingCapKW  = building.gridCapacityKW - gridImportKW;
  const costRs          = Math.round(gridImportKW * 0.25 * (current?.priceRsPerKWh ?? 8));

  const statusColor = STATUS_COLOR[building.status] ?? '#16a34a';
  const isAbnormal  = building.status === 'overloaded' || building.status === 'warning';

  // Demand chart for this building across day
  const demandChart = slots.filter((_, i) => i % 2 === 0).map(s => ({
    time: s.label,
    Demand: totalDemandKW,
    Solar:  Math.round(building.solarCapacityKW * s.solarFactor),
    Capacity: building.gridCapacityKW,
  }));

  // Other buildings for quick-switch
  const otherBuildings = buildings.filter(b => b.id !== building.id && b.type !== 'substation');

  return (
    <div className="focus-view">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="focus-header">
        <button className="back-btn" onClick={onBack}>← Back to City</button>
        <div className="focus-building-info">
          <div className="focus-building-name">{building.name}</div>
          <div className="focus-building-meta">
            <span style={{ textTransform:'capitalize' }}>{building.type.replace('_',' ')}</span>
            <span style={{ marginLeft:8, background: statusColor, color:'#fff', borderRadius:20, padding:'1px 8px', fontSize:11, fontWeight:700 }}>
              {building.status.charAt(0).toUpperCase() + building.status.slice(1)}
            </span>
            {isAbnormal && <span style={{ marginLeft:6, color:'#dc2626', fontWeight:700 }}>⚠ Active Alert</span>}
          </div>
          <div style={{ fontSize:11, color:'#9ca3af', marginTop:2 }}>ID: {building.id}</div>
        </div>

        {/* Quick-switch */}
        <div className="focus-switch">
          <span style={{ fontSize:11, color:'#9ca3af' }}>Switch:</span>
          {otherBuildings.map(b => (
            <button key={b.id} className="switch-btn" onClick={() => selectBuilding(b.id)}
              style={{ borderColor: STATUS_COLOR[b.status] }}>
              {b.name.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      <div className="focus-body">
        {/* ── Left: 3D + stats ──────────────────────────────── */}
        <div className="focus-left">
          {/* 3D Model */}
          <div className="focus-canvas-wrap">
            <Canvas camera={{ position:[0,5,8], fov:42 }} shadows
              gl={{ antialias:true, toneMapping:THREE.ACESFilmicToneMapping, toneMappingExposure:1.15 }}
              style={{ background:'#f0ede8', borderRadius:12 }}>
              <ambientLight intensity={2.1} color="#fff8f2" />
              <directionalLight position={[6,10,6]} intensity={2.5} castShadow color="#fffdf5"
                shadow-mapSize={[1024,1024]} shadow-bias={-0.001} />
              <hemisphereLight args={['#c8e4ff','#b5aa9e',0.5]} />
              <OrbitControls enablePan={false} minDistance={4} maxDistance={20}
                maxPolarAngle={Math.PI/2.05} autoRotate autoRotateSpeed={0.6} />
              <Suspense fallback={null}>
                <FocusModel building={building} />
              </Suspense>
            </Canvas>
          </div>

          {/* Energy Stats */}
          <div className="focus-stats-grid">
            {[
              { label:'Total Demand',     value:`${totalDemandKW} kW`,       color:'#d97706', icon:'⚡' },
              { label:'Grid Capacity',    value:`${building.gridCapacityKW} kW`, color:'#6b7280', icon:'🏗️' },
              { label:'Solar Generation', value:`${solarGenKW} kW`,          color:'#2563eb', icon:'☀️' },
              { label:'Grid Import',      value:`${gridImportKW} kW`,        color: gridImportKW > building.gridCapacityKW ? '#dc2626' : '#16a34a', icon:'🔌' },
              { label:'Remaining Cap.',   value:`${remainingCapKW >= 0 ? remainingCapKW : 0} kW`, color: remainingCapKW < 0 ? '#dc2626' : '#16a34a', icon:'📊' },
              { label:'Slot Cost',        value:`₹${costRs}`,                color:'#7c3aed', icon:'💰' },
            ].map(k => (
              <div key={k.label} className="focus-stat-card">
                <div style={{ fontSize:18 }}>{k.icon}</div>
                <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>{k.label}</div>
                <div style={{ fontSize:16, fontWeight:700, color:k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Building label */}
          <div className="focus-building-label">{building.label}</div>
        </div>

        {/* ── Right: devices + charts ───────────────────────── */}
        <div className="focus-right">

          {/* Demand chart */}
          <div className="chart-card" style={{ marginBottom:14 }}>
            <div className="chart-card-title">📈 Demand vs Capacity (Today)</div>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={demandChart}>
                <defs>
                  <linearGradient id="fd" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#d97706" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#d97706" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="fs" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#2563eb" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e1db" />
                <XAxis dataKey="time" tick={{ fill:'#64748b', fontSize:9 }} interval={5} />
                <YAxis tick={{ fill:'#64748b', fontSize:9 }} />
                <Tooltip content={<ChartTip />} />
                <Area type="monotone" dataKey="Demand"   stroke="#d97706" fill="url(#fd)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="Solar"    stroke="#2563eb" fill="url(#fs)" strokeWidth={2} dot={false} />
                <Line  type="monotone" dataKey="Capacity" stroke="#dc2626" strokeDasharray="4 3" strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Appliance table */}
          <div className="table-card">
            <div className="table-card-title">🔧 Appliances &amp; Load Breakdown</div>
            {building.devices.length === 0 ? (
              <div style={{ color:'#6b7280', fontSize:13, padding:'12px' }}>No appliances configured for this building.</div>
            ) : (
              <div style={{ overflowX:'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Appliance</th><th>Power</th><th>Priority</th>
                      <th>State</th><th>Start</th><th>Deadline</th>
                      <th>Duration</th><th>Changed?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {building.devices.map(d => (
                      <DeviceRow key={d.id} d={d} rescheduled={rescheduledIds.has(d.id)} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Scheduling decisions for this building */}
          {result && rescheduledIds.size > 0 && (
            <div className="table-card" style={{ marginTop:14 }}>
              <div className="table-card-title">🤖 Scheduling Decisions — {building.name}</div>
              <div style={{ padding:'10px 14px' }}>
                <div style={{ marginBottom:8, fontSize:13, color:'#374151' }}>
                  <strong>{rescheduledIds.size}</strong> appliance{rescheduledIds.size > 1 ? 's' : ''} rescheduled to reduce overload:
                </div>
                {result.rescheduledDevices.filter(r => r.buildingId === building.id).map(({ device }) => (
                  <div key={device.id} style={{ padding:'8px 0', borderBottom:'1px solid #f0ede8', fontSize:12 }}>
                    <strong>{device.name}</strong> ({device.powerKW} kW, {device.priority})
                    {' → '}moved to slot {device.assignedSlot} ({slotTime(device.assignedSlot)})
                    {device.rescheduleReason && (
                      <div style={{ color:'#6b7280', marginTop:3 }}>Reason: {device.rescheduleReason}</div>
                    )}
                  </div>
                ))}
                <div style={{ marginTop:10, fontSize:12, color: result.remainingViolations > 0 ? '#dc2626' : '#15803d', fontWeight:600 }}>
                  {result.remainingViolations > 0
                    ? `⚠ ${result.remainingViolations} capacity violations remain after rescheduling.`
                    : '✅ All capacity constraints satisfied after rescheduling.'}
                </div>
              </div>
            </div>
          )}

          {/* No rescheduling needed */}
          {result && rescheduledIds.size === 0 && building.devices.length > 0 && (
            <div className="table-card" style={{ marginTop:14 }}>
              <div className="table-card-title">🤖 Scheduling Status</div>
              <div style={{ padding:'14px', fontSize:13, color:'#15803d' }}>
                ✅ No rescheduling needed for <strong>{building.name}</strong>. All appliances are running within capacity.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
