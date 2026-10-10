// ============================================================
// Energy Types — Adaptive Energy City
// ============================================================

export type BuildingType =
  | 'residential'
  | 'office'
  | 'hospital'
  | 'factory'
  | 'mall'
  | 'substation'
  | 'solar_farm'
  | 'ev_station';

export type LoadPriority = 'critical' | 'high' | 'flexible' | 'deferrable';
export type LoadStatus = 'running' | 'delayed' | 'rescheduled' | 'off';
export type NetworkStatus = 'normal' | 'warning' | 'overloaded' | 'solar' | 'inactive';
export type SimulationStatus = 'idle' | 'running' | 'paused' | 'shortage' | 'resolved';

export interface Device {
  id: string;
  name: string;
  powerKW: number;
  priority: LoadPriority;
  status: LoadStatus;
  /** Earliest slot index this device can start */
  earliestSlot: number;
  /** Latest slot index by which this device MUST start */
  deadlineSlot: number;
  /** Duration in 15-min slots */
  durationSlots: number;
  /** Assigned start slot after scheduling */
  assignedSlot: number;
  /** Reason for rescheduling */
  rescheduleReason?: string;
}

export interface Building {
  id: string;
  name: string;
  type: BuildingType;
  /** 3D / 2D position on city grid */
  position: { x: number; y: number; z: number };
  /** Max grid connection capacity in kW */
  gridCapacityKW: number;
  /** Base demand at current slot in kW (excluding devices) */
  baseDemandKW: number;
  /** kW of solar panels installed (0 if none) */
  solarCapacityKW: number;
  /** Tariff in ₹/kWh */
  tariffRsPerKWh: number;
  devices: Device[];
  status: NetworkStatus;
  /** Tooltip / info label */
  label?: string;
}

export interface PowerStation {
  id: string;
  name: string;
  position: { x: number; y: number };
  maxCapacityKW: number;
  currentOutputKW: number;
  type: 'grid' | 'solar';
}

export interface TimeSlot {
  /** 0-based index, 0 = 00:00, 1 = 00:15, …, 95 = 23:45 */
  index: number;
  /** Human readable label */
  label: string;
  /** Electricity price ₹/kWh */
  priceRsPerKWh: number;
  /** Solar irradiance factor 0–1 */
  solarFactor: number;
  /** Total demand kW across city */
  totalDemandKW: number;
  /** Solar generation kW */
  solarGenKW: number;
  /** Grid import kW */
  gridImportKW: number;
  /** Grid capacity kW at this slot */
  gridCapacityKW: number;
  /** Cost ₹ for this slot */
  costRs: number;
}

export interface SchedulingResult {
  feasible: boolean;
  originalPeakDemandKW: number;
  revisedPeakDemandKW: number;
  originalCostRs: number;
  revisedCostRs: number;
  solarUsedKWh: number;
  gridImportKWh: number;
  delayedActivities: number;
  deadlinesMet: number;
  deadlinesMissed: number;
  remainingViolations: number;
  explanations: string[];
  rescheduledDevices: { buildingId: string; device: Device }[];
}

export interface SimulationState {
  status: SimulationStatus;
  currentSlot: number;
  speedMultiplier: number;
  gridCapacityKW: number;
  solarDropFactor: number;
  priceSpikeMultiplier: number;
  demandBoostKW: number;
  buildings: Building[];
  slots: TimeSlot[];
  schedulingResult: SchedulingResult | null;
  explanations: string[];
  networkStatus: NetworkStatus;
}

export type SimulationEvent =
  | 'solar_drop'
  | 'price_spike'
  | 'reduce_grid'
  | 'increase_demand'
  | 'restore_normal'
  | 'advance_slot';
