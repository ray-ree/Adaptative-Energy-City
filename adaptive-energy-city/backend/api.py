"""
Adaptive Energy City — FastAPI Backend
=======================================
Serves all ML forecasting endpoints consumed by the React frontend.

Endpoints:
  GET  /health
  GET  /api/status
  POST /api/dataset/generate
  POST /api/models/train
  GET  /api/metrics
  GET  /api/forecast/{building_id}           24-h forecast
  GET  /api/forecast/city                    city-level 24-h forecast
  GET  /api/forecast/{building_id}/schedule  forecast-aware schedule
  GET  /api/notifications                    pending alerts
  GET  /api/buildings                        building meta

All forecast responses include a "data_source": "SYNTHETIC" field.
"""

import json
import math
import os
import subprocess
import sys
import warnings
from datetime import datetime, timedelta
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

warnings.filterwarnings("ignore")

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR    = Path(__file__).parent
DATA_PATH   = BASE_DIR / "data" / "energy_dataset.csv"
MODELS_DIR  = BASE_DIR / "models"
METRICS_PATH = MODELS_DIR / "metrics.json"

app = FastAPI(
    title="Adaptive Energy City — ML API",
    description="⚠ All forecasts are based on SYNTHETIC / SIMULATED data.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Building definitions (must match generate_dataset.py) ─────────────────────
BUILDINGS_META = {
    "b_hospital":     {"name": "City Hospital",          "type": "hospital",    "grid_cap_kw": 120, "solar_kw": 20},
    "b_factory_a":    {"name": "Smart Factory A",        "type": "factory",     "grid_cap_kw": 150, "solar_kw": 30},
    "b_office_tower": {"name": "Sunrise Office Tower",   "type": "office",      "grid_cap_kw": 100, "solar_kw": 15},
    "b_mall":         {"name": "Galaxy Shopping Mall",   "type": "mall",        "grid_cap_kw": 120, "solar_kw": 25},
    "b_residential":  {"name": "Green Residences",       "type": "residential", "grid_cap_kw":  60, "solar_kw": 10},
}

TOTAL_GRID_CAPACITY_KW = 400

# ── Utility helpers ───────────────────────────────────────────────────────────

def tariff(hour: int) -> float:
    if 22 <= hour or hour < 6:
        return 4.0
    elif 6 <= hour < 9 or 20 <= hour < 22:
        return 14.0
    elif 9 <= hour < 12 or 17 <= hour < 20:
        return 8.0
    elif 12 <= hour < 17:
        return 6.0
    return 8.0


def solar_factor(hour: int, month: int) -> float:
    summer_months = {4, 5, 6, 7, 8, 9}
    peak_amp = 0.95 if month in summer_months else 0.70
    value = peak_amp * math.exp(-0.5 * ((hour - 13) / 3.5) ** 2)
    return max(0.0, value)


def risk_category(prob: float) -> str:
    if prob < 0.25:
        return "Low"
    elif prob < 0.60:
        return "Medium"
    return "High"


def risk_color(cat: str) -> str:
    return {"Low": "#16a34a", "Medium": "#d97706", "High": "#dc2626"}.get(cat, "#6b7280")


def _load_model(path: Path):
    if not path.exists():
        return None
    return joblib.load(path)


# ── Inference helpers ─────────────────────────────────────────────────────────

def build_feature_row(hour: int, month: int, day_of_week: int, is_weekend: int,
                      sf: float, temp: float, price: float,
                      demand_lags: list, solar_lags: list,
                      demand_roll_6: float, demand_roll_24: float,
                      grid_cap: float) -> np.ndarray:
    """
    Construct one feature vector in the same order as FEATURE_COLS in train_models.py.
    demand_lags: [lag1, lag2, lag3, lag6, lag12, lag24]
    solar_lags:  [lag1, lag6, lag24]
    """
    row = [
        hour, day_of_week, month, is_weekend,
        sf, temp, price,
        *demand_lags,          # 6 values
        *solar_lags,           # 3 values
        demand_roll_6, demand_roll_24,
        grid_cap,
    ]
    return np.array(row, dtype=float).reshape(1, -1)


def get_recent_history(building_id: str, n_hours: int = 30) -> pd.DataFrame | None:
    """Return the last n_hours rows for a building from the saved dataset."""
    if not DATA_PATH.exists():
        return None
    df = pd.read_csv(DATA_PATH, parse_dates=["timestamp"])
    bdf = df[df["building_id"] == building_id].sort_values("timestamp").tail(n_hours)
    return bdf if len(bdf) >= 24 else None


def make_24h_forecast(building_id: str) -> list[dict]:
    """
    Generate 24-hour forecast for a specific building.
    Uses the last 30 rows from the dataset as the history seed.
    Falls back to a physics-based heuristic if models are not trained yet.
    """
    meta = BUILDINGS_META.get(building_id)
    if meta is None:
        raise HTTPException(status_code=404, detail=f"Building '{building_id}' not found.")

    demand_model   = _load_model(MODELS_DIR / f"{building_id}_demand.pkl")
    shortage_model = _load_model(MODELS_DIR / f"{building_id}_shortage.pkl")
    bld_meta       = _load_model(MODELS_DIR / f"{building_id}_meta.pkl")

    history = get_recent_history(building_id, n_hours=30)
    grid_cap = meta["grid_cap_kw"]

    # Seed demand/solar buffers from history or defaults
    if history is not None and not history.empty:
        demand_buf = list(history["demand_kw"].values[-30:])
        solar_buf  = list(history["solar_kw"].values[-30:])
    else:
        demand_buf = [40.0] * 30
        solar_buf  = [0.0]  * 30

    now = datetime.now().replace(minute=0, second=0, microsecond=0)
    forecasts = []

    for h_offset in range(24):
        ts  = now + timedelta(hours=h_offset)
        hr  = ts.hour
        mo  = ts.month
        dow = ts.weekday()
        is_weekend = int(dow >= 5)
        sf   = solar_factor(hr, mo)
        temp = 28.0 + 4 * math.sin(math.pi * (hr - 5) / 12)  # simple heuristic
        price = tariff(hr)

        d_lags = [demand_buf[-(l)] if len(demand_buf) >= l else demand_buf[-1]
                  for l in [1, 2, 3, 6, 12, 24]]
        s_lags = [solar_buf[-(l)] if len(solar_buf) >= l else 0.0
                  for l in [1, 6, 24]]
        d_roll6  = float(np.mean(demand_buf[-6:]  if len(demand_buf) >= 6  else demand_buf))
        d_roll24 = float(np.mean(demand_buf[-24:] if len(demand_buf) >= 24 else demand_buf))

        X = build_feature_row(
            hr, mo, dow, is_weekend, sf, temp, price,
            d_lags, s_lags, d_roll6, d_roll24, grid_cap
        )

        # ── Demand prediction ────────────────────────────────────────────────
        if demand_model is not None:
            pred_demand = float(demand_model.predict(X)[0])
        else:
            # Physics heuristic fallback
            from generate_dataset import demand_shape
            pred_demand = (
                meta.get("grid_cap_kw", 80) * 0.60
                * demand_shape(hr)
                * (1.15 if is_weekend else 1.0)
                + np.random.normal(0, 1.5)
            )
        pred_demand = max(5.0, pred_demand)

        # ── Solar prediction ─────────────────────────────────────────────────
        pred_solar = meta["solar_kw"] * sf * 0.88   # 88 % capacity factor

        # ── Grid import ───────────────────────────────────────────────────────
        pred_grid_import = max(0.0, pred_demand - pred_solar)
        pred_margin      = grid_cap - pred_grid_import

        # ── Shortage-risk prediction ─────────────────────────────────────────
        if shortage_model is not None:
            pressure = np.clip((d_lags[0] - s_lags[0]) / grid_cap, 0, 2)
            X_s = np.hstack([X, [[pressure]]])
            proba = shortage_model.predict_proba(X_s)
            # DummyClassifier for single-class buildings has only 1 column
            if proba.shape[1] >= 2:
                shortage_prob = float(proba[0, 1])
            else:
                shortage_prob = 0.0
        else:
            # Heuristic: risk proportional to grid pressure
            shortage_prob = max(0.0, min(1.0, (pred_grid_import / grid_cap - 0.75) * 2))

        risk_cat   = risk_category(shortage_prob)
        risk_col   = risk_color(risk_cat)

        # ── Explanation ───────────────────────────────────────────────────────
        reasons = []
        if price >= 14.0:
            reasons.append("Peak tariff period")
        if sf > 0.3:
            reasons.append(f"Solar contributing {pred_solar:.0f} kW")
        if risk_cat == "High":
            reasons.append("Grid import near capacity limit")
        if not reasons:
            reasons.append("Normal operating conditions")

        # ── Recommended action ────────────────────────────────────────────────
        action = None
        if risk_cat in ("Medium", "High") and h_offset <= 6:
            action = "Consider rescheduling flexible loads to off-peak hours."
        elif price >= 14.0:
            action = "Defer non-critical appliances to avoid peak tariff."

        forecasts.append({
            "timestamp":          ts.isoformat(),
            "hour":               hr,
            "h_offset":           h_offset,
            "building_id":        building_id,
            "building_name":      meta["name"],

            "pred_demand_kw":     round(pred_demand, 2),
            "pred_solar_kw":      round(pred_solar, 2),
            "pred_grid_import_kw": round(pred_grid_import, 2),
            "pred_tariff":        price,
            "grid_capacity_kw":   grid_cap,
            "pred_margin_kw":     round(pred_margin, 2),

            "shortage_prob":      round(shortage_prob, 4),
            "risk_category":      risk_cat,
            "risk_color":         risk_col,

            "price_peak":         int(price >= 14.0),
            "reasons":            reasons,
            "action":             action,
            "model_used":         "GradientBoosting" if demand_model else "Heuristic",
            "data_source":        "SYNTHETIC",
        })

        # Update rolling buffers for next step
        demand_buf.append(pred_demand)
        solar_buf.append(pred_solar)

    return forecasts


# ── Notification engine ───────────────────────────────────────────────────────

_notification_seen: set[str] = set()

def generate_notifications(all_forecasts: dict[str, list[dict]]) -> list[dict]:
    alerts = []
    for bld_id, fcs in all_forecasts.items():
        for fc in fcs:
            key = f"{bld_id}_{fc['timestamp']}_{fc['risk_category']}"
            if key in _notification_seen:
                continue

            if fc["risk_category"] == "High":
                alerts.append({
                    "id":         key,
                    "type":       "shortage_risk",
                    "severity":   "high",
                    "building":   fc["building_name"],
                    "timestamp":  fc["timestamp"],
                    "message":    f"⚠ High shortage risk for {fc['building_name']} at {fc['timestamp'][11:16]}. "
                                  f"Predicted grid import: {fc['pred_grid_import_kw']} kW / {fc['grid_capacity_kw']} kW capacity.",
                    "action":     fc.get("action"),
                })
                _notification_seen.add(key)

            if fc["price_peak"] and fc["h_offset"] <= 6:
                pk = f"{bld_id}_{fc['timestamp']}_price"
                if pk not in _notification_seen:
                    alerts.append({
                        "id":        pk,
                        "type":      "price_spike",
                        "severity":  "medium",
                        "building":  fc["building_name"],
                        "timestamp": fc["timestamp"],
                        "message":   f"💰 Peak tariff ₹{fc['pred_tariff']}/kWh expected for {fc['building_name']} at {fc['timestamp'][11:16]}.",
                        "action":    "Defer flexible appliances to off-peak (22:00–06:00).",
                    })
                    _notification_seen.add(pk)

    return sorted(alerts, key=lambda x: x["severity"])


# ── Forecast-aware scheduler ──────────────────────────────────────────────────

def forecast_schedule(building_id: str, forecasts: list[dict]) -> dict:
    """
    Simple greedy: move flexible loads from high-risk / high-cost hours
    to the cheapest safe hours within a 24-h window.
    """
    # Flexible load pool: fraction of demand that can be deferred
    meta = BUILDINGS_META[building_id]
    FLEX_FRACTION = 0.30  # 30 % of demand is deferrable

    original_cost = sum(
        fc["pred_grid_import_kw"] * fc["pred_tariff"] * 1.0   # 1 hour
        for fc in forecasts
    )

    rescheduled = []
    total_shifted_kw = 0.0

    for i, fc in enumerate(forecasts):
        if fc["risk_category"] in ("Medium", "High") or fc["price_peak"]:
            # Find earliest cheap window in next 6 hours
            flex_kw = fc["pred_demand_kw"] * FLEX_FRACTION
            best_h = None
            best_cost = fc["pred_tariff"]
            for j in range(i + 1, min(i + 7, len(forecasts))):
                if forecasts[j]["pred_tariff"] < best_cost and forecasts[j]["risk_category"] == "Low":
                    best_cost = forecasts[j]["pred_tariff"]
                    best_h = j

            if best_h is not None:
                rescheduled.append({
                    "from_ts":    fc["timestamp"],
                    "to_ts":      forecasts[best_h]["timestamp"],
                    "flex_kw":    round(flex_kw, 2),
                    "from_price": fc["pred_tariff"],
                    "to_price":   forecasts[best_h]["pred_tariff"],
                    "saving_rs":  round(flex_kw * (fc["pred_tariff"] - forecasts[best_h]["pred_tariff"]), 2),
                    "reason":     f"Moved from {fc['risk_category']} risk / ₹{fc['pred_tariff']}/kWh to safe ₹{forecasts[best_h]['pred_tariff']}/kWh slot",
                })
                total_shifted_kw += flex_kw

    total_saving = sum(r["saving_rs"] for r in rescheduled)
    revised_cost = original_cost - total_saving

    feasible = all(fc["pred_grid_import_kw"] <= fc["grid_capacity_kw"] for fc in forecasts)

    return {
        "building_id":      building_id,
        "original_cost_rs": round(original_cost, 2),
        "revised_cost_rs":  round(revised_cost, 2),
        "saving_rs":        round(total_saving, 2),
        "rescheduled_count": len(rescheduled),
        "total_shifted_kw": round(total_shifted_kw, 2),
        "rescheduled":      rescheduled,
        "feasible":         feasible,
        "data_source":      "SYNTHETIC",
        "disclaimer":       "Schedule based on synthetic forecast. Actual savings depend on real conditions.",
    }


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "data_source": "SYNTHETIC"}


