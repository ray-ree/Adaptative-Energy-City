import React from 'react';
import { useSimStore } from '../store/simStore';

// Google-Maps-like palette for the 2D view
const MAP_BG      = '#f0ede4';
const MAP_BLOCK   = '#dbd7cd';
const MAP_ROAD_MJ = '#ffffff';
const MAP_ROAD_MN = '#f5f1e8';
const MAP_PARK    = '#c8dda7';
const MAP_WATER   = '#a8c8e8';
const MAP_PAVEMENT= '#e8e4d9';

// Energy status colours – used for overlays only
const STATUS_COLORS: Record<string, string> = {
  normal:     '#16a34a',
  warning:    '#d97706',
  overloaded: '#dc2626',
  solar:      '#2563eb',
  inactive:   '#9ca3af',
};

const BUILDING_ICONS: Record<string, string> = {
  hospital: '🏥', factory: '🏭', office: '🏢', mall: '🛍️',
  residential: '🏘️', solar_farm: '☀️', substation: '⚡', ev_station: '🔌',
};

const SCALE  = 55;
const OFFSET = { x: 220, y: 220 };

function worldToSVG(x: number, z: number) {
  return { x: x * SCALE + OFFSET.x, y: z * SCALE + OFFSET.y };
}

// Simple deterministic pseudo-random for background building placement
function seeded(seed: number) {
  let s = seed * 16807 % 2147483647;
  return (s - 1) / 2147483646;
}

