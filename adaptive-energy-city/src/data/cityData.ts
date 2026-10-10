import type { Building, TimeSlot } from '../types/energy';

// ─── 96 time-slots (00:00–23:45 in 15-min steps) ────────────────────────────
export function generateBaseSlots(): TimeSlot[] {
  const slots: TimeSlot[] = [];
  // Price curve: cheap at night, expensive 09-22h, peak 18-21h
  const priceBase = (idx: number): number => {
    const h = idx / 4;
    if (h < 6) return 4.5;
    if (h < 9) return 6.5;
    if (h < 18) return 8.0;
    if (h < 21) return 12.5; // evening peak
    if (h < 23) return 9.0;
    return 5.0;
  };
  // Solar irradiance: 0 at night, peak at noon
  const solarFactor = (idx: number): number => {
    const h = idx / 4;
    if (h < 6 || h >= 19) return 0;
    const peak = 13; // 13:00
    const factor = Math.max(0, 1 - Math.pow((h - peak) / 6.5, 2));
    return Math.min(1, factor);
  };
  for (let i = 0; i < 96; i++) {
    const totalMins = i * 15;
    const hh = String(Math.floor(totalMins / 60)).padStart(2, '0');
    const mm = String(totalMins % 60).padStart(2, '0');
    slots.push({
      index: i,
      label: `${hh}:${mm}`,
      priceRsPerKWh: priceBase(i),
      solarFactor: solarFactor(i),
      totalDemandKW: 0,
      solarGenKW: 0,
      gridImportKW: 0,
      gridCapacityKW: 400,
      costRs: 0,
    });
  }
  return slots;
}