@app.get("/api/status")
def api_status():
    return {
        "dataset_exists":  DATA_PATH.exists(),
        "models_trained":  METRICS_PATH.exists(),
        "buildings":       list(BUILDINGS_META.keys()),
        "data_source":     "SYNTHETIC",
    }


@app.get("/api/buildings")
def get_buildings():
    return [
        {"id": bid, **meta} for bid, meta in BUILDINGS_META.items()
    ]


@app.post("/api/dataset/generate")
def generate_dataset_endpoint():
    """Run the data generation script."""
    result = subprocess.run(
        [sys.executable, str(BASE_DIR / "generate_dataset.py")],
        capture_output=True, text=True, cwd=str(BASE_DIR)
    )
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr)
    return {"message": result.stdout.strip(), "data_source": "SYNTHETIC"}


@app.post("/api/models/train")
def train_models_endpoint():
    """Run the model training script (may take 30–120 s)."""
    result = subprocess.run(
        [sys.executable, str(BASE_DIR / "train_models.py")],
        capture_output=True, text=True, cwd=str(BASE_DIR)
    )
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr)
    return {"message": result.stdout.strip(), "data_source": "SYNTHETIC"}


@app.get("/api/metrics")
def get_metrics():
    if not METRICS_PATH.exists():
        raise HTTPException(status_code=404, detail="Models not trained yet. POST /api/models/train first.")
    with open(METRICS_PATH) as f:
        return json.load(f)


