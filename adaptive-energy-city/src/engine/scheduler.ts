import type {
  Building,
  Device,
  SchedulingResult,
  SimulationState,
  TimeSlot,
} from '../types/energy';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Building's total active device demand at a given slot */
export function activeDemandAt(b: Building, slot: number): number {
  let demand = b.baseDemandKW;
  for (const d of b.devices) {
    if (d.status === 'running' || d.status === 'rescheduled') {
      const end = d.assignedSlot + d.durationSlots;
      if (slot >= d.assignedSlot && slot < end) {
        demand += d.powerKW;
      }
    }
  }
  return demand;
}

/** Solar generation for a building at a slot */
export function solarAt(
  b: Building,
  slot: number,
  slots: TimeSlot[],
  solarDropFactor: number
): number {
  return b.solarCapacityKW * slots[slot].solarFactor * solarDropFactor;
}

/** Net grid demand for a building */
export function netGridDemandAt(
  b: Building,
  slot: number,
  slots: TimeSlot[],
  solarDropFactor: number
): number {
  return Math.max(0, activeDemandAt(b, slot) - solarAt(b, slot, slots, solarDropFactor));
}

// ─── Scheduling Engine ───────────────────────────────────────────────────────

/**
 * Greedy priority-aware scheduling engine.
 * Runs on every state change and returns a new SchedulingResult.
 */