// ─── Buildings ───────────────────────────────────────────────────────────────
export const INITIAL_BUILDINGS: Building[] = [
  // ── Hospital ──────────────────────────────────────────────────────────────
  {
    id: 'hospital_1',
    name: 'City Hospital',
    type: 'hospital',
    position: { x: -3, y: 0, z: -3 },
    gridCapacityKW: 120,
    baseDemandKW: 30,
    solarCapacityKW: 20,
    tariffRsPerKWh: 8.0,
    status: 'normal',
    label: 'City Hospital – 24/7 critical operations',
    devices: [
      { id: 'h1_icu', name: 'ICU Systems', powerKW: 20, priority: 'critical', status: 'running', earliestSlot: 0, deadlineSlot: 95, durationSlots: 96, assignedSlot: 0 },
      { id: 'h1_hvac', name: 'HVAC & Ventilation', powerKW: 25, priority: 'high', status: 'running', earliestSlot: 0, deadlineSlot: 95, durationSlots: 96, assignedSlot: 0 },
      { id: 'h1_lift', name: 'Elevators', powerKW: 10, priority: 'high', status: 'running', earliestSlot: 24, deadlineSlot: 88, durationSlots: 64, assignedSlot: 24 },
      { id: 'h1_laundry', name: 'Laundry Systems', powerKW: 15, priority: 'flexible', status: 'running', earliestSlot: 24, deadlineSlot: 80, durationSlots: 8, assignedSlot: 28 },
      { id: 'h1_ev', name: 'Ambulance EV Charging', powerKW: 22, priority: 'deferrable', status: 'running', earliestSlot: 0, deadlineSlot: 32, durationSlots: 4, assignedSlot: 4 },
    ],
  },
  // ── Factory ───────────────────────────────────────────────────────────────
  {
    id: 'factory_1',
    name: 'Smart Factory A',
    type: 'factory',
    position: { x: 3, y: 0, z: -3 },
    gridCapacityKW: 100,
    baseDemandKW: 10,
    solarCapacityKW: 30,
    tariffRsPerKWh: 8.0,
    status: 'normal',
    label: 'Smart Factory – Capacity limit 100 kW',
    devices: [
      { id: 'f1_safety', name: 'Essential Systems', powerKW: 20, priority: 'critical', status: 'running', earliestSlot: 0, deadlineSlot: 95, durationSlots: 96, assignedSlot: 0 },
      { id: 'f1_prod', name: 'Production Machinery', powerKW: 50, priority: 'high', status: 'running', earliestSlot: 16, deadlineSlot: 64, durationSlots: 32, assignedSlot: 16 },
      { id: 'f1_pump', name: 'Water Pumping', powerKW: 20, priority: 'flexible', status: 'running', earliestSlot: 16, deadlineSlot: 76, durationSlots: 4, assignedSlot: 20 },
      { id: 'f1_ev', name: 'EV Charging Bay', powerKW: 25, priority: 'deferrable', status: 'running', earliestSlot: 16, deadlineSlot: 80, durationSlots: 4, assignedSlot: 24 },
    ],
  },
  // ── Office Tower ──────────────────────────────────────────────────────────
  {
    id: 'office_1',
    name: 'Sunrise Office Tower',
    type: 'office',
    position: { x: 0, y: 0, z: -3 },
    gridCapacityKW: 90,
    baseDemandKW: 15,
    solarCapacityKW: 25,
    tariffRsPerKWh: 8.0,
    status: 'normal',
    label: 'Sunrise Office Tower – commercial complex',
    devices: [
      { id: 'o1_sec', name: 'Security & Fire Systems', powerKW: 8, priority: 'critical', status: 'running', earliestSlot: 0, deadlineSlot: 95, durationSlots: 96, assignedSlot: 0 },
      { id: 'o1_ac', name: 'Central Air Conditioning', powerKW: 35, priority: 'high', status: 'running', earliestSlot: 28, deadlineSlot: 72, durationSlots: 44, assignedSlot: 28 },
      { id: 'o1_light', name: 'General Lighting', powerKW: 12, priority: 'high', status: 'running', earliestSlot: 28, deadlineSlot: 72, durationSlots: 44, assignedSlot: 28 },
      { id: 'o1_server', name: 'Server Room', powerKW: 10, priority: 'flexible', status: 'running', earliestSlot: 0, deadlineSlot: 95, durationSlots: 96, assignedSlot: 0 },
      { id: 'o1_ev', name: 'EV Parking Chargers', powerKW: 18, priority: 'deferrable', status: 'running', earliestSlot: 28, deadlineSlot: 88, durationSlots: 12, assignedSlot: 36 },
    ],
  },
  // ── Shopping Mall ─────────────────────────────────────────────────────────
  {
    id: 'mall_1',
    name: 'Galaxy Shopping Mall',
    type: 'mall',
    position: { x: -3, y: 0, z: 0 },
    gridCapacityKW: 150,
    baseDemandKW: 20,
    solarCapacityKW: 40,
    tariffRsPerKWh: 8.0,
    status: 'normal',
    label: 'Galaxy Mall – high solar potential',
    devices: [
      { id: 'm1_fire', name: 'Fire Safety Systems', powerKW: 5, priority: 'critical', status: 'running', earliestSlot: 0, deadlineSlot: 95, durationSlots: 96, assignedSlot: 0 },
      { id: 'm1_ac', name: 'Mall HVAC', powerKW: 60, priority: 'high', status: 'running', earliestSlot: 24, deadlineSlot: 80, durationSlots: 56, assignedSlot: 24 },
      { id: 'm1_light', name: 'Display & Signage Lighting', powerKW: 20, priority: 'flexible', status: 'running', earliestSlot: 24, deadlineSlot: 80, durationSlots: 56, assignedSlot: 24 },
      { id: 'm1_food', name: 'Food Court Equipment', powerKW: 25, priority: 'flexible', status: 'running', earliestSlot: 28, deadlineSlot: 76, durationSlots: 40, assignedSlot: 28 },
      { id: 'm1_ev', name: 'EV Parking Chargers', powerKW: 30, priority: 'deferrable', status: 'running', earliestSlot: 24, deadlineSlot: 88, durationSlots: 24, assignedSlot: 40 },
    ],
  },
  // ── Residential Block ─────────────────────────────────────────────────────
  {
    id: 'residential_1',
    name: 'Green Residences',
    type: 'residential',
    position: { x: 3, y: 0, z: 0 },
    gridCapacityKW: 60,
    baseDemandKW: 12,
    solarCapacityKW: 15,
    tariffRsPerKWh: 6.5,
    status: 'normal',
    label: 'Green Residences – rooftop solar enabled',
    devices: [
      { id: 'r1_med', name: 'Medical Equipment (Home)', powerKW: 3, priority: 'critical', status: 'running', earliestSlot: 0, deadlineSlot: 95, durationSlots: 96, assignedSlot: 0 },
      { id: 'r1_light', name: 'Essential Lighting', powerKW: 8, priority: 'high', status: 'running', earliestSlot: 0, deadlineSlot: 95, durationSlots: 96, assignedSlot: 0 },
      { id: 'r1_water', name: 'Water Heating', powerKW: 12, priority: 'flexible', status: 'running', earliestSlot: 16, deadlineSlot: 40, durationSlots: 4, assignedSlot: 20 },
      { id: 'r1_wash', name: 'Washing Machines', powerKW: 8, priority: 'deferrable', status: 'running', earliestSlot: 16, deadlineSlot: 60, durationSlots: 4, assignedSlot: 28 },
      { id: 'r1_ev', name: 'Home EV Chargers', powerKW: 15, priority: 'deferrable', status: 'running', earliestSlot: 0, deadlineSlot: 28, durationSlots: 8, assignedSlot: 0 },
    ],
  },
  // ── Solar Farm ────────────────────────────────────────────────────────────
  {
    id: 'solar_farm',
    name: 'Solar Farm',
    type: 'solar_farm',
    position: { x: 0, y: 0, z: 3 },
    gridCapacityKW: 200,
    baseDemandKW: 2,
    solarCapacityKW: 150,
    tariffRsPerKWh: 0,
    status: 'solar',
    label: 'Community Solar Farm – 150 kW peak',
    devices: [],
  },
  // ── Substation ────────────────────────────────────────────────────────────
  {
    id: 'substation_1',
    name: 'District Substation',
    type: 'substation',
    position: { x: -3, y: 0, z: 3 },
    gridCapacityKW: 500,
    baseDemandKW: 5,
    solarCapacityKW: 0,
    tariffRsPerKWh: 0,
    status: 'normal',
    label: 'Main Distribution Substation',
    devices: [],
  },
  // ── EV Station ────────────────────────────────────────────────────────────
  {
    id: 'ev_station',
    name: 'Public EV Hub',
    type: 'ev_station',
    position: { x: 3, y: 0, z: 3 },
    gridCapacityKW: 80,
    baseDemandKW: 0,
    solarCapacityKW: 10,
    tariffRsPerKWh: 9.0,
    status: 'normal',
    label: 'Public EV Charging Hub – 80 kW capacity',
    devices: [
      { id: 'ev_fast1', name: 'Fast Charger #1', powerKW: 22, priority: 'high', status: 'running', earliestSlot: 0, deadlineSlot: 95, durationSlots: 96, assignedSlot: 0 },
      { id: 'ev_fast2', name: 'Fast Charger #2', powerKW: 22, priority: 'high', status: 'running', earliestSlot: 0, deadlineSlot: 95, durationSlots: 96, assignedSlot: 0 },
      { id: 'ev_slow', name: 'Slow Chargers (×4)', powerKW: 24, priority: 'deferrable', status: 'running', earliestSlot: 0, deadlineSlot: 95, durationSlots: 96, assignedSlot: 0 },
    ],
  },
];