@app.get("/api/forecast/{building_id}")
def forecast_building(building_id: str):
    if building_id not in BUILDINGS_META:
        raise HTTPException(status_code=404, detail=f"Building '{building_id}' not found.")
    return {
        "building_id":  building_id,
        "forecast":     make_24h_forecast(building_id),
        "data_source":  "SYNTHETIC",
        "disclaimer":   "⚠ Predictions are based on synthetic simulated data, not real measurements.",
    }


@app.get("/api/forecast/city/summary")
def forecast_city():
    """Aggregate 24-h city-level forecast across all buildings."""
    city_fc = []
    for bld_id in BUILDINGS_META:
        bld_fcs = make_24h_forecast(bld_id)
        city_fc.append(bld_fcs)

    # Aggregate by hour offset
    n_hours = 24
    agg = []
    for i in range(n_hours):
        rows = [bld[i] for bld in city_fc]
        total_demand  = sum(r["pred_demand_kw"] for r in rows)
        total_solar   = sum(r["pred_solar_kw"] for r in rows)
        total_import  = sum(r["pred_grid_import_kw"] for r in rows)
        max_risk_prob = max(r["shortage_prob"] for r in rows)
        risk_cat = risk_category(max_risk_prob)
        agg.append({
            "timestamp":           rows[0]["timestamp"],
            "hour":                rows[0]["hour"],
            "total_demand_kw":     round(total_demand, 2),
            "total_solar_kw":      round(total_solar, 2),
            "total_grid_import_kw": round(total_import, 2),
            "city_grid_capacity_kw": TOTAL_GRID_CAPACITY_KW,
            "margin_kw":           round(TOTAL_GRID_CAPACITY_KW - total_import, 2),
            "pred_tariff":         rows[0]["pred_tariff"],
            "max_shortage_prob":   round(max_risk_prob, 4),
            "risk_category":       risk_cat,
            "risk_color":          risk_color(risk_cat),
            "data_source":         "SYNTHETIC",
        })

    # Generate notifications
    all_fc = {bld_id: city_fc[i] for i, bld_id in enumerate(BUILDINGS_META)}
    notifications = generate_notifications(all_fc)

    return {
        "city_forecast":  agg,
        "notifications":  notifications,
        "data_source":    "SYNTHETIC",
    }


