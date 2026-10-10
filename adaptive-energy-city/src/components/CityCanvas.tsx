import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { Building } from '../types/energy';
import { useSimStore } from '../store/simStore';

// ─── Google-Maps-inspired palette ────────────────────────────────────────────
const MAP_GROUND   = '#f0ede4';   // pale beige land
const MAP_ROAD_MJ  = '#ffffff';   // major road
const MAP_ROAD_MN  = '#f5f1e8';   // minor road / lane
const MAP_PAVEMENT = '#e8e4d9';   // footpath / sidewalk
const MAP_PARK     = '#c8dda7';   // park / green space
const MAP_WATER    = '#a8c8e8';   // water body
const MAP_BLOCK    = '#dbd7cd';   // city block fill

// Base building colours (natural, varied – NOT status colours)
const BUILDING_PALETTE = [
  '#e8e2d6','#ddd8cc','#d4cfc3','#ccc7bc','#c4bfb4',
  '#d8d3c8','#e0dbd0','#cdc9be','#bfbbb1','#c9c5ba',
  '#d2cec4','#c7c3b9','#bab6ad','#e4ded3','#dad5ca',
];

// Energy overlay colours – applied on TOP of base colour when status ≠ normal
const STATUS_OVERLAY: Record<string, { border: string; emissive: string; intensity: number }> = {
  normal:     { border: '#22c55e', emissive: '#22c55e', intensity: 0.0 },
  warning:    { border: '#f59e0b', emissive: '#f59e0b', intensity: 0.35 },
  overloaded: { border: '#ef4444', emissive: '#ef4444', intensity: 0.55 },
  solar:      { border: '#3b82f6', emissive: '#3b82f6', intensity: 0.15 },
  inactive:   { border: '#94a3b8', emissive: '#94a3b8', intensity: 0.1  },
};

// ─── Deterministic pseudo-random (seeded by string) ──────────────────────────
function seededRandom(seed: string): () => number {
  let s = seed.split('').reduce((a, c) => a + c.charCodeAt(0), 42);
  return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
}

// ─── Simple tree ─────────────────────────────────────────────────────────────
function Tree({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.25, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.06, 0.5, 5]} />
        <meshStandardMaterial color="#8b6f47" roughness={1} />
      </mesh>
      <mesh position={[0, 0.65, 0]} castShadow>
        <sphereGeometry args={[0.22, 7, 6]} />
        <meshStandardMaterial color="#4a7c3f" roughness={1} />
      </mesh>
    </group>
  );
}

// ─── Streetlight ─────────────────────────────────────────────────────────────
function StreetLight({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.018, 0.025, 0.9, 5]} />
        <meshStandardMaterial color="#9ca3af" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0.08, 0.9, 0]}>
        <boxGeometry args={[0.14, 0.04, 0.04]} />
        <meshStandardMaterial color="#6b7280" metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
  );
}

// ─── Energy-flow particle ─────────────────────────────────────────────────────
function EnergyParticle({ from, to, color, speed = 1, phase = 0 }: {
  from: THREE.Vector3; to: THREE.Vector3; color: string; speed?: number; phase?: number;
}) {
  const ref = useRef<THREE.Mesh>(null!);
  const t = useRef(phase);
  useFrame((_, dt) => {
    t.current = (t.current + dt * speed * 0.35) % 1;
    ref.current?.position.lerpVectors(from, to, t.current);
  });
  return (
    <mesh ref={ref} renderOrder={2}>
      <sphereGeometry args={[0.04, 5, 5]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} transparent opacity={0.9} />
    </mesh>
  );
}

// ─── Connection line (underground cable look) ─────────────────────────────────
function CableLine({ from, to, status }: { from: THREE.Vector3; to: THREE.Vector3; status: string }) {
  const overlay = STATUS_OVERLAY[status] ?? STATUS_OVERLAY.normal;
  const isAbnormal = status !== 'normal' && status !== 'inactive';
  const color = isAbnormal ? overlay.border : '#94a3b8';

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setFromPoints([from, to]);
    return g;
  }, [from, to]);

  return (
    <>
      {React.createElement('line', { geometry: geo },
        <lineBasicMaterial color={color} opacity={isAbnormal ? 0.85 : 0.35} transparent />
      )}
      {isAbnormal && [0, 0.5].map((ph) => (
        <EnergyParticle key={ph} from={from} to={to} color={color} speed={1.2} phase={ph} />
      ))}
    </>
  );
}

