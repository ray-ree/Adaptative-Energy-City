import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { Building } from '../types/energy';
import { useSimStore } from '../store/simStore';

// ─── Palette ─────────────────────────────────────────────────────────────────
const MAP_GROUND   = '#f0ede4';
const MAP_ROAD_MJ  = '#ffffff';
const MAP_ROAD_MN  = '#f5f1e8';
const MAP_PAVEMENT = '#e8e4d9';
const MAP_PARK     = '#c8dda7';
const MAP_WATER    = '#a8c8e8';
const MAP_BLOCK    = '#dbd7cd';

const BUILDING_PALETTE = [
  '#e8e2d6','#ddd8cc','#d4cfc3','#ccc7bc','#c4bfb4',
  '#d8d3c8','#e0dbd0','#cdc9be','#bfbbb1','#c9c5ba',
  '#d2cec4','#c7c3b9','#bab6ad','#e4ded3','#dad5ca',
];

// Window / facade accent colours
const WINDOW_COLORS = ['#b8cfe0','#c5d5e0','#a8becc','#b0c8d8','#bccfdb'];

// Status overlays
const STATUS_OVERLAY: Record<string, { border: string; emissive: string; intensity: number }> = {
  normal:     { border: '#16a34a', emissive: '#16a34a', intensity: 0.0  },
  warning:    { border: '#d97706', emissive: '#f59e0b', intensity: 0.30 },
  overloaded: { border: '#dc2626', emissive: '#ef4444', intensity: 0.50 },
  solar:      { border: '#2563eb', emissive: '#3b82f6', intensity: 0.12 },
  inactive:   { border: '#6b7280', emissive: '#9ca3af', intensity: 0.08 },
};

// Grid line colours (requirement: dark charcoal)
const GRID_LINE_NORMAL   = '#343A40';
const GRID_LINE_SELECTED = '#1d4ed8';
const GRID_PARTICLE_ABNORMAL = '#d97706';

// ─── Seeded RNG ───────────────────────────────────────────────────────────────
function seededRandom(seed: string) {
  let s = seed.split('').reduce((a, c) => a + c.charCodeAt(0), 42);
  return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
}

// ─── Tree ────────────────────────────────────────────────────────────────────
function Tree({ x, z, scale = 1 }: { x: number; z: number; scale?: number }) {
  return (
    <group position={[x, 0, z]} scale={[scale, scale, scale]}>
      <mesh position={[0, 0.25, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.07, 0.5, 5]} />
        <meshStandardMaterial color="#7a5c35" roughness={1} />
      </mesh>
      <mesh position={[0, 0.68, 0]} castShadow>
        <sphereGeometry args={[0.24, 7, 6]} />
        <meshStandardMaterial color="#3d7035" roughness={1} />
      </mesh>
      <mesh position={[0, 0.52, 0]}>
        <sphereGeometry args={[0.16, 5, 5]} />
        <meshStandardMaterial color="#4a7c3f" roughness={1} />
      </mesh>
    </group>
  );
}

// ─── Street Light ────────────────────────────────────────────────────────────
function StreetLight({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.48, 0]}>
        <cylinderGeometry args={[0.016, 0.024, 0.96, 5]} />
        <meshStandardMaterial color="#8d9098" metalness={0.65} roughness={0.4} />
      </mesh>
      <mesh position={[0.09, 0.93, 0]}>
        <boxGeometry args={[0.18, 0.045, 0.045]} />
        <meshStandardMaterial color="#60666e" metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
  );
}