@app.get("/api/forecast/{building_id}/schedule")
def forecast_schedule_endpoint(building_id: str):
    if building_id not in BUILDINGS_META:
        raise HTTPException(status_code=404, detail=f"Building '{building_id}' not found.")
    forecasts = make_24h_forecast(building_id)
    return forecast_schedule(building_id, forecasts)


@app.get("/api/notifications")
def get_notifications():
    all_fc = {}
    for bld_id in BUILDINGS_META:
        all_fc[bld_id] = make_24h_forecast(bld_id)
    return {"notifications": generate_notifications(all_fc), "data_source": "SYNTHETIC"}


# ═══════════════════════════════════════════════════════════════════════════════
# RESIDENT DASHBOARD — SSE REAL-TIME MONITORING
# ═══════════════════════════════════════════════════════════════════════════════
import asyncio
import threading
import time
from typing import AsyncGenerator

from fastapi import Query
from fastapi.responses import StreamingResponse

# ── In-memory resident sessions ────────────────────────────────────────────────
# Maps resident_id -> building_id.  Persisted only in RAM (no DB needed).
# In production, replace with signed JWT + DB lookup.
_resident_sessions: dict[str, str] = {}

# ── Monitoring state per building ──────────────────────────────────────────────
# Holds latest snapshot and versioned schedules to avoid re-sending duplicates.
_monitor_state: dict[str, dict] = {}
_schedule_version: dict[str, int] = {}
_alert_dedup: set[str] = set()   # keys already sent, never re-send same event