// ─── Procedural background buildings (city fill) ─────────────────────────────
function BackgroundBuildings() {
  const rng = useMemo(() => seededRandom('bgbuildings'), []);

  const buildings = useMemo(() => {
    const items: Array<{ x: number; z: number; w: number; h: number; d: number; color: string }> = [];
    // Lay out buildings in a grid of city blocks
    const blockPositions = [
      [-9,-9],[-6,-9],[-3,-9],[0,-9],[3,-9],[6,-9],[9,-9],
      [-9,-6],[-6,-6],         [0,-6],[3,-6],[6,-6],[9,-6],
      [-9,-3],[-6,-3],         [0,-3],[3,-3],[6,-3],[9,-3],
      [-9, 0],[-6, 0],                       [6, 0],[9, 0],
      [-9, 3],[-6, 3],         [0, 3],[3, 3],[6, 3],[9, 3],
      [-9, 6],[-6, 6],         [0, 6],[3, 6],[6, 6],[9, 6],
      [-9, 9],[-6, 9],[-3, 9],[0, 9],[3, 9],[6, 9],[9, 9],
    ];

    for (const [bx, bz] of blockPositions) {
      const count = Math.floor(rng() * 3) + 2; // 2-4 buildings per block
      for (let i = 0; i < count; i++) {
        const ox = (rng() - 0.5) * 2.0;
        const oz = (rng() - 0.5) * 2.0;
        const h = rng() * 1.4 + 0.25;
        const w = rng() * 0.6 + 0.25;
        const d = rng() * 0.6 + 0.25;
        items.push({
          x: bx + ox, z: bz + oz, w, h, d,
          color: BUILDING_PALETTE[Math.floor(rng() * BUILDING_PALETTE.length)],
        });
      }
    }
    return items;
  }, []);

  return (
    <>
      {buildings.map((b, i) => (
        <mesh key={i} position={[b.x, b.h / 2, b.z]} castShadow receiveShadow>
          <boxGeometry args={[b.w, b.h, b.d]} />
          <meshStandardMaterial color={b.color} roughness={0.85} metalness={0.0} />
        </mesh>
      ))}
    </>
  );
}

// ─── Key simulation building ──────────────────────────────────────────────────
function BuildingMesh({ building, onClick }: { building: Building; onClick: (id: string) => void }) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const roofRef = useRef<THREE.Mesh>(null!);
  const selected = useSimStore(s => s.selectedBuildingId === building.id);
  const rng = useMemo(() => seededRandom(building.id), [building.id]);

  const overlay = STATUS_OVERLAY[building.status] ?? STATUS_OVERLAY.normal;
  const isAbnormal = building.status !== 'normal' && building.status !== 'solar';

  // Stable base colour (deterministic from building id)
  const baseColor = BUILDING_PALETTE[Math.floor(rng() * BUILDING_PALETTE.length)];

  const dims = useMemo((): [number, number, number] => {
    const map: Record<string, [number, number, number]> = {
      hospital:    [1.1, 2.0, 1.1],
      factory:     [1.6, 1.0, 1.4],
      office:      [0.8, 2.8, 0.8],
      mall:        [1.8, 0.9, 1.8],
      residential: [0.7, 1.5, 0.7],
      solar_farm:  [1.4, 0.15, 1.4],
      substation:  [0.7, 0.7, 0.7],
      ev_station:  [0.5, 0.5, 0.5],
    };
    return map[building.type] ?? [0.7, 1.3, 0.7];
  }, [building.type]);

  // Slow pulse on overloaded only
  useFrame((_, dt) => {
    if (!meshRef.current) return;
    if (building.status === 'overloaded') {
      meshRef.current.scale.y = 1 + Math.sin(Date.now() * 0.004) * 0.04;
    } else {
      const target = 1;
      meshRef.current.scale.y += (target - meshRef.current.scale.y) * 0.1;
    }
  });

  const [w, h, d] = dims;
  const { x, y, z } = building.position;

  return (
    <group position={[x, y + h / 2, z]}>
      {/* Main body */}
      <mesh
        ref={meshRef}
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
          roughness={0.82}
          metalness={0.05}
        />
      </mesh>

      {/* Flat roof cap (slightly darker) */}
      <mesh ref={roofRef} position={[0, h / 2 + 0.025, 0]} receiveShadow>
        <boxGeometry args={[w, 0.05, d]} />
        <meshStandardMaterial color="#c4bfb4" roughness={0.9} />
      </mesh>

      {/* Selection outline ring */}
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -h / 2 + 0.01, 0]}>
          <ringGeometry args={[Math.max(w, d) * 0.65, Math.max(w, d) * 0.8, 36]} />
          <meshBasicMaterial color="#1d4ed8" transparent opacity={0.85} depthTest={false} />
        </mesh>
      )}

      {/* Status ring (only when abnormal) */}
      {isAbnormal && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -h / 2 + 0.02, 0]}>
          <ringGeometry args={[Math.max(w, d) * 0.55, Math.max(w, d) * 0.65, 36]} />
          <meshBasicMaterial color={overlay.border} transparent opacity={0.7} depthTest={false} />
        </mesh>
      )}

      {/* Rooftop solar panels (blue tinted, realistic tilt) */}
      {building.solarCapacityKW > 0 && (
        <group position={[0, h / 2 + 0.06, 0]}>
          <mesh rotation={[-0.25, 0, 0]}>
            <boxGeometry args={[w * 0.75, 0.05, d * 0.55]} />
            <meshStandardMaterial color="#1e3a5f" roughness={0.3} metalness={0.5} />
          </mesh>
          <mesh rotation={[-0.25, 0, 0]} position={[0, 0.02, 0]}>
            <boxGeometry args={[w * 0.72, 0.015, d * 0.52]} />
            <meshStandardMaterial color="#1d4ed8" roughness={0.2} metalness={0.8} />
          </mesh>
        </group>
      )}

      {/* Small building label - only visible close up */}
      <Text
        position={[0, h / 2 + 0.35, 0]}
        fontSize={0.13}
        color="#374151"
        outlineColor="#ffffff"
        outlineWidth={0.006}
        anchorX="center"
        anchorY="bottom"
        renderOrder={5}
      >
        {building.name}
      </Text>

      {/* Status indicator dot */}
      <mesh position={[w / 2 + 0.08, h / 2, 0]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshStandardMaterial
          color={overlay.border}
          emissive={overlay.border}
          emissiveIntensity={isAbnormal ? 2.5 : 0.8}
        />
      </mesh>
    </group>
  );
}

