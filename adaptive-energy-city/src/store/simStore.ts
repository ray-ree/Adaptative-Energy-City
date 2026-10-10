import { create } from 'zustand';
import type { SimulationState, Building, SimulationEvent, TimeSlot } from '../types/energy';
import { INITIAL_BUILDINGS, generateBaseSlots } from '../data/cityData';
import { runScheduler, computeSlots, activeDemandAt, solarAt } from '../engine/scheduler';

const BASE_SLOTS = generateBaseSlots();

function cloneBuildings(bs: Building[]): Building[] {
  return bs.map(b => ({ ...b, devices: b.devices.map(d => ({ ...d })) }));
}

function buildInitialState(): SimulationState {
  const buildings = cloneBuildings(INITIAL_BUILDINGS);
  const slots = computeSlots(buildings, BASE_SLOTS, 1, 1, 0, 400);
  return {
    status: 'idle',
    currentSlot: 36, // 09:00
    speedMultiplier: 1,
    gridCapacityKW: 400,
    solarDropFactor: 1,
    priceSpikeMultiplier: 1,
    demandBoostKW: 0,
    buildings,
    slots,
    schedulingResult: null,
    explanations: ['Welcome to Adaptive Energy City! Press "Start Simulation" or "Run Power Shortage Demo" to begin.'],
    networkStatus: 'normal',
  };
}

/** Recompute slots + run scheduler + update building statuses */
function recalc(partial: Partial<SimulationState> & Pick<SimulationState, 'buildings' | 'slots' | 'currentSlot' | 'solarDropFactor' | 'priceSpikeMultiplier' | 'demandBoostKW' | 'gridCapacityKW' | 'status'>): Partial<SimulationState> {
  const { buildings, solarDropFactor, priceSpikeMultiplier, demandBoostKW, gridCapacityKW, currentSlot } = partial;

  const slots = computeSlots(buildings, BASE_SLOTS, solarDropFactor, priceSpikeMultiplier, demandBoostKW, gridCapacityKW);
  const currentSlotData = slots[currentSlot];
  const isShortage = currentSlotData.gridImportKW > gridCapacityKW;

  const fullState: SimulationState = {
    ...partial,
    slots,
    schedulingResult: null,
    explanations: [],
    networkStatus: 'normal',
  };

  const result = runScheduler(fullState);

  // Update building statuses & device states from scheduler result
  const updatedBuildings = buildings.map(b => {
    let status = b.status;
    if (b.type === 'solar_farm') {
      status = solarDropFactor < 0.5 ? 'warning' : 'solar';
    } else if (b.type === 'substation') {
      status = isShortage ? 'overloaded' : 'normal';
    } else {
      const bDemand = activeDemandAt(b, currentSlot);
      const bSolar = solarAt(b, currentSlot, slots, solarDropFactor);
      const bNet = Math.max(0, bDemand - bSolar);
      if (bNet > b.gridCapacityKW) status = 'overloaded';
      else if (bNet > b.gridCapacityKW * 0.8) status = 'warning';
      else if (bSolar > bDemand * 0.5) status = 'solar';
      else status = 'normal';
    }

    const updatedDevices = b.devices.map(d => {
      const rescheduled = result.rescheduledDevices.find(
        r => r.buildingId === b.id && r.device.id === d.id
      );
      return rescheduled ? { ...d, ...rescheduled.device } : d;
    });

    return { ...b, status, devices: updatedDevices };
  });

  const networkStatus = isShortage
    ? 'overloaded'
    : solarDropFactor < 0.5
    ? 'warning'
    : 'normal';

  let newStatus = partial.status;
  if (isShortage && newStatus === 'running') newStatus = 'shortage';
  else if (!isShortage && newStatus === 'shortage') newStatus = 'resolved';

  return {
    slots,
    buildings: updatedBuildings,
    schedulingResult: result,
    explanations: result.explanations,
    networkStatus,
    status: newStatus,
  };
}

interface SimStore extends SimulationState {
  selectedBuildingId: string | null;
  showWelcome: boolean;
  view: '3d' | '2d';
  // Actions
  dismissWelcome: () => void;
  toggleView: () => void;
  selectBuilding: (id: string | null) => void;
  startSimulation: () => void;
  pauseSimulation: () => void;
  resetSimulation: () => void;
  advanceSlot: () => void;
  setSlot: (slot: number) => void;
  setSpeed: (s: number) => void;
  triggerEvent: (e: SimulationEvent) => void;
  runDemo: () => void;
  tick: () => void;
}

export const useSimStore = create<SimStore>((set, get) => ({
  ...buildInitialState(),
  selectedBuildingId: null,
  showWelcome: true,
  view: '3d',

  dismissWelcome: () => set({ showWelcome: false }),
  toggleView: () => set(s => ({ view: s.view === '3d' ? '2d' : '3d' })),
  selectBuilding: (id) => set({ selectedBuildingId: id }),
  startSimulation: () => set({ status: 'running' }),
  pauseSimulation: () => set(s => s.status === 'running' ? { status: 'paused' } : {}),

  resetSimulation: () => {
    const initial = buildInitialState();
    set({ ...initial, showWelcome: false, selectedBuildingId: null, view: get().view });
  },

  advanceSlot: () => {
    const s = get();
    const nextSlot = (s.currentSlot + 1) % 96;
    const updates = recalc({ ...s, currentSlot: nextSlot });
    set({ currentSlot: nextSlot, ...updates });
  },

  setSlot: (slot) => {
    const s = get();
    const updates = recalc({ ...s, currentSlot: slot });
    set({ currentSlot: slot, ...updates });
  },

  setSpeed: (speed) => set({ speedMultiplier: speed }),

  triggerEvent: (ev) => {
    const s = get();
    let patch: Partial<SimulationState> = {};
    switch (ev) {
      case 'solar_drop':
        patch = { solarDropFactor: Math.max(0.1, s.solarDropFactor - 0.3) };
        break;
      case 'price_spike':
        patch = { priceSpikeMultiplier: Math.min(3, s.priceSpikeMultiplier + 0.5) };
        break;
      case 'reduce_grid':
        patch = { gridCapacityKW: Math.max(100, s.gridCapacityKW - 80) };
        break;
      case 'increase_demand':
        patch = { demandBoostKW: Math.min(200, s.demandBoostKW + 50) };
        break;
      case 'restore_normal': {
        const fresh = buildInitialState();
        set({
          ...fresh,
          showWelcome: false,
          selectedBuildingId: null,
          view: s.view,
          status: s.status === 'running' ? 'running' : 'idle',
        });
        return;
      }
      case 'advance_slot':
        patch = { currentSlot: (s.currentSlot + 1) % 96 };
        break;
    }
    const merged = { ...s, ...patch } as SimulationState;
    const updates = recalc(merged);
    set({ ...patch, ...updates });
  },

  runDemo: () => {
    const s = get();
    const demoState = {
      ...s,
      currentSlot: 40, // 10:00
      status: 'running' as const,
      solarDropFactor: 0.2,
      demandBoostKW: 80,
      gridCapacityKW: 280,
      showWelcome: false,
    };
    const updates = recalc(demoState);
    set({ ...demoState, ...updates });
  },

  tick: () => {
    const s = get();
    if (s.status !== 'running' && s.status !== 'shortage') return;
    const nextSlot = (s.currentSlot + 1) % 96;
    const updates = recalc({ ...s, currentSlot: nextSlot });
    set({ currentSlot: nextSlot, ...updates });
  },
}));