# ── SSE subscriber queues: building_id -> list[asyncio.Queue] ──────────────────
_sse_queues: dict[str, list[asyncio.Queue]] = {}
_sse_lock = threading.Lock()


def _register_queue(building_id: str, q: asyncio.Queue):
    with _sse_lock:
        _sse_queues.setdefault(building_id, []).append(q)


def _unregister_queue(building_id: str, q: asyncio.Queue):
    with _sse_lock:
        qs = _sse_queues.get(building_id, [])
        if q in qs:
            qs.remove(q)


async def _broadcast(building_id: str, event_type: str, data: dict):
    """Send an SSE event to all subscribers of a building."""
    payload = json.dumps({"type": event_type, "data": data, "ts": datetime.now().isoformat()})
    with _sse_lock:
        queues = list(_sse_queues.get(building_id, []))
    for q in queues:
        try:
            q.put_nowait(payload)
        except asyncio.QueueFull:
            pass   # slow client — skip this update


# ── Shortage-alert generator ───────────────────────────────────────────────────
def _evaluate_alerts(building_id: str, forecast: list[dict]) -> list[dict]:
    """
    Scan the 24-h forecast and generate alerts for upcoming high-risk / high-price
    windows.  Deduplicates via _alert_dedup so the same event is not re-sent.
    """
    new_alerts = []
    for fc in forecast:
        for window_h, label in [(24, "24h"), (12, "12h"), (6, "6h")]:
            if fc["h_offset"] <= window_h and fc["risk_category"] in ("Medium", "High"):
                key = f"{building_id}_{fc['timestamp']}_{label}_{fc['risk_category']}"
                if key in _alert_dedup:
                    continue
                _alert_dedup.add(key)
                deficit = max(0.0, fc["pred_grid_import_kw"] - fc["grid_capacity_kw"])
                new_alerts.append({
                    "alert_id":       key,
                    "building_id":    building_id,
                    "building_name":  BUILDINGS_META[building_id]["name"],
                    "predicted_time": fc["timestamp"],
                    "window_label":   label,
                    "risk_level":     fc["risk_category"],
                    "pred_demand_kw": fc["pred_demand_kw"],
                    "capacity_kw":    fc["grid_capacity_kw"],
                    "deficit_kw":     round(deficit, 2),
                    "shortage_prob":  fc["shortage_prob"],
                    "tariff":         fc["pred_tariff"],
                    "action":         fc.get("action") or "Review appliance schedule.",
                    "data_source":    "SYNTHETIC",
                })
    return new_alerts