// ─── Energy flow particle ─────────────────────────────────────────────────────
function FlowParticle({ from, to, color, speed = 1, phase = 0 }: {
  from: THREE.Vector3; to: THREE.Vector3;
  color: string; speed?: number; phase?: number;
}) {
  const ref = useRef<THREE.Mesh>(null!);
  const t = useRef(phase);
  useFrame((_, dt) => {
    t.current = (t.current + dt * speed * 0.3) % 1;
    if (ref.current) ref.current.position.lerpVectors(from, to, t.current);
  });
  return (
    <mesh ref={ref} renderOrder={3}>
      <sphereGeometry args={[0.055, 5, 5]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={4} transparent opacity={0.95} />
    </mesh>
  );
}

// ─── Grid connection line ─────────────────────────────────────────────────────
function GridLine({
  from, to, status, selected,
}: {
  from: THREE.Vector3; to: THREE.Vector3;
  status: string; selected: boolean;
}) {
  const isAbnormal = status !== 'normal' && status !== 'inactive';
  const lineColor = selected
    ? GRID_LINE_SELECTED
    : isAbnormal
    ? GRID_LINE_NORMAL
    : GRID_LINE_NORMAL;

  // Tube geometry for thick visible line
  const tube = useMemo(() => {
    const path = new THREE.LineCurve3(from, to);
    return new THREE.TubeGeometry(path, 1, isAbnormal ? 0.022 : 0.015, 4, false);
  }, [from, to, isAbnormal]);

  const particleColor = STATUS_OVERLAY[status]?.border ?? GRID_PARTICLE_ABNORMAL;

  return (
    <>
      <mesh geometry={tube} renderOrder={1}>
        <meshBasicMaterial
          color={selected ? GRID_LINE_SELECTED : lineColor}
          transparent
          opacity={selected ? 0.95 : isAbnormal ? 0.85 : 0.55}
        />
      </mesh>
      {/* Animated particles for abnormal states */}
      {isAbnormal && [0, 0.33, 0.66].map(ph => (
        <FlowParticle key={ph} from={from} to={to} color={particleColor} speed={1.5} phase={ph} />
      ))}
      {/* Junction node at building end */}
      <mesh position={to}>
        <sphereGeometry args={[0.045, 6, 6]} />
        <meshBasicMaterial
          color={selected ? GRID_LINE_SELECTED : isAbnormal ? particleColor : '#505860'}
          transparent
          opacity={selected ? 1 : isAbnormal ? 0.9 : 0.6}
        />
      </mesh>
    </>
  );
}

// ─── Windows on building facade ───────────────────────────────────────────────
function BuildingWindows({
  w, h, d, type, rng,
}: {
  w: number; h: number; d: number;
  type: string; rng: () => number;
}) {
  const wc = WINDOW_COLORS[Math.floor(rng() * WINDOW_COLORS.length)];
  const isOffice   = type === 'office';
  const isResid    = type === 'residential';
  const isHospital = type === 'hospital';

  // Rows and columns of windows
  const rows = isOffice ? Math.floor(h / 0.28) : Math.floor(h / 0.35);
  const colsW = isOffice ? Math.floor(w / 0.22) : Math.floor(w / 0.27);
  const colsD = isOffice ? Math.floor(d / 0.22) : Math.floor(d / 0.27);
  const ww = isOffice ? 0.11 : 0.09; // window width
  const wh = isOffice ? 0.12 : 0.10; // window height
  const wd = 0.012;                   // window depth protrusion
  const rowStep  = h / (rows + 1);
  const colStepW = w / (colsW + 1);
  const colStepD = d / (colsD + 1);
  const yBase    = -h / 2 + rowStep;

  const winMat = <meshStandardMaterial color={wc} roughness={0.15} metalness={0.5} />;

  const faces: React.ReactNode[] = [];

  for (let r = 0; r < rows; r++) {
    const yPos = yBase + r * rowStep;
    // Skip ground floor on residential / hospital (doors instead)
    if (r === 0 && (isResid || isHospital)) continue;

    // Front face (+z)
    for (let c = 0; c < colsW; c++) {
      const xPos = -w / 2 + (c + 1) * colStepW;
      if (rng() > (isResid ? 0.35 : 0.1)) {
        faces.push(
          <mesh key={`f${r}-${c}`} position={[xPos, yPos, d / 2 + wd]}>
            <boxGeometry args={[ww, wh, wd]} />
            {winMat}
          </mesh>
        );
      }
    }
    // Back face (-z)
    for (let c = 0; c < colsW; c++) {
      const xPos = -w / 2 + (c + 1) * colStepW;
      if (rng() > (isResid ? 0.35 : 0.1)) {
        faces.push(
          <mesh key={`b${r}-${c}`} position={[xPos, yPos, -d / 2 - wd]}>
            <boxGeometry args={[ww, wh, wd]} />
            {winMat}
          </mesh>
        );
      }
    }
    // Left face (-x)
    for (let c = 0; c < colsD; c++) {
      const zPos = -d / 2 + (c + 1) * colStepD;
      if (rng() > (isResid ? 0.4 : 0.1)) {
        faces.push(
          <mesh key={`l${r}-${c}`} position={[-w / 2 - wd, yPos, zPos]}>
            <boxGeometry args={[wd, wh, ww]} />
            {winMat}
          </mesh>
        );
      }
    }
    // Right face (+x)
    for (let c = 0; c < colsD; c++) {
      const zPos = -d / 2 + (c + 1) * colStepD;
      if (rng() > (isResid ? 0.4 : 0.1)) {
        faces.push(
          <mesh key={`r${r}-${c}`} position={[w / 2 + wd, yPos, zPos]}>
            <boxGeometry args={[wd, wh, ww]} />
            {winMat}
          </mesh>
        );
      }
    }
  }

  return <>{faces}</>;
}

// ─── Rooftop equipment ────────────────────────────────────────────────────────
function RooftopDetails({
  w, h, d, type, hasSolar, rng,
}: {
  w: number; h: number; d: number;
  type: string; hasSolar: boolean; rng: () => number;
}) {
  const topY = h / 2;
  return (
    <group>
      {/* Parapet wall edge */}
      {['hospital','office','mall'].includes(type) && (
        <>
          <mesh position={[0, topY + 0.04, d / 2 - 0.035]}>
            <boxGeometry args={[w, 0.08, 0.06]} />
            <meshStandardMaterial color="#bfbcb5" roughness={0.9} />
          </mesh>
          <mesh position={[0, topY + 0.04, -(d / 2 - 0.035)]}>
            <boxGeometry args={[w, 0.08, 0.06]} />
            <meshStandardMaterial color="#bfbcb5" roughness={0.9} />
          </mesh>
          <mesh position={[w / 2 - 0.035, topY + 0.04, 0]}>
            <boxGeometry args={[0.06, 0.08, d]} />
            <meshStandardMaterial color="#bfbcb5" roughness={0.9} />
          </mesh>
          <mesh position={[-(w / 2 - 0.035), topY + 0.04, 0]}>
            <boxGeometry args={[0.06, 0.08, d]} />
            <meshStandardMaterial color="#bfbcb5" roughness={0.9} />
          </mesh>
        </>
      )}

      {/* Water tank (residential/hospital) */}
      {['residential','hospital'].includes(type) && (
        <mesh position={[(rng() - 0.5) * w * 0.4, topY + 0.14, (rng() - 0.5) * d * 0.4]} castShadow>
          <cylinderGeometry args={[0.1, 0.1, 0.22, 8]} />
          <meshStandardMaterial color="#9da5ae" roughness={0.7} metalness={0.4} />
        </mesh>
      )}

      {/* HVAC unit (office/hospital/mall) */}
      {['office','hospital','mall'].includes(type) && (
        <mesh position={[(rng() - 0.5) * w * 0.3, topY + 0.1, (rng() - 0.5) * d * 0.3]} castShadow>
          <boxGeometry args={[0.22, 0.16, 0.18]} />
          <meshStandardMaterial color="#8d9099" roughness={0.65} metalness={0.5} />
        </mesh>
      )}

      {/* Ventilation pipe (factory) */}
      {type === 'factory' && (
        <>
          <mesh position={[w * 0.3, topY + 0.25, 0]} castShadow>
            <cylinderGeometry args={[0.07, 0.07, 0.5, 7]} />
            <meshStandardMaterial color="#7a8087" roughness={0.6} metalness={0.5} />
          </mesh>
          <mesh position={[-w * 0.25, topY + 0.2, d * 0.2]} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 0.4, 7]} />
            <meshStandardMaterial color="#7a8087" roughness={0.6} metalness={0.5} />
          </mesh>
        </>
      )}

      {/* Rooftop solar panels — realistic tiered rows */}
      {hasSolar && (
        <group position={[0, topY + 0.05, 0]}>
          {/* Frame */}
          <mesh>
            <boxGeometry args={[w * 0.78, 0.04, d * 0.58]} />
            <meshStandardMaterial color="#c4c0b8" roughness={0.85} metalness={0.1} />
          </mesh>
          {/* Panel rows — dark blue glass */}
          {[-1, 0, 1].map((row, ri) => (
            <mesh key={ri} position={[0, 0.03 + ri * 0.01, row * d * 0.16]} rotation={[-0.28, 0, 0]}>
              <boxGeometry args={[w * 0.72, 0.018, d * 0.15]} />
              <meshStandardMaterial color="#1e3355" roughness={0.18} metalness={0.75} />
            </mesh>
          ))}
          {/* Cell lines (dark separator) */}
          {[-1, 0, 1].map((row, ri) =>
            [-2,-1,0,1,2].map((col, ci) => (
              <mesh key={`s${ri}-${ci}`} position={[col * w * 0.12, 0.04 + ri * 0.01, row * d * 0.16]} rotation={[-0.28, 0, 0]}>
                <boxGeometry args={[0.008, 0.022, d * 0.15]} />
                <meshStandardMaterial color="#111827" roughness={0.3} />
              </mesh>
            ))
          )}
        </group>
      )}

      {/* Stairwell / elevator penthouse (office/hospital) */}
      {['office','hospital'].includes(type) && (
        <mesh position={[0, topY + 0.2, 0]} castShadow>
          <boxGeometry args={[w * 0.35, 0.38, d * 0.35]} />
          <meshStandardMaterial color="#d5d0c8" roughness={0.85} />
        </mesh>
      )}

      {/* Shopfront canopy on ground — residential/mall */}
      {['mall','residential'].includes(type) && (
        <mesh position={[0, -h / 2 + 0.18, d / 2 + 0.12]}>
          <boxGeometry args={[w * 0.8, 0.04, 0.22]} />
          <meshStandardMaterial color="#c8c4bc" roughness={0.9} />
        </mesh>
      )}
    </group>
  );
}