export default function City2DView() {
  const buildings  = useSimStore(s => s.buildings);
  const selectedId = useSimStore(s => s.selectedBuildingId);
  const select     = useSimStore(s => s.selectBuilding);

  const substation = buildings.find(b => b.type === 'substation');
  const subPos = substation ? worldToSVG(substation.position.x, substation.position.z) : OFFSET;

  // Background buildings (procedural, seeded)
  const bgBuildings: Array<{ x: number; y: number; w: number; h: number; fill: string; stroke: string }> = [];
  const palette = ['#e8e2d6','#ddd8cc','#d4cfc3','#ccc7bc','#d8d3c8','#e0dbd0'];
  let seed = 1;
  for (let bi = 0; bi < 48; bi++) {
    const bx = (seeded(seed++) - 0.5) * 380 + 220;
    const bz = (seeded(seed++) - 0.5) * 380 + 220;
    // Skip positions too close to key buildings or roads
    if (Math.abs(bx - 220) < 42 || Math.abs(bz - 220) < 42) continue;
    if (bx < 20 || bx > 420 || bz < 20 || bz > 420) continue;
    const w  = seeded(seed++) * 18 + 8;
    const h  = seeded(seed++) * 18 + 8;
    const fi = Math.floor(seeded(seed++) * palette.length);
    bgBuildings.push({ x: bx - w / 2, y: bz - h / 2, w, h, fill: palette[fi], stroke: '#c4c0b6' });
  }

  return (
    <div className="city-2d-container">
      <svg width="100%" height="100%" viewBox="0 0 440 440" style={{ fontFamily: 'Inter, sans-serif' }}>
        {/* ── Base ground ── */}
        <rect x="0" y="0" width="440" height="440" fill={MAP_BG} />

        {/* ── City blocks ── */}
        {[
          [20,20,170,170],[250,20,170,170],
          [20,250,170,170],[250,250,170,170],
          [80,80,100,100],[260,80,100,100],
          [80,260,100,100],[260,260,100,100],
        ].map(([x,y,w,h],i) => (
          <rect key={i} x={x} y={y} width={w} height={h} fill={MAP_BLOCK} />
        ))}

        {/* ── Park ── */}
        <rect x="280" y="20" width="100" height="100" fill={MAP_PARK} rx="4" />
        <circle cx="330" cy="70" r="22" fill="#b2d190" />
        <circle cx="300" cy="55" r="12" fill="#b2d190" />
        <circle cx="355" cy="55" r="10" fill="#b2d190" />

        {/* ── Water ── */}
        <ellipse cx="80" cy="360" rx="48" ry="32" fill={MAP_WATER} />
        <ellipse cx="80" cy="360" rx="34" ry="22" fill="#92b8d8" opacity="0.5" />

        {/* ── Major roads ── */}
        <rect x="0" y="205" width="440" height="30" fill={MAP_ROAD_MJ} />
        <rect x="205" y="0" width="30" height="440" fill={MAP_ROAD_MJ} />
        {/* Centre dash */}
        {[0,30,60,90,120,150,180,210,240,270,300,330,360,390].map((x,i) => (
          <rect key={i} x={x+4} y="219" width="18" height="2" fill="#f9d71c" />
        ))}
        {[0,30,60,90,120,150,180,210,240,270,300,330,360,390].map((y,i) => (
          <rect key={i} x="219" y={y+4} width="2" height="18" fill="#f9d71c" />
        ))}
        {/* Pavements */}
        <rect x="0" y="203" width="440" height="3" fill={MAP_PAVEMENT} />
        <rect x="0" y="234" width="440" height="3" fill={MAP_PAVEMENT} />
        <rect x="203" y="0" width="3" height="440" fill={MAP_PAVEMENT} />
        <rect x="234" y="0" width="3" height="440" fill={MAP_PAVEMENT} />

        {/* ── Minor roads ── */}
        <rect x="0" y="140" width="440" height="14" fill={MAP_ROAD_MN} />
        <rect x="0" y="286" width="440" height="14" fill={MAP_ROAD_MN} />
        <rect x="140" y="0" width="14" height="440" fill={MAP_ROAD_MN} />
        <rect x="286" y="0" width="14" height="440" fill={MAP_ROAD_MN} />

        {/* ── Zebra crossing ── */}
        {[0,1,2,3,4].map(i => (
          <rect key={i} x={198+i*9} y="203" width="6" height="3" fill="#f5f1e8" />
        ))}

        {/* ── Background buildings (procedural) ── */}
        {bgBuildings.map((b, i) => (
          <g key={i}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={b.fill} stroke={b.stroke} strokeWidth="0.5" rx="1.5" />
          </g>
        ))}

        {/* ── Trees along major road ── */}
        {[40,80,120,160,280,320,360,400].map((x, i) => (
          <g key={i}>
            <circle cx={x} cy={198} r="6" fill="#4a7c3f" opacity="0.8" />
            <circle cx={x} cy={242} r="6" fill="#4a7c3f" opacity="0.8" />
          </g>
        ))}
        {[40,80,120,160,280,320,360,400].map((y, i) => (
          <g key={i}>
            <circle cx={198} cy={y} r="5" fill="#4a7c3f" opacity="0.7" />
            <circle cx={242} cy={y} r="5" fill="#4a7c3f" opacity="0.7" />
          </g>
        ))}

        {/* ── Connection lines (cables) — only abnormal ones highlighted ── */}
        {buildings.filter(b => b.type !== 'substation').map(b => {
          const bPos = worldToSVG(b.position.x, b.position.z);
          const isAbnormal = b.status !== 'normal' && b.status !== 'inactive';
          if (!isAbnormal) return null;
          const color = STATUS_COLORS[b.status] ?? '#16a34a';
          return (
            <g key={b.id + '_line'}>
              <line
                x1={subPos.x} y1={subPos.y}
                x2={bPos.x} y2={bPos.y}
                stroke={color} strokeWidth="2.5"
                strokeDasharray="7 4" opacity="0.8"
              >
                <animate attributeName="stroke-dashoffset" from="0" to="-22" dur="1.0s" repeatCount="indefinite" />
              </line>
            </g>
          );
        })}

        {/* ── Simulation buildings ── */}
        {buildings.map(b => {
          const pos = worldToSVG(b.position.x, b.position.z);
          const isSelected = b.id === selectedId;
          const isAbnormal = b.status !== 'normal' && b.status !== 'solar' && b.status !== 'inactive';
          const statusColor = STATUS_COLORS[b.status] ?? '#16a34a';
          const size = b.type === 'mall' || b.type === 'solar_farm' ? 40
            : b.type === 'factory' || b.type === 'hospital' ? 36
            : b.type === 'substation' ? 26 : 28;

          return (
            <g key={b.id} onClick={() => select(b.id)} style={{ cursor: 'pointer' }}>
              {/* Overload pulse ring */}
              {isAbnormal && (
                <circle cx={pos.x} cy={pos.y} r={size / 2 + 8} fill="none"
                  stroke={statusColor} strokeWidth="1.5" opacity="0.5">
                  <animate attributeName="r" from={size / 2 + 4} to={size / 2 + 12} dur="0.9s" repeatCount="indefinite" direction="alternate" />
                  <animate attributeName="opacity" from="0.5" to="0" dur="0.9s" repeatCount="indefinite" direction="alternate" />
                </circle>
              )}
              {/* Selection ring */}
              {isSelected && (
                <circle cx={pos.x} cy={pos.y} r={size / 2 + 7}
                  fill="none" stroke="#1d4ed8" strokeWidth="2.5" />
              )}
              {/* Building fill */}
              <rect
                x={pos.x - size / 2} y={pos.y - size / 2}
                width={size} height={size} rx="5"
                fill={isAbnormal ? `${statusColor}18` : '#ffffff'}
                stroke={isAbnormal ? statusColor : isSelected ? '#1d4ed8' : '#c4c0b6'}
                strokeWidth={isSelected || isAbnormal ? 2 : 1}
              />
              {/* Icon */}
              <text x={pos.x} y={pos.y + 1} textAnchor="middle"
                dominantBaseline="middle" fontSize="17">
                {BUILDING_ICONS[b.type] ?? '🏢'}
              </text>
              {/* Solar badge */}
              {b.solarCapacityKW > 0 && (
                <text x={pos.x + size / 2 - 6} y={pos.y - size / 2 + 6}
                  fontSize="9" textAnchor="middle">☀</text>
              )}
              {/* Name label */}
              <text x={pos.x} y={pos.y + size / 2 + 11}
                textAnchor="middle" fontSize="8" fill="#4b5563" fontWeight="500">
                {b.name}
              </text>
              {/* Status dot */}
              <circle cx={pos.x + size / 2 - 4} cy={pos.y - size / 2 + 4}
                r="4" fill={statusColor}
                stroke="white" strokeWidth="1" />
            </g>
          );
        })}

        {/* ── Compass ── */}
        <g transform="translate(410,30)">
          <circle cx="0" cy="0" r="14" fill="rgba(255,255,255,0.95)" stroke="#e4e1db" strokeWidth="1" />
          <text x="0" y="5" textAnchor="middle" fontSize="14" fontWeight="700" fill="#374151">N</text>
          <line x1="0" y1="-6" x2="0" y2="-12" stroke="#dc2626" strokeWidth="2" />
        </g>

        {/* ── Scale bar ── */}
        <g transform="translate(12,420)">
          <rect x="0" y="0" width="60" height="6" fill="none" stroke="#9ca3af" strokeWidth="1" />
          <rect x="0" y="0" width="30" height="6" fill="#9ca3af" />
          <text x="0" y="-3" fontSize="8" fill="#6b7280">0</text>
          <text x="27" y="-3" fontSize="8" fill="#6b7280">500m</text>
          <text x="54" y="-3" fontSize="8" fill="#6b7280">1km</text>
        </g>
      </svg>
    </div>
  );
}