# ── Adaptive rescheduling trigger ──────────────────────────────────────────────
_RESCHEDULE_THRESHOLD_CHANGE = 0.15   # retrigger if risk changes by >15 pp

def _should_reschedule(building_id: str, forecast: list[dict]) -> bool:
    """Return True if conditions changed enough to warrant a new schedule."""
    prev = _monitor_state.get(building_id, {})
    if not prev:
        return True
    prev_max_risk = prev.get("max_shortage_prob", 0.0)
    curr_max_risk = max(f["shortage_prob"] for f in forecast)
    if abs(curr_max_risk - prev_max_risk) > _RESCHEDULE_THRESHOLD_CHANGE:
        return True
    prev_solar = prev.get("total_solar_kw", 0.0)
    curr_solar = sum(f["pred_solar_kw"] for f in forecast[:6]) / 6
    if prev_solar > 0 and abs(curr_solar - prev_solar) / prev_solar > 0.20:
        return True
    return False


# ── Per-building monitoring loop ───────────────────────────────────────────────
async def _monitor_building(building_id: str):
    """
    Coroutine that polls the forecast every 60 s, evaluates alerts and scheduling,
    and broadcasts SSE events to subscribed resident dashboards.
    """
    poll_interval = 60   # seconds between polls
    while True:
        try:
            # 1. Fresh 24-h forecast
            forecast = make_24h_forecast(building_id)
            max_risk = max(f["shortage_prob"] for f in forecast)
            total_solar = sum(f["pred_solar_kw"] for f in forecast[:6]) / 6

            # 2. Snapshot update event
            snapshot = {
                "building_id":       building_id,
                "building_name":     BUILDINGS_META[building_id]["name"],
                "current_demand_kw": forecast[0]["pred_demand_kw"],
                "current_solar_kw":  forecast[0]["pred_solar_kw"],
                "current_import_kw": forecast[0]["pred_grid_import_kw"],
                "current_tariff":    forecast[0]["pred_tariff"],
                "grid_capacity_kw":  forecast[0]["grid_capacity_kw"],
                "risk_category":     forecast[0]["risk_category"],
                "shortage_prob":     forecast[0]["shortage_prob"],
                "next_24h_peak_kw":  max(f["pred_demand_kw"] for f in forecast),
                "max_risk_24h":      round(max_risk, 4),
                "last_updated":      datetime.now().isoformat(),
                "mode":              "SIMULATED",
                "data_source":       "SYNTHETIC",
            }
            await _broadcast(building_id, "snapshot", snapshot)

            # 3. Alert evaluation
            alerts = _evaluate_alerts(building_id, forecast)
            for alert in alerts:
                await _broadcast(building_id, "alert", alert)

            # 4. Adaptive rescheduling
            if _should_reschedule(building_id, forecast):
                schedule = forecast_schedule(building_id, forecast)
                ver = _schedule_version.get(building_id, 0) + 1
                _schedule_version[building_id] = ver
                schedule["version"] = ver
                schedule["trigger"] = "auto" if _monitor_state.get(building_id) else "initial"
                await _broadcast(building_id, "schedule", schedule)

            # 5. Save state for next iteration
            _monitor_state[building_id] = {
                "max_shortage_prob": max_risk,
                "total_solar_kw":    total_solar,
            }

        except Exception as exc:
            await _broadcast(building_id, "error", {
                "building_id": building_id,
                "message":     str(exc),
                "data_source": "SYNTHETIC",
            })

        await asyncio.sleep(poll_interval)