// ─── Building Label ───────────────────────────────────────────────────────────
function BuildingLabel({
  name, h, w, d, status, selected,
}: {
  name: string; h: number; w: number; d: number;
  status: string; selected: boolean;
}) {
  const isAbnormal = status !== 'normal' && status !== 'solar' && status !== 'inactive';
  const statusChar = {
    warning: '⚠', overloaded: '✕', solar: '☀', inactive: '–',
  }[status] ?? '';

  const labelY = h / 2 + (selected ? 0.55 : 0.38);
  const fontSize = selected ? 0.15 : 0.115;

  return (
    <group position={[0, labelY, 0]}>
      {/* Background pill */}
      <mesh position={[0, 0, -0.01]}>
        <boxGeometry args={[Math.min(name.length * 0.085 + 0.2, w + 0.4), fontSize + 0.1, 0.01]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.88} depthTest={false} />
      </mesh>

      {/* Building name — dark charcoal */}
      <Text
        fontSize={fontSize}
        color="#202124"
        font={undefined}
        anchorX="center"
        anchorY="middle"
        renderOrder={10}
        outlineColor="#ffffff"
        outlineWidth={0.003}
      >
        {name}
      </Text>

      {/* Status text below name — only when abnormal or selected */}
      {(isAbnormal || selected) && (
        <Text
          position={[0, -(fontSize + 0.06), 0]}
          fontSize={0.09}
          color={STATUS_OVERLAY[status]?.border ?? '#16a34a'}
          anchorX="center"
          anchorY="middle"
          renderOrder={10}
          outlineColor="#ffffff"
          outlineWidth={0.003}
        >
          {statusChar} {status.charAt(0).toUpperCase() + status.slice(1)}
        </Text>
      )}
    </group>
  );
}

