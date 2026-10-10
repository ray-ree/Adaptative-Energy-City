/**
 * Basic tests for Adaptive Energy City scheduling engine.
 * Run with: npx vitest run
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { generateBaseSlots } from '../data/cityData';
import {
  activeDemandAt,
  solarAt,
  netGridDemandAt,
  runScheduler,
  computeSlots,
} from '../engine/scheduler';
import type { Building, Device, SimulationState } from '../types/energy';

// ─── Test Building Factory ────────────────────────────────────────────────────
function makeBuilding(overrides: Partial<Building> = {}): Building {
  return {
    id: 'test_building',
    name: 'Test Building',
    type: 'factory',
    position: { x: 0, y: 0, z: 0 },
    gridCapacityKW: 100,
    baseDemandKW: 10,
    solarCapacityKW: 0,
    tariffRsPerKWh: 8.0,
    status: 'normal',
    devices: [],
    ...overrides,
  };
}

function makeDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: 'dev1',
    name: 'Test Device',
    powerKW: 20,
    priority: 'flexible',
    status: 'running',
    earliestSlot: 0,
    deadlineSlot: 90,
    durationSlots: 4,
    assignedSlot: 36, // 09:00
    ...overrides,
  };
}

const BASE_SLOTS = generateBaseSlots();

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('generateBaseSlots', () => {
  it('generates exactly 96 slots', () => {
    expect(BASE_SLOTS).toHaveLength(96);
  });

  it('starts at 00:00 and ends at 23:45', () => {
    expect(BASE_SLOTS[0].label).toBe('00:00');
    expect(BASE_SLOTS[95].label).toBe('23:45');
  });

  it('slot 48 (12:00) has peak solar factor', () => {
    const noon = BASE_SLOTS[48];
    const morning = BASE_SLOTS[24]; // 06:00
    expect(noon.solarFactor).toBeGreaterThan(morning.solarFactor);
  });

  it('night slots have zero solar factor', () => {
    const midnight = BASE_SLOTS[0]; // 00:00
    const threeAM = BASE_SLOTS[12]; // 03:00
    expect(midnight.solarFactor).toBe(0);
    expect(threeAM.solarFactor).toBe(0);
  });

  it('prices are never negative', () => {
    for (const slot of BASE_SLOTS) {
      expect(slot.priceRsPerKWh).toBeGreaterThan(0);
    }
  });

  it('evening peak (18-21h) has higher prices than morning', () => {
    const evening = BASE_SLOTS[72]; // 18:00
    const morning = BASE_SLOTS[24]; // 06:00
    expect(evening.priceRsPerKWh).toBeGreaterThan(morning.priceRsPerKWh);
  });
});

describe('activeDemandAt', () => {
  it('returns baseDemand when no devices', () => {
    const b = makeBuilding({ baseDemandKW: 15 });
    expect(activeDemandAt(b, 36)).toBe(15);
  });

  it('adds active device power at its assigned slot', () => {
    const b = makeBuilding({
      baseDemandKW: 10,
      devices: [makeDevice({ powerKW: 30, assignedSlot: 36, durationSlots: 4 })],
    });
    expect(activeDemandAt(b, 36)).toBe(40);
    expect(activeDemandAt(b, 39)).toBe(40); // still in window
    expect(activeDemandAt(b, 40)).toBe(10); // outside window
  });

  it('does not count delayed devices', () => {
    const b = makeBuilding({
      baseDemandKW: 10,
      devices: [makeDevice({ status: 'delayed', powerKW: 50 })],
    });
    expect(activeDemandAt(b, 36)).toBe(10);
  });

  it('demand is never negative', () => {
    const b = makeBuilding({ baseDemandKW: 0 });
    expect(activeDemandAt(b, 0)).toBeGreaterThanOrEqual(0);
  });
});

describe('solarAt', () => {
  it('returns 0 at midnight', () => {
    const b = makeBuilding({ solarCapacityKW: 50 });
    expect(solarAt(b, 0, BASE_SLOTS, 1)).toBe(0);
  });

  it('returns proportional solar at noon', () => {
    const b = makeBuilding({ solarCapacityKW: 100 });
    const noonSolar = solarAt(b, 48, BASE_SLOTS, 1);
    expect(noonSolar).toBeGreaterThan(0);
    expect(noonSolar).toBeLessThanOrEqual(100);
  });

  it('solar drop factor reduces generation', () => {
    const b = makeBuilding({ solarCapacityKW: 100 });
    const full = solarAt(b, 48, BASE_SLOTS, 1);
    const dropped = solarAt(b, 48, BASE_SLOTS, 0.2);
    expect(dropped).toBeLessThan(full);
    expect(dropped).toBeCloseTo(full * 0.2, 1);
  });

  it('zero solar capacity returns 0', () => {
    const b = makeBuilding({ solarCapacityKW: 0 });
    expect(solarAt(b, 48, BASE_SLOTS, 1)).toBe(0);
  });
});

describe('netGridDemandAt', () => {
  it('net demand = demand - solar (clamped to 0)', () => {
    const b = makeBuilding({ baseDemandKW: 30, solarCapacityKW: 100 });
    // At noon, solar > demand, net should be 0
    const net = netGridDemandAt(b, 48, BASE_SLOTS, 1);
    expect(net).toBeGreaterThanOrEqual(0);
  });

  it('net demand = demand when no solar', () => {
    const b = makeBuilding({ baseDemandKW: 40, solarCapacityKW: 0 });
    expect(netGridDemandAt(b, 36, BASE_SLOTS, 1)).toBe(40);
  });
});

describe('Power limit validation', () => {
  it('detects capacity violation when demand exceeds grid limit', () => {
    const b = makeBuilding({
      gridCapacityKW: 100,
      baseDemandKW: 20,
      devices: [
        makeDevice({ id: 'd1', powerKW: 50, priority: 'high', assignedSlot: 36 }),
        makeDevice({ id: 'd2', powerKW: 20, priority: 'flexible', assignedSlot: 36 }),
        makeDevice({ id: 'd3', powerKW: 25, priority: 'deferrable', assignedSlot: 36 }),
      ],
    });
    // Total: 20 + 50 + 20 + 25 = 115 kW > 100 kW limit
    const demand = activeDemandAt(b, 36);
    expect(demand).toBe(115);
    expect(demand).toBeGreaterThan(b.gridCapacityKW);
  });
});

describe('runScheduler', () => {
  function makeSimState(overrides: Partial<SimulationState> = {}): SimulationState {
    return {
      status: 'running',
      currentSlot: 36,
      speedMultiplier: 1,
      gridCapacityKW: 400,
      solarDropFactor: 1,
      priceSpikeMultiplier: 1,
      demandBoostKW: 0,
      buildings: [],
      slots: BASE_SLOTS,
      schedulingResult: null,
      explanations: [],
      networkStatus: 'normal',
      ...overrides,
    };
  }

  it('returns feasible when no buildings', () => {
    const result = runScheduler(makeSimState({ buildings: [] }));
    expect(result.feasible).toBe(true);
    expect(result.remainingViolations).toBe(0);
  });

  it('detects factory overload scenario', () => {
    const factory = makeBuilding({
      id: 'factory_test',
      gridCapacityKW: 100,
      baseDemandKW: 20,
      devices: [
        makeDevice({ id: 'critical1', powerKW: 20, priority: 'critical', assignedSlot: 36, durationSlots: 60, deadlineSlot: 95 }),
        makeDevice({ id: 'high1', powerKW: 50, priority: 'high', assignedSlot: 36, durationSlots: 4, deadlineSlot: 60 }),
        makeDevice({ id: 'flex1', powerKW: 20, priority: 'flexible', assignedSlot: 36, durationSlots: 4, deadlineSlot: 80 }),
        makeDevice({ id: 'defer1', powerKW: 25, priority: 'deferrable', assignedSlot: 36, durationSlots: 4, deadlineSlot: 80 }),
      ],
    });
    const state = makeSimState({ buildings: [factory] });
    const result = runScheduler(state);

    // Should detect overload and try to reschedule
    expect(result.originalPeakDemandKW).toBeGreaterThan(0);
    expect(result.explanations.length).toBeGreaterThan(0);
    // Critical device should never be rescheduled
    const criticalRescheduled = result.rescheduledDevices.some(r => r.device.id === 'critical1');
    expect(criticalRescheduled).toBe(false);
  });

  it('critical loads are never rescheduled', () => {
    const building = makeBuilding({
      gridCapacityKW: 5, // very low — forces rescheduling
      baseDemandKW: 0,
      devices: [
        makeDevice({ id: 'crit', powerKW: 20, priority: 'critical', assignedSlot: 36 }),
        makeDevice({ id: 'defer', powerKW: 30, priority: 'deferrable', assignedSlot: 36, deadlineSlot: 90 }),
      ],
    });
    const result = runScheduler(makeSimState({ buildings: [building] }));
    const critMoved = result.rescheduledDevices.some(r => r.device.id === 'crit');
    expect(critMoved).toBe(false);
  });

  it('cost calculation is positive', () => {
    const building = makeBuilding({
      baseDemandKW: 30,
      devices: [makeDevice({ powerKW: 10, assignedSlot: 36, durationSlots: 4 })],
    });
    const result = runScheduler(makeSimState({ buildings: [building] }));
    expect(result.originalCostRs).toBeGreaterThan(0);
  });

  it('solar generation reduces grid import cost', () => {
    const noSolar = makeBuilding({ baseDemandKW: 50, solarCapacityKW: 0 });
    const withSolar = makeBuilding({ baseDemandKW: 50, solarCapacityKW: 100 });

    const r1 = runScheduler(makeSimState({ buildings: [noSolar] }));
    const r2 = runScheduler(makeSimState({ buildings: [withSolar] }));

    expect(r2.originalCostRs).toBeLessThan(r1.originalCostRs);
    expect(r2.solarUsedKWh).toBeGreaterThan(0);
  });

  it('price spike increases cost', () => {
    const building = makeBuilding({ baseDemandKW: 50 });
    const r1 = runScheduler(makeSimState({ buildings: [building], priceSpikeMultiplier: 1 }));
    const r2 = runScheduler(makeSimState({ buildings: [building], priceSpikeMultiplier: 2 }));
    expect(r2.originalCostRs).toBeGreaterThan(r1.originalCostRs);
  });

  it('infeasible when critical loads alone exceed capacity', () => {
    const building = makeBuilding({
      gridCapacityKW: 5, // far below critical load
      baseDemandKW: 0,
      devices: [
        makeDevice({ id: 'crit', powerKW: 100, priority: 'critical', assignedSlot: 36, durationSlots: 60, deadlineSlot: 95 }),
      ],
    });
    const result = runScheduler(makeSimState({ buildings: [building] }));
    // Can't reschedule critical, so violation remains
    expect(result.remainingViolations).toBeGreaterThan(0);
    expect(result.feasible).toBe(false);
  });
});

describe('computeSlots', () => {
  it('returns 96 slots', () => {
    const slots = computeSlots([], BASE_SLOTS, 1, 1, 0, 400);
    expect(slots).toHaveLength(96);
  });

  it('demand boost is reflected in totalDemandKW', () => {
    const slots = computeSlots([], BASE_SLOTS, 1, 1, 100, 400);
    expect(slots[36].totalDemandKW).toBe(100);
  });

  it('gridCapacityKW is preserved in slots', () => {
    const slots = computeSlots([], BASE_SLOTS, 1, 1, 0, 250);
    expect(slots[0].gridCapacityKW).toBe(250);
  });

  it('all values are non-negative', () => {
    const building = makeBuilding({ baseDemandKW: 50, solarCapacityKW: 100 });
    const slots = computeSlots([building], BASE_SLOTS, 1, 1, 0, 400);
    for (const s of slots) {
      expect(s.totalDemandKW).toBeGreaterThanOrEqual(0);
      expect(s.solarGenKW).toBeGreaterThanOrEqual(0);
      expect(s.gridImportKW).toBeGreaterThanOrEqual(0);
      expect(s.costRs).toBeGreaterThanOrEqual(0);
    }
  });
});
