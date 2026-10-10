"""
Adaptive Energy City — Synthetic Dataset Generator
===================================================
Produces a reproducible 365-day, hourly synthetic energy dataset for
multiple buildings.  All data is labelled SYNTHETIC / SIMULATED.

Assumptions (documented):
  - Tariff follows a time-of-use (ToU) schedule: off-peak ₹4, mid ₹8,
    peak ₹14 per kWh.  Values are SIMULATED and not real market prices.
  - Solar irradiance follows a Gaussian bell centred on solar noon
    (13:00 IST) with seasonal amplitude.
  - Demand peaks at 08:00 (morning) and 19:00 (evening) with weekday
    load ~20 % higher than weekend.
  - Shortage is calculated from actual simulated constraints; it is NOT
    randomly assigned.
  - All power values are in kW; energy totals in kWh.

Usage:
    python generate_dataset.py          # writes data/energy_dataset.csv
    python generate_dataset.py --seed 99  # different seed
"""

import argparse
import math
import os
import random
import sys

import numpy as np
import pandas as pd

# ── Building profiles ──────────────────────────────────────────────────────────
BUILDINGS = [
    {
        "id": "b_hospital",
        "name": "City Hospital",
        "type": "hospital",
        "base_kw": 80,          # base HVAC + lighting
        "flex_kw": 25,          # flexible load pool
        "essential_kw": 55,     # always-on critical
        "solar_kw": 20,         # installed solar
        "grid_cap_kw": 120,     # feeder limit
        "demand_scale": 1.3,    # relative to residential baseline
        "weekend_scale": 0.90,
    },
    {
        "id": "b_factory_a",
        "name": "Smart Factory A",
        "type": "factory",
        "base_kw": 90,
        "flex_kw": 50,
        "essential_kw": 40,
        "solar_kw": 30,
        "grid_cap_kw": 150,
        "demand_scale": 1.5,
        "weekend_scale": 0.55,  # factory mostly weekdays
    },
    {
        "id": "b_office_tower",
        "name": "Sunrise Office Tower",
        "type": "office",
        "base_kw": 55,
        "flex_kw": 30,
        "essential_kw": 25,
        "solar_kw": 15,
        "grid_cap_kw": 100,
        "demand_scale": 1.1,
        "weekend_scale": 0.30,  # almost empty on weekends
    },
    {
        "id": "b_mall",
        "name": "Galaxy Shopping Mall",
        "type": "mall",
        "base_kw": 60,
        "flex_kw": 35,
        "essential_kw": 25,
        "solar_kw": 25,
        "grid_cap_kw": 120,
        "demand_scale": 1.2,
        "weekend_scale": 1.35,  # busier on weekends
    },
    {
        "id": "b_residential",
        "name": "Green Residences",
        "type": "residential",
        "base_kw": 35,
        "flex_kw": 20,
        "essential_kw": 15,
        "solar_kw": 10,
        "grid_cap_kw": 60,
        "demand_scale": 1.0,
        "weekend_scale": 1.15,
    },
]

TOTAL_GRID_CAPACITY_KW = 400   # city-level feeder

# ── Time-of-use tariff ─────────────────────────────────────────────────────────
def tariff(hour: int) -> float:
    """Simulated time-of-use tariff in ₹/kWh (NOT real market prices)."""
    if 22 <= hour or hour < 6:
        return 4.0   # off-peak
    elif 6 <= hour < 9 or 20 <= hour < 22:
        return 14.0  # morning / evening peak
    elif 9 <= hour < 12 or 17 <= hour < 20:
        return 8.0   # mid
    elif 12 <= hour < 17:
        return 6.0   # solar hours — cheaper
    return 8.0

# ── Solar irradiance factor ───────────────────────────────────────────────────
def solar_factor(hour: int, month: int) -> float:
    """
    Gaussian centred at hour 13 (1 PM IST).
    Peak amplitude varies seasonally: summer (Apr–Sep) > winter.
    """
    summer_months = {4, 5, 6, 7, 8, 9}
    peak_amp = 0.95 if month in summer_months else 0.70
    sigma = 3.5
    value = peak_amp * math.exp(-0.5 * ((hour - 13) / sigma) ** 2)
    return max(0.0, value)

# ── Demand shape ──────────────────────────────────────────────────────────────
def demand_shape(hour: int) -> float:
    """
    Normalised demand multiplier (0–1).
    Peaks at 08:00 and 19:00, trough at 03:00.
    """
    morning_peak = 0.85 * math.exp(-0.5 * ((hour - 8) / 1.5) ** 2)
    evening_peak = 1.00 * math.exp(-0.5 * ((hour - 19) / 2.0) ** 2)
    night_base   = 0.30
    return night_base + morning_peak + evening_peak

# ── Season ─────────────────────────────────────────────────────────────────────
def season(month: int) -> str:
    if month in (12, 1, 2):
        return "winter"
    elif month in (3, 4, 5):
        return "spring"
    elif month in (6, 7, 8):
        return "summer"
    return "autumn"