// ─── Key simulation building ──────────────────────────────────────────────────
function SimBuilding({
  building, onClick,
}: {
  building: Building; onClick: (id: string) => void;
}) {
  const bodyRef  = useRef<THREE.Mesh>(null!);
  const selected = useSimStore(s => s.selectedBuildingId === building.id);
  const rng      = useMemo(() => seededRandom(building.id + '_color'), [building.id]);
  const rngDetail = useMemo(() => seededRandom(building.id + '_detail'), [building.id]);

  const overlay = STATUS_OVERLAY[building.status] ?? STATUS_OVERLAY.normal;
  const isAbnormal = building.status !== 'normal' && building.status !== 'solar';

  // Stable base colour
  const baseColor = BUILDING_PALETTE[Math.floor(rng() * BUILDING_PALETTE.length)];

  // Type-specific dimensions
  const dims = useMemo((): [number, number, number] => {
    const map: Record<string, [number, number, number]> = {
      hospital:    [1.3, 2.2, 1.2],
      factory:     [1.8, 0.85, 1.5],
      office:      [0.9, 3.2, 0.9],
      mall:        [2.0, 0.7, 2.0],
      residential: [0.75, 1.4, 0.75],
      solar_farm:  [1.6, 0.12, 1.6],
      substation:  [0.6, 0.65, 0.6],
      ev_station:  [0.5, 0.45, 0.5],
    };
    return map[building.type] ?? [0.75, 1.3, 0.75];
  }, [building.type]);

  // Pulse overloaded buildings
  useFrame(() => {
    if (!bodyRef.current) return;
    const target = building.status === 'overloaded'
      ? 1 + Math.sin(Date.now() * 0.0045) * 0.045
      : 1;
    bodyRef.current.scale.y += (target - bodyRef.current.scale.y) * 0.12;
  });

  const [w, h, d] = dims;
  const { x, y, z } = building.position;
  const showDetail = building.type !== 'solar_farm' && building.type !== 'substation';

  return (
    <group position={[x, y + h / 2, z]}>
      {/* ── Main body ── */}
      <mesh
        ref={bodyRef}
        castShadow
        receiveShadow
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(building.id); }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = 'auto'; }}
      >
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial
          color={baseColor}
          emissive={overlay.emissive}
          emissiveIntensity={overlay.intensity}
          roughness={0.80}
          metalness={0.04}
        />
      </mesh>

      {/* ── Facade stripe (hospital/office ground floor differentiation) ── */}
      {building.type === 'hospital' && (
        <mesh position={[0, -h / 2 + 0.22, d / 2 + 0.005]}>
          <boxGeometry args={[w, 0.44, 0.01]} />
          <meshStandardMaterial color="#e8f0f4" roughness={0.95} />
        </mesh>
      )}
      {building.type === 'office' && (
        <mesh position={[0, -h / 2 + 0.22, d / 2 + 0.005]}>
          <boxGeometry args={[w, 0.44, 0.01]} />
          <meshStandardMaterial color="#d0d8e0" roughness={0.8} metalness={0.1} />
        </mesh>
      )}

      {/* ── Windows ── */}
      {showDetail && (
        <BuildingWindows w={w} h={h} d={d} type={building.type} rng={rngDetail} />
      )}

      {/* ── Roof cap ── */}
      <mesh position={[0, h / 2 + 0.028, 0]} receiveShadow>
        <boxGeometry args={[w + 0.02, 0.055, d + 0.02]} />
        <meshStandardMaterial color="#c0bcb5" roughness={0.9} />
      </mesh>

      {/* ── Rooftop details ── */}
      {showDetail && (
        <RooftopDetails
          w={w} h={h} d={d}
          type={building.type}
          hasSolar={building.solarCapacityKW > 0}
          rng={rngDetail}
        />
      )}

      {/* ── Simple solar for solar_farm type ── */}
      {building.type === 'solar_farm' && (
        <group position={[0, h / 2 + 0.035, 0]}>
          {[-2,-1,0,1,2].map(row =>
            [-2,-1,0,1,2].map(col => (
              <mesh key={`${row}-${col}`} position={[col * 0.3, 0, row * 0.28]} rotation={[-0.3, 0, 0]}>
                <boxGeometry args={[0.26, 0.015, 0.22]} />
                <meshStandardMaterial color="#1e3355" roughness={0.18} metalness={0.75} />
              </mesh>
            ))
          )}
        </group>
      )}

      {/* ── Selection highlight ring ── */}
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -h / 2 + 0.01, 0]}>
          <ringGeometry args={[Math.max(w, d) * 0.7, Math.max(w, d) * 0.88, 40]} />
          <meshBasicMaterial color="#1d4ed8" transparent opacity={0.9} depthTest={false} />
        </mesh>
      )}

      {/* ── Status ring (abnormal only) ── */}
      {isAbnormal && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -h / 2 + 0.02, 0]}>
          <ringGeometry args={[Math.max(w, d) * 0.55, Math.max(w, d) * 0.68, 36]} />
          <meshBasicMaterial color={overlay.border} transparent opacity={0.75} depthTest={false} />
        </mesh>
      )}

      {/* ── Status dot ── */}
      <mesh position={[w / 2 + 0.09, h / 2 - 0.1, 0]}>
        <sphereGeometry args={[0.075, 8, 8]} />
        <meshStandardMaterial
          color={overlay.border}
          emissive={overlay.border}
          emissiveIntensity={isAbnormal ? 3.0 : 1.0}
        />
      </mesh>

      {/* ── Building label ── */}
      <BuildingLabel
        name={building.name}
        h={h} w={w} d={d}
        status={building.status}
        selected={selected}
      />
    </group>
  );
}