// ─── Google-Maps-inspired ground, roads, parks ────────────────────────────────
function CityGround() {
  const rng = useMemo(() => seededRandom('ground'), []);

  // Tree positions in parks and along roads
  const treePositions = useMemo(() => {
    const ts: Array<[number, number]> = [];
    // Park grove at top-right
    for (let i = 0; i < 14; i++) ts.push([6.5 + (rng() - 0.5) * 3.5, -6.5 + (rng() - 0.5) * 3.5]);
    // Street trees along main road margins
    for (let i = -9; i <= 9; i += 1.8) { ts.push([i, 1.6]); ts.push([i, -1.6]); }
    for (let i = -9; i <= 9; i += 1.8) { ts.push([1.6, i]); ts.push([-1.6, i]); }
    return ts;
  }, []);

  const lightPositions: Array<[number, number]> = [
    [-1.1,-4],[-1.1,-7],[-1.1,4],[-1.1,7],
    [1.1,-4],[1.1,-7],[1.1,4],[1.1,7],
    [-4,-1.1],[-7,-1.1],[4,-1.1],[7,-1.1],
    [-4,1.1],[-7,1.1],[4,1.1],[7,1.1],
  ];

  return (
    <>
      {/* ─── Base ground (pale beige) ─── */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[28, 28]} />
        <meshStandardMaterial color={MAP_GROUND} roughness={1} />
      </mesh>

      {/* ─── City block fills (slightly darker) ─── */}
      {[
        [-8,-8,5.5,5.5],[-2,-8,3.5,5.5],[4,-8,5.5,5.5],
        [-8,-2,5.5,3.5],                  [4,-2,5.5,3.5],
        [-8, 4,5.5,5.5],[-2, 4,3.5,5.5],[4, 4,5.5,5.5],
      ].map(([cx, cz, bw, bd], i) => (
        <mesh key={i} receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.01, cz]}>
          <planeGeometry args={[bw, bd]} />
          <meshStandardMaterial color={MAP_BLOCK} roughness={1} />
        </mesh>
      ))}

      {/* ─── Park (green space top-right) ─── */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[7, 0, -7]}>
        <planeGeometry args={[4.5, 4.5]} />
        <meshStandardMaterial color={MAP_PARK} roughness={1} />
      </mesh>
      {/* Park border path */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[7, 0.001, -7]}>
        <ringGeometry args={[1.8, 2.1, 32]} />
        <meshStandardMaterial color="#a9c97a" roughness={1} />
      </mesh>

      {/* ─── Water feature (small pond) ─── */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[-7, 0, 7]}>
        <circleGeometry args={[1.4, 24]} />
        <meshStandardMaterial color={MAP_WATER} roughness={0.1} metalness={0.2} />
      </mesh>

      {/* ─── Major roads (wide white) ─── */}
      {/* E-W main road */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <planeGeometry args={[28, 1.4]} />
        <meshStandardMaterial color={MAP_ROAD_MJ} roughness={0.95} />
      </mesh>
      {/* N-S main road */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <planeGeometry args={[1.4, 28]} />
        <meshStandardMaterial color={MAP_ROAD_MJ} roughness={0.95} />
      </mesh>
      {/* Road centre line dashes (yellow) */}
      {[-10,-6,-2,2,6,10].map((x, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.012, 0]}>
          <planeGeometry args={[1.0, 0.06]} />
          <meshStandardMaterial color="#f9d71c" />
        </mesh>
      ))}
      {[-10,-6,-2,2,6,10].map((z, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, z]}>
          <planeGeometry args={[0.06, 1.0]} />
          <meshStandardMaterial color="#f9d71c" />
        </mesh>
      ))}

      {/* ─── Minor roads ─── */}
      {[-5.5, 5.5].map((z, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, z]}>
          <planeGeometry args={[28, 0.7]} />
          <meshStandardMaterial color={MAP_ROAD_MN} roughness={0.95} />
        </mesh>
      ))}
      {[-5.5, 5.5].map((x, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.004, 0]}>
          <planeGeometry args={[0.7, 28]} />
          <meshStandardMaterial color={MAP_ROAD_MN} roughness={0.95} />
        </mesh>
      ))}

      {/* ─── Pavements/sidewalks alongside main roads ─── */}
      {[0.9, -0.9].map((z, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, z]}>
          <planeGeometry args={[28, 0.2]} />
          <meshStandardMaterial color={MAP_PAVEMENT} roughness={1} />
        </mesh>
      ))}
      {[0.9, -0.9].map((x, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.003, 0]}>
          <planeGeometry args={[0.2, 28]} />
          <meshStandardMaterial color={MAP_PAVEMENT} roughness={1} />
        </mesh>
      ))}

      {/* ─── Parking lot ─── */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[4, 0.002, 4]}>
        <planeGeometry args={[2.5, 2.5]} />
        <meshStandardMaterial color="#d9d5cc" roughness={1} />
      </mesh>
      {/* Parking lines */}
      {[-0.8, -0.3, 0.2, 0.7].map((ox, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[4 + ox, 0.013, 4]}>
          <planeGeometry args={[0.05, 2.2]} />
          <meshStandardMaterial color="#a8a5a0" />
        </mesh>
      ))}

      {/* ─── Trees ─── */}
      {treePositions.map(([tx, tz], i) => <Tree key={i} x={tx} z={tz} />)}

      {/* ─── Street lights ─── */}
      {lightPositions.map(([lx, lz], i) => <StreetLight key={i} x={lx} z={lz} />)}

      {/* ─── Zebra crossing ─── */}
      {[-0.5, -0.25, 0, 0.25, 0.5].map((ox, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[ox * 0.22, 0.014, 1.1]}>
          <planeGeometry args={[0.16, 0.55]} />
          <meshStandardMaterial color="#f5f1e8" />
        </mesh>
      ))}
    </>
  );
}