# ── Simulated temperature ─────────────────────────────────────────────────────
def temperature_c(hour: int, month: int, rng: np.random.Generator) -> float:
    """
    Rough daily temperature in °C — sinusoidal pattern.
    Peaks around 14:00, trough at 05:00.
    """
    month_mean = [22, 24, 28, 33, 37, 35, 32, 31, 30, 28, 25, 22]
    base = month_mean[month - 1]
    diurnal = 6 * math.sin(math.pi * (hour - 5) / 12)
    noise = rng.normal(0, 0.8)
    return round(base + diurnal + noise, 1)

# ── Main generator ─────────────────────────────────────────────────────────────
def generate_dataset(seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    random.seed(seed)

    start = pd.Timestamp("2024-01-01 00:00:00")
    hours = pd.date_range(start, periods=365 * 24, freq="1h")

    rows = []

    for ts in hours:
        h  = ts.hour
        dow = ts.dayofweek          # 0=Mon, 6=Sun
        mo  = ts.month
        is_weekend = int(dow >= 5)
        seas = season(mo)
        temp = temperature_c(h, mo, rng)
        sf   = solar_factor(h, mo)
        price = tariff(h)
        price_peak = int(price >= 14.0)

        for bld in BUILDINGS:
            # ── Demand ───────────────────────────────────────────────────────
            wd_scale = bld["weekend_scale"] if is_weekend else 1.0
            shape    = demand_shape(h)
            noise    = rng.normal(1.0, 0.04)           # ±4 % noise
            demand_kw = (
                bld["base_kw"]
                * bld["demand_scale"]
                * wd_scale
                * shape
                * noise
            )
            demand_kw = max(bld["essential_kw"] * 0.5, demand_kw)

            # ── Solar ─────────────────────────────────────────────────────────
            cloud_noise = rng.beta(8, 2)               # mostly clear
            solar_kw = bld["solar_kw"] * sf * cloud_noise

            # ── Flexible vs essential load ────────────────────────────────────
            # Essential = always-on; flexible = demand minus essential
            essential_kw = min(demand_kw, bld["essential_kw"])
            flexible_kw  = max(0, demand_kw - essential_kw)

            # ── Grid import ───────────────────────────────────────────────────
            grid_import_kw = max(0.0, demand_kw - solar_kw)
            grid_cap_kw    = bld["grid_cap_kw"]

            # ── Shortage ──────────────────────────────────────────────────────
            # Shortage occurs when grid import exceeds feeder capacity.
            # NOT randomly assigned.
            shortage = int(grid_import_kw > grid_cap_kw)
            overload_kw = max(0.0, grid_import_kw - grid_cap_kw)
            severity = (
                "none" if overload_kw == 0
                else "low" if overload_kw < grid_cap_kw * 0.10
                else "medium" if overload_kw < grid_cap_kw * 0.25
                else "high"
            )

            cost_rs = grid_import_kw * price          # per hour = kWh cost

            rows.append({
                # ── Identity ──────────────────────────────────────────────────
                "timestamp":          ts.isoformat(),
                "hour":               h,
                "day_of_week":        dow,
                "month":              mo,
                "is_weekend":         is_weekend,
                "season":             seas,
                "data_source":        "SYNTHETIC",    # explicit label

                # ── Building ──────────────────────────────────────────────────
                "building_id":        bld["id"],
                "building_name":      bld["name"],
                "building_type":      bld["type"],

                # ── Energy ────────────────────────────────────────────────────
                "demand_kw":          round(demand_kw, 3),
                "solar_kw":           round(solar_kw, 3),
                "grid_import_kw":     round(grid_import_kw, 3),
                "grid_capacity_kw":   grid_cap_kw,
                "essential_kw":       round(essential_kw, 3),
                "flexible_kw":        round(flexible_kw, 3),

                # ── Economics ─────────────────────────────────────────────────
                "tariff_rs_per_kwh":  price,
                "cost_rs":            round(cost_rs, 2),
                "price_peak":         price_peak,

                # ── Weather ───────────────────────────────────────────────────
                "temperature_c":      temp,
                "solar_factor":       round(sf, 4),

                # ── Labels ────────────────────────────────────────────────────
                "shortage":           shortage,
                "shortage_severity":  severity,
                "overload_kw":        round(overload_kw, 3),
            })

    df = pd.DataFrame(rows)
    return df


def main():
    parser = argparse.ArgumentParser(description="Generate Adaptive Energy City dataset")
    parser.add_argument("--seed",   type=int, default=42,   help="Random seed (default 42)")
    parser.add_argument("--output", type=str, default="data/energy_dataset.csv")
    args = parser.parse_args()

    out_dir = os.path.dirname(args.output)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    print(f"[SYNTHETIC DATA] Generating 365-day hourly dataset (seed={args.seed}) …")
    df = generate_dataset(seed=args.seed)

    df.to_csv(args.output, index=False)
    print(f"[OK] Saved {len(df):,} rows -> {args.output}")
    print(f"     Buildings: {df['building_id'].nunique()}")
    print(f"     Shortage rows: {df['shortage'].sum():,}")
    print(f"     Date range: {df['timestamp'].min()} to {df['timestamp'].max()}")
    print()
    print("⚠  NOTICE: This dataset is SYNTHETIC / SIMULATED.")
    print("   Tariff values do not represent real electricity market prices.")
    print("   Shortage labels are derived from simulated network constraints.")


if __name__ == "__main__":
    main()