// ─── Background city fill buildings (detailed variants) ───────────────────────
function BackgroundBuildings() {
  const items = useMemo(() => {
    const rng = seededRandom('bg2025');
    const blockPositions = [
      [-9,-9],[-6,-9],[-3,-9],[0,-9],[3,-9],[6,-9],[9,-9],
      [-9,-6],[-6,-6],         [0,-6],[3,-6],[6,-6],[9,-6],
      [-9,-3],[-6,-3],         [0,-3],[3,-3],[6,-3],[9,-3],
      [-9, 0],[-6, 0],                       [6, 0],[9, 0],
      [-9, 3],[-6, 3],         [0, 3],[3, 3],[6, 3],[9, 3],
      [-9, 6],[-6, 6],         [0, 6],[3, 6],[6, 6],[9, 6],
      [-9, 9],[-6, 9],[-3, 9],[0, 9],[3, 9],[6, 9],[9, 9],
    ];

    const result: Array<{
      x: number; z: number; w: number; h: number; d: number;
      color: string; hasRoof: boolean; roofColor: string;
      hasWindow: boolean; winColor: string;
    }> = [];

    for (const [bx, bz] of blockPositions) {
      const count = Math.floor(rng() * 3) + 2;
      for (let i = 0; i < count; i++) {
        const h = rng() * 1.6 + 0.2;
        const w = rng() * 0.65 + 0.22;
        const d = rng() * 0.65 + 0.22;
        result.push({
          x: bx + (rng() - 0.5) * 2.0,
          z: bz + (rng() - 0.5) * 2.0,
          w, h, d,
          color: BUILDING_PALETTE[Math.floor(rng() * BUILDING_PALETTE.length)],
          hasRoof: rng() > 0.4,
          roofColor: '#bfbcb4',
          hasWindow: rng() > 0.3,
          winColor: WINDOW_COLORS[Math.floor(rng() * WINDOW_COLORS.length)],
        });
      }
    }
    return result;
  }, []);

  return (
    <>
      {items.map((b, i) => (
        <group key={i} position={[b.x, b.h / 2, b.z]}>
          {/* Body */}
          <mesh castShadow receiveShadow>
            <boxGeometry args={[b.w, b.h, b.d]} />
            <meshStandardMaterial color={b.color} roughness={0.85} />
          </mesh>
          {/* Roof cap */}
          {b.hasRoof && (
            <mesh position={[0, b.h / 2 + 0.025, 0]}>
              <boxGeometry args={[b.w + 0.015, 0.05, b.d + 0.015]} />
              <meshStandardMaterial color={b.roofColor} roughness={0.9} />
            </mesh>
          )}
          {/* Simple window strip */}
          {b.hasWindow && b.h > 0.5 && (
            <mesh position={[0, 0, b.d / 2 + 0.006]}>
              <boxGeometry args={[b.w * 0.6, b.h * 0.12, 0.008]} />
              <meshStandardMaterial color={b.winColor} roughness={0.15} metalness={0.5} />
            </mesh>
          )}
        </group>
      ))}
    </>
  );
}

