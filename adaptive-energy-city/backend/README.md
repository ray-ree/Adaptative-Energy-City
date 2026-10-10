# Adaptive Energy City — ML Backend

## Dataset Fields

| Column | Type | Description |
|---|---|---|
| `timestamp` | datetime | ISO 8601 UTC timestamp |
| `hour` | int 0–23 | Hour of day |
| `day_of_week` | int 0–6 | 0=Monday, 6=Sunday |
| `month` | int 1–12 | Calendar month |
| `is_weekend` | int 0/1 | 1 if Saturday or Sunday |
| `season` | str | winter/spring/summer/autumn |
| `data_source` | str | Always "SYNTHETIC" |
| `building_id` | str | Unique building identifier |
| `building_name` | str | Human-readable building name |
| `building_type` | str | hospital/factory/office/mall/residential |
| `demand_kw` | float | Total electricity demand in kW |
| `solar_kw` | float | Solar generation in kW |
| `grid_import_kw` | float | Net grid import in kW (demand − solar) |
| `grid_capacity_kw` | float | Building feeder capacity limit in kW |
| `essential_kw` | float | Always-on critical load in kW |
| `flexible_kw` | float | Deferrable load in kW |
| `tariff_rs_per_kwh` | float | **SIMULATED** tariff in ₹/kWh |
| `cost_rs` | float | Hourly cost in ₹ (grid_import × tariff) |
| `price_peak` | int 0/1 | 1 if tariff ≥ ₹14/kWh |
| `temperature_c` | float | Simulated outdoor temperature in °C |
| `solar_factor` | float | Solar irradiance factor 0–1 |
| `shortage` | int 0/1 | 1 if grid_import > grid_capacity (**calculated, not randomly assigned**) |
| `shortage_severity` | str | none/low/medium/high |
| `overload_kw` | float | Excess over feeder limit in kW |

## Assumptions

1. **Tariff schedule** — Time-of-use (ToU) with three bands:
   - Off-peak (22:00–06:00): ₹4/kWh
   - Mid (09:00–12:00, 17:00–20:00): ₹8/kWh
   - Solar hours (12:00–17:00): ₹6/kWh
   - Peak (06:00–09:00, 20:00–22:00): ₹14/kWh
   - ⚠ These are **SIMULATED** values, not real electricity market prices.

2. **Solar generation** — Gaussian bell centred at 13:00 IST. Summer months (Apr–Sep) have higher peak amplitude (0.95) than winter (0.70). Cloud variability modelled as Beta(8,2).

3. **Demand shape** — Double-peak profile: morning peak 08:00 and evening peak 19:00. Weekday/weekend scaling per building type.

4. **Shortage labelling** — Computed as `grid_import_kw > grid_capacity_kw`. Not randomly assigned. Severity thresholds: low < 10 %, medium < 25 %, high ≥ 25 % over limit.

5. **Temperature** — Sinusoidal daily profile with monthly mean. Noise added from Normal(0, 0.8).

6. **Random seed** — Default seed 42. Use `--seed N` to regenerate with a different seed.

## Data Generation

```bash
python generate_dataset.py           # seed=42, output: data/energy_dataset.csv
python generate_dataset.py --seed 7  # different seed
```

## Model Training

```bash
python train_models.py
```

Three models per building:
- **A. Demand** — GradientBoostingRegressor, MAE/RMSE vs same-hour-yesterday baseline
- **B. Price-peak** — GradientBoostingClassifier, precision/recall/F1/AUC
- **C. Shortage-risk** — GradientBoostingClassifier, probability output, risk categories: Low (<0.25), Medium (0.25–0.60), High (≥0.60)

Split: 70% train / 15% val / 15% test, **chronological** (no shuffle).

## API Server

```bash
python api.py
```

Runs on http://127.0.0.1:8000. Interactive docs at http://127.0.0.1:8000/docs.

## ⚠ Important Disclaimers

- **All data is SYNTHETIC / SIMULATED.** It does not represent real buildings, real power networks, or real market prices.
- **Model metrics measure performance on the simulated environment**, not real-world forecasting accuracy.
- Price-peak classification achieves near-perfect accuracy because the simulated tariff is deterministic by hour — this is expected and documented, not a data leakage bug.
- Shortage labels are causally derived from capacity constraints, not independently sampled.