export function runScheduler(state: SimulationState): SchedulingResult {
  const { buildings, slots, currentSlot, solarDropFactor, priceSpikeMultiplier, demandBoostKW, gridCapacityKW } = state;

  const explanations: string[] = [];
  const rescheduledDevices: { buildingId: string; device: Device }[] = [];

  // Deep-clone buildings & devices for mutation
  const workBuildings: Building[] = buildings.map(b => ({
    ...b,
    devices: b.devices.map(d => ({ ...d })),
  }));

  // Apply price spike to slots
  const workSlots: TimeSlot[] = slots.map(s => ({
    ...s,
    priceRsPerKWh: s.priceRsPerKWh * priceSpikeMultiplier,
    gridCapacityKW,
  }));

  // ── Before scheduling: compute original peak / cost ──────────────────────
  let originalPeak = 0;
  let originalCost = 0;
  for (let s = 0; s < 96; s++) {
    let slotDemand = demandBoostKW;
    let slotSolar = 0;
    for (const b of workBuildings) {
      slotDemand += activeDemandAt(b, s);
      slotSolar += solarAt(b, s, workSlots, solarDropFactor);
    }
    slotDemand = Math.max(0, slotDemand);
    slotSolar = Math.min(slotSolar, slotDemand);
    const gridImport = Math.max(0, slotDemand - slotSolar);
    const price = workSlots[s].priceRsPerKWh;
    originalCost += gridImport * 0.25 * price; // kWh = kW × 0.25h
    originalPeak = Math.max(originalPeak, slotDemand);
  }

  // ── Check for violations at current slot ─────────────────────────────────
  let totalDemandNow = demandBoostKW;
  let totalSolarNow = 0;
  for (const b of workBuildings) {
    totalDemandNow += activeDemandAt(b, currentSlot);
    totalSolarNow += solarAt(b, currentSlot, workSlots, solarDropFactor);
  }
  totalSolarNow = Math.min(totalSolarNow, totalDemandNow);
  const gridNeededNow = Math.max(0, totalDemandNow - totalSolarNow);

  const cityOverload = gridNeededNow > gridCapacityKW;

  if (solarDropFactor < 1) {
    explanations.push(
      `⚠️ Solar generation dropped to ${Math.round(solarDropFactor * 100)}% of peak capacity.`
    );
  }
  if (priceSpikeMultiplier > 1) {
    explanations.push(
      `💰 Electricity prices spiked to ${priceSpikeMultiplier.toFixed(1)}× normal rates.`
    );
  }
  if (demandBoostKW > 0) {
    explanations.push(
      `📈 Extra demand of ${demandBoostKW} kW added to the network.`
    );
  }
  if (gridCapacityKW < 400) {
    explanations.push(
      `🔌 Grid capacity reduced to ${gridCapacityKW} kW (normal: 400 kW).`
    );
  }

  // Per-building capacity check and reschedule
  let delayedActivities = 0;
  let remainingViolations = 0;
  let deadlinesMet = 0;
  let deadlinesMissed = 0;

  for (const b of workBuildings) {
    const netDemand = netGridDemandAt(b, currentSlot, workSlots, solarDropFactor);
    const overLimit = netDemand > b.gridCapacityKW;

    if (!overLimit && !cityOverload) continue;

    explanations.push(
      `🏢 ${b.name}: grid demand ${Math.round(netDemand)} kW vs limit ${b.gridCapacityKW} kW — scheduling required.`
    );

    // Sort devices: critical first, then high, then flexible, then deferrable
    const priorityOrder: Record<string, number> = {
      critical: 0, high: 1, flexible: 2, deferrable: 3,
    };
    const sorted = [...b.devices].sort(
      (a, z) => priorityOrder[a.priority] - priorityOrder[z.priority]
    );

    for (const dev of sorted) {
      const d = b.devices.find(x => x.id === dev.id)!;
      if (d.status !== 'running') continue;
      if (d.priority === 'critical') continue; // never touch critical

      const currentNetDemand = netGridDemandAt(b, currentSlot, workSlots, solarDropFactor);
      if (currentNetDemand <= b.gridCapacityKW && !cityOverload) break;

      // Try to find a better slot — prefer low price, respect deadline
      let bestSlot: number | null = null;
      let bestPrice = Infinity;

      for (let s = currentSlot + 1; s <= d.deadlineSlot - d.durationSlots + 1; s++) {
        // Check if device fits in this new slot (simple single-slot feasibility)
        const testDemand = netGridDemandAt(b, s, workSlots, solarDropFactor) + d.powerKW;
        const testSolar = solarAt(b, s, workSlots, solarDropFactor);
        const testNet = Math.max(0, testDemand - testSolar);
        if (testNet <= b.gridCapacityKW) {
          const p = workSlots[s].priceRsPerKWh;
          if (p < bestPrice) {
            bestPrice = p;
            bestSlot = s;
          }
        }
      }

      if (bestSlot !== null) {
        d.assignedSlot = bestSlot;
        d.status = 'rescheduled';
        d.rescheduleReason = `Rescheduled to ${workSlots[bestSlot].label} (₹${bestPrice.toFixed(2)}/kWh) to relieve capacity constraint.`;
        explanations.push(
          `⏰ ${d.name} (${b.name}): delayed to ${workSlots[bestSlot].label}. Reason: capacity constraint. Price: ₹${bestPrice.toFixed(2)}/kWh.`
        );
        rescheduledDevices.push({ buildingId: b.id, device: { ...d } });
        delayedActivities++;
        deadlinesMet++;
      } else {
        // Can we still push within deadline?
        if (d.deadlineSlot >= currentSlot) {
          d.status = 'delayed';
          d.rescheduleReason = `No feasible low-cost slot found; delayed within deadline window.`;
          explanations.push(
            `❌ ${d.name} (${b.name}): no feasible reschedule slot found within deadline. Deadline slot: ${d.deadlineSlot}.`
          );
          deadlinesMissed++;
        }
        remainingViolations++;
      }
    }

    // Re-check after scheduling
    const netAfter = netGridDemandAt(b, currentSlot, workSlots, solarDropFactor);
    if (netAfter > b.gridCapacityKW) {
      remainingViolations++;
      explanations.push(
        `⚠️ ${b.name}: capacity still exceeded after rescheduling (${Math.round(netAfter)} kW > ${b.gridCapacityKW} kW). Critical loads cannot be moved.`
      );
    } else {
      explanations.push(`✅ ${b.name}: capacity restored after rescheduling.`);
    }
  }

  // City-level violation
  let totalDemandAfter = demandBoostKW;
  let totalSolarAfter = 0;
  for (const b of workBuildings) {
    totalDemandAfter += activeDemandAt(b, currentSlot);
    totalSolarAfter += solarAt(b, currentSlot, workSlots, solarDropFactor);
  }
  totalSolarAfter = Math.min(totalSolarAfter, totalDemandAfter);
  const gridAfter = Math.max(0, totalDemandAfter - totalSolarAfter);

  if (cityOverload && gridAfter <= gridCapacityKW) {
    explanations.push(`✅ City grid load restored within ${gridCapacityKW} kW limit.`);
  } else if (cityOverload && gridAfter > gridCapacityKW) {
    explanations.push(
      `🚨 City grid still overloaded: ${Math.round(gridAfter)} kW > ${gridCapacityKW} kW limit.`
    );
    remainingViolations++;
  }

  if (explanations.length === 0) {
    explanations.push('✅ All systems operating normally within capacity limits.');
  }

  // ── After scheduling: compute revised peak / cost ─────────────────────────
  let revisedPeak = 0;
  let revisedCost = 0;
  let solarUsedKWh = 0;
  let gridImportKWh = 0;

  for (let s = 0; s < 96; s++) {
    let slotDemand = demandBoostKW;
    let slotSolar = 0;
    for (const b of workBuildings) {
      slotDemand += activeDemandAt(b, s);
      slotSolar += solarAt(b, s, workSlots, solarDropFactor);
    }
    slotDemand = Math.max(0, slotDemand);
    slotSolar = Math.min(slotSolar, slotDemand);
    const gridImp = Math.max(0, slotDemand - slotSolar);
    const price = workSlots[s].priceRsPerKWh;
    revisedCost += gridImp * 0.25 * price;
    solarUsedKWh += slotSolar * 0.25;
    gridImportKWh += gridImp * 0.25;
    revisedPeak = Math.max(revisedPeak, slotDemand);
  }

  const feasible = remainingViolations === 0;

  return {
    feasible,
    originalPeakDemandKW: Math.round(originalPeak),
    revisedPeakDemandKW: Math.round(revisedPeak),
    originalCostRs: Math.round(originalCost),
    revisedCostRs: Math.round(revisedCost),
    solarUsedKWh: Math.round(solarUsedKWh),
    gridImportKWh: Math.round(gridImportKWh),
    delayedActivities,
    deadlinesMet,
    deadlinesMissed,
    remainingViolations,
    explanations,
    rescheduledDevices,
  };
}

// ─── Slot Aggregation ────────────────────────────────────────────────────────
export function computeSlots(
  buildings: Building[],
  baseSlots: TimeSlot[],
  solarDropFactor: number,
  priceSpikeMultiplier: number,
  demandBoostKW: number,
  gridCapacityKW: number
): TimeSlot[] {
  return baseSlots.map(s => {
    let totalDemand = demandBoostKW;
    let totalSolar = 0;
    for (const b of buildings) {
      totalDemand += activeDemandAt(b, s.index);
      totalSolar += solarAt(b, s.index, baseSlots, solarDropFactor);
    }
    totalDemand = Math.max(0, totalDemand);
    totalSolar = Math.min(totalSolar, totalDemand);
    const gridImp = Math.max(0, totalDemand - totalSolar);
    const price = s.priceRsPerKWh * priceSpikeMultiplier;
    return {
      ...s,
      priceRsPerKWh: price,
      totalDemandKW: Math.round(totalDemand),
      solarGenKW: Math.round(totalSolar),
      gridImportKW: Math.round(gridImp),
      gridCapacityKW,
      costRs: Math.round(gridImp * 0.25 * price),
    };
  });
}