// ─── City Ground (unchanged layout, slightly refined) ────────────────────────
function CityGround() {
  const rng = useMemo(() => seededRandom('ground2'), []);

  const treePositions = useMemo(() => {
    const ts: Array<[number, number, number]> = [];
    // Park grove
    for (let i = 0; i < 16; i++) ts.push([6.5 + (rng() - 0.5) * 3.5, -6.5 + (rng() - 0.5) * 3.5, 0.85 + rng() * 0.3]);
    // Street trees
    for (let xi = -9; xi <= 9; xi += 1.8) {
      ts.push([xi, 1.65, 0.75 + rng() * 0.25]);
      ts.push([xi, -1.65, 0.75 + rng() * 0.25]);
    }
    for (let zi = -9; zi <= 9; zi += 1.8) {
      ts.push([1.65, zi, 0.75 + rng() * 0.25]);
      ts.push([-1.65, zi, 0.75 + rng() * 0.25]);
    }
    return ts;
  }, []);

  const lightPos: Array<[number, number]> = [
    [-1.1,-4],[-1.1,-7],[-1.1,4],[-1.1,7],
    [1.1,-4],[1.1,-7],[1.1,4],[1.1,7],
    [-4,-1.1],[-7,-1.1],[4,-1.1],[7,-1.1],
    [-4,1.1],[-7,1.1],[4,1.1],[7,1.1],
  ];

  return (
    <>
      {/* Base ground */}
      <mesh receiveShadow rotation={[-Math.PI/2,0,0]} position={[0,-0.02,0]}>
        <planeGeometry args={[28,28]} />
        <meshStandardMaterial color={MAP_GROUND} roughness={1} />
      </mesh>

      {/* City blocks */}
      {[[-8,-8,5.5,5.5],[-2,-8,3.5,5.5],[4,-8,5.5,5.5],
        [-8,-2,5.5,3.5],[4,-2,5.5,3.5],
        [-8,4,5.5,5.5],[-2,4,3.5,5.5],[4,4,5.5,5.5],
      ].map(([cx,cz,bw,bd],i) => (
        <mesh key={i} receiveShadow rotation={[-Math.PI/2,0,0]} position={[cx,-0.01,cz]}>
          <planeGeometry args={[bw,bd]} />
          <meshStandardMaterial color={MAP_BLOCK} roughness={1} />
        </mesh>
      ))}

      {/* Park */}
      <mesh receiveShadow rotation={[-Math.PI/2,0,0]} position={[7,0,-7]}>
        <planeGeometry args={[4.5,4.5]} />
        <meshStandardMaterial color={MAP_PARK} roughness={1} />
      </mesh>
      <mesh receiveShadow rotation={[-Math.PI/2,0,0]} position={[7,0.001,-7]}>
        <ringGeometry args={[1.8,2.1,32]} />
        <meshStandardMaterial color="#a9c97a" roughness={1} />
      </mesh>

      {/* Water */}
      <mesh receiveShadow rotation={[-Math.PI/2,0,0]} position={[-7,0,7]}>
        <circleGeometry args={[1.4,24]} />
        <meshStandardMaterial color={MAP_WATER} roughness={0.1} metalness={0.2} />
      </mesh>

      {/* Major roads */}
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,0.005,0]}>
        <planeGeometry args={[28,1.4]} />
        <meshStandardMaterial color={MAP_ROAD_MJ} roughness={0.95} />
      </mesh>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,0.005,0]}>
        <planeGeometry args={[1.4,28]} />
        <meshStandardMaterial color={MAP_ROAD_MJ} roughness={0.95} />
      </mesh>
      {/* Centre dashes */}
      {[-10,-6,-2,2,6,10].map((x,i) => (
        <mesh key={i} rotation={[-Math.PI/2,0,0]} position={[x,0.012,0]}>
          <planeGeometry args={[1.0,0.06]} />
          <meshStandardMaterial color="#f9d71c" />
        </mesh>
      ))}
      {[-10,-6,-2,2,6,10].map((z,i) => (
        <mesh key={i} rotation={[-Math.PI/2,0,0]} position={[0,0.012,z]}>
          <planeGeometry args={[0.06,1.0]} />
          <meshStandardMaterial color="#f9d71c" />
        </mesh>
      ))}

      {/* Minor roads */}
      {[-5.5,5.5].map((z,i) => (
        <mesh key={i} rotation={[-Math.PI/2,0,0]} position={[0,0.004,z]}>
          <planeGeometry args={[28,0.7]} />
          <meshStandardMaterial color={MAP_ROAD_MN} roughness={0.95} />
        </mesh>
      ))}
      {[-5.5,5.5].map((x,i) => (
        <mesh key={i} rotation={[-Math.PI/2,0,0]} position={[x,0.004,0]}>
          <planeGeometry args={[0.7,28]} />
          <meshStandardMaterial color={MAP_ROAD_MN} roughness={0.95} />
        </mesh>
      ))}

      {/* Pavements */}
      {[0.9,-0.9].map((z,i) => (
        <mesh key={i} rotation={[-Math.PI/2,0,0]} position={[0,0.003,z]}>
          <planeGeometry args={[28,0.22]} />
          <meshStandardMaterial color={MAP_PAVEMENT} roughness={1} />
        </mesh>
      ))}
      {[0.9,-0.9].map((x,i) => (
        <mesh key={i} rotation={[-Math.PI/2,0,0]} position={[x,0.003,0]}>
          <planeGeometry args={[0.22,28]} />
          <meshStandardMaterial color={MAP_PAVEMENT} roughness={1} />
        </mesh>
      ))}

      {/* Parking lot */}
      <mesh receiveShadow rotation={[-Math.PI/2,0,0]} position={[4,0.002,4]}>
        <planeGeometry args={[2.5,2.5]} />
        <meshStandardMaterial color="#d9d5cc" roughness={1} />
      </mesh>
      {[-0.8,-0.3,0.2,0.7].map((ox,i) => (
        <mesh key={i} rotation={[-Math.PI/2,0,0]} position={[4+ox,0.013,4]}>
          <planeGeometry args={[0.05,2.2]} />
          <meshStandardMaterial color="#a8a5a0" />
        </mesh>
      ))}

      {/* Trees */}
      {treePositions.map(([tx,tz,sc],i) => <Tree key={i} x={tx} z={tz} scale={sc} />)}

      {/* Street lights */}
      {lightPos.map(([lx,lz],i) => <StreetLight key={i} x={lx} z={lz} />)}

      {/* Zebra crossing */}
      {[-0.5,-0.25,0,0.25,0.5].map((ox,i) => (
        <mesh key={i} rotation={[-Math.PI/2,0,0]} position={[ox*0.22,0.014,1.1]}>
          <planeGeometry args={[0.16,0.55]} />
          <meshStandardMaterial color="#f5f1e8" />
        </mesh>
      ))}

      {/* Substation node marker */}
      <mesh position={[-3,0.08,3]} rotation={[-Math.PI/2,0,0]}>
        <circleGeometry args={[0.28,24]} />
        <meshBasicMaterial color="#343A40" transparent opacity={0.22} />
      </mesh>
    </>
  );
}