// ─── Main City Canvas ─────────────────────────────────────────────────────────
export default function CityCanvas() {
  const buildings = useSimStore(s => s.buildings);
  const selectBuilding = useSimStore(s => s.selectBuilding);

  const substationPos = useMemo(() =>
    new THREE.Vector3(-3, 0.5, 3), []);

  return (
    <Canvas
      camera={{ position: [12, 10, 12], fov: 42 }}
      shadows
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
      style={{ background: '#e8e4db' }}   // pale sky/ground colour
    >
      {/* Natural daylight rig */}
      <ambientLight intensity={1.8} color="#fff8f0" />
      <directionalLight
        position={[15, 20, 10]}
        intensity={2.2}
        color="#fffdf5"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={60}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
      />
      {/* Fill light from opposite side – soften shadows */}
      <directionalLight position={[-10, 8, -10]} intensity={0.5} color="#ddeeff" />
      {/* Sky hemisphere */}
      <hemisphereLight args={['#c9e8ff', '#b0a898', 0.6]} />

      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        maxPolarAngle={Math.PI / 2.15}
        minPolarAngle={0.2}
        minDistance={4}
        maxDistance={30}
        panSpeed={0.8}
        zoomSpeed={1.2}
      />

      {/* Ground, roads, park, water, trees */}
      <CityGround />

      {/* Procedural background city buildings */}
      <BackgroundBuildings />

      {/* Key simulation buildings */}
      {buildings.map(b => (
        <BuildingMesh key={b.id} building={b} onClick={selectBuilding} />
      ))}

      {/* Underground cable / power-line overlays – only show when abnormal */}
      {buildings
        .filter(b => b.type !== 'substation')
        .map(b => (
          <CableLine
            key={b.id}
            from={substationPos}
            to={new THREE.Vector3(b.position.x, 0.5, b.position.z)}
            status={b.status}
          />
        ))}
    </Canvas>
  );
}