# ── Start monitoring loops on startup ─────────────────────────────────────────
@app.on_event("startup")
async def start_monitoring():
    for bld_id in BUILDINGS_META:
        asyncio.create_task(_monitor_building(bld_id))


# ── Resident session endpoints ─────────────────────────────────────────────────

class ResidentOnboard(BaseModel):
    resident_id: str
    building_id: str


@app.post("/api/resident/onboard")
def resident_onboard(body: ResidentOnboard):
    """
    Assign a resident to a building.
    In production this would be authenticated; here it's in-memory only.
    """
    if body.building_id not in BUILDINGS_META:
        raise HTTPException(status_code=404, detail=f"Building '{body.building_id}' not found.")
    _resident_sessions[body.resident_id] = body.building_id
    meta = BUILDINGS_META[body.building_id]
    return {
        "resident_id":  body.resident_id,
        "building_id":  body.building_id,
        "building_name": meta["name"],
        "building_type": meta["type"],
        "grid_cap_kw":   meta["grid_cap_kw"],
        "solar_kw":      meta["solar_kw"],
        "message":       "Onboarded successfully.",
    }


@app.get("/api/resident/{resident_id}/building")
def resident_building(resident_id: str):
    bld_id = _resident_sessions.get(resident_id)
    if not bld_id:
        raise HTTPException(status_code=404, detail="Resident not found. Call /api/resident/onboard first.")
    return {"resident_id": resident_id, "building_id": bld_id, **BUILDINGS_META[bld_id]}


@app.get("/api/resident/{resident_id}/forecast")
def resident_forecast(resident_id: str):
    """Return the 24-h forecast for this resident's building ONLY."""
    bld_id = _resident_sessions.get(resident_id)
    if not bld_id:
        raise HTTPException(status_code=404, detail="Resident not onboarded.")
    return {
        "resident_id": resident_id,
        "building_id": bld_id,
        "forecast":    make_24h_forecast(bld_id),
        "data_source": "SYNTHETIC",
    }


@app.get("/api/resident/{resident_id}/schedule")
def resident_schedule(resident_id: str):
    """Return forecast-aware schedule for this resident's building ONLY."""
    bld_id = _resident_sessions.get(resident_id)
    if not bld_id:
        raise HTTPException(status_code=404, detail="Resident not onboarded.")
    fc = make_24h_forecast(bld_id)
    return forecast_schedule(bld_id, fc)


@app.get("/api/resident/{resident_id}/alerts")
def resident_alerts(resident_id: str):
    """Return pending shortage alerts for this resident's building ONLY."""
    bld_id = _resident_sessions.get(resident_id)
    if not bld_id:
        raise HTTPException(status_code=404, detail="Resident not onboarded.")
    fc = make_24h_forecast(bld_id)
    return {
        "resident_id": resident_id,
        "building_id": bld_id,
        "alerts":      _evaluate_alerts(bld_id, fc),
        "data_source": "SYNTHETIC",
    }


# ── SSE stream endpoint ─────────────────────────────────────────────────────────

@app.get("/api/resident/{resident_id}/stream")
async def resident_stream(resident_id: str):
    """
    Server-Sent Events stream — delivers real-time updates to the resident
    dashboard for their assigned building only.  Other buildings' data is
    never included.
    """
    bld_id = _resident_sessions.get(resident_id)
    if not bld_id:
        raise HTTPException(status_code=404, detail="Resident not onboarded.")

    q: asyncio.Queue = asyncio.Queue(maxsize=50)
    _register_queue(bld_id, q)

    async def event_generator() -> AsyncGenerator[str, None]:
        # Send a hello event immediately
        hello = json.dumps({
            "type": "connected",
            "data": {
                "resident_id": resident_id,
                "building_id": bld_id,
                "building_name": BUILDINGS_META[bld_id]["name"],
                "message": "Live monitoring stream connected (SIMULATED).",
            },
            "ts": datetime.now().isoformat(),
        })
        yield f"data: {hello}\n\n"

        try:
            while True:
                try:
                    payload = await asyncio.wait_for(q.get(), timeout=30.0)
                    yield f"data: {payload}\n\n"
                except asyncio.TimeoutError:
                    # Send keep-alive comment to prevent connection drop
                    yield ": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            _unregister_queue(bld_id, q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":  "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run("api:app", host="127.0.0.1", port=8000, reload=False)