// ─── Main Canvas ─────────────────────────────────────────────────────────────
export default function CityCanvas() {
  const buildings      = useSimStore(s => s.buildings);
  const selectBuilding = useSimStore(s => s.selectBuilding);
  const selectedId     = useSimStore(s => s.selectedBuildingId);

  // Substation position (hub for grid lines)
  const substationPos = useMemo(() => {
    const sub = buildings.find(b => b.type === 'substation');
    return sub
      ? new THREE.Vector3(sub.position.x, 0.6, sub.position.z)
      : new THREE.Vector3(-3, 0.6, 3);
  }, [buildings]);

  return (
    <Canvas
      camera={{ position: [13, 11, 13], fov: 42 }}
      shadows
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.15 }}
      style={{ background: '#e8e4db' }}
    >
      {/* Natural daylight */}
      <ambientLight intensity={1.9} color="#fff8f2" />
      <directionalLight
        position={[16, 22, 10]}
        intensity={2.4}
        color="#fffdf5"
        castShadow
        shadow-mapSize={[2048,2048]}
        shadow-camera-far={65}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-bias={-0.0005}
      />
      <directionalLight position={[-10,8,-10]} intensity={0.55} color="#ddeeff" />
      <hemisphereLight args={['#c8e4ff','#b5aa9e',0.55]} />

      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        maxPolarAngle={Math.PI / 2.1}
        minPolarAngle={0.18}
        minDistance={3.5}
        maxDistance={32}
        panSpeed={0.8}
        zoomSpeed={1.2}
      />

      {/* Ground, roads, park, water */}
      <CityGround />

      {/* Background fill buildings */}
      <BackgroundBuildings />

      {/* Grid connection lines — draw BEFORE buildings so they sit under them */}
      {buildings
        .filter(b => b.type !== 'substation')
        .map(b => {
          const bDims: Record<string, number> = {
            hospital: 2.2, factory: 0.85, office: 3.2, mall: 0.7,
            residential: 1.4, solar_farm: 0.12, ev_station: 0.45,
          };
          const bH = bDims[b.type] ?? 1.3;
          return (
            <GridLine
              key={b.id + '_line'}
              from={substationPos}
              to={new THREE.Vector3(b.position.x, b.position.y + bH * 0.1, b.position.z)}
              status={b.status}
              selected={b.id === selectedId}
            />
          );
        })}

      {/* Simulation buildings */}
      {buildings.map(b => (
        <SimBuilding key={b.id} building={b} onClick={selectBuilding} />
      ))}
    </Canvas>
  );
}
