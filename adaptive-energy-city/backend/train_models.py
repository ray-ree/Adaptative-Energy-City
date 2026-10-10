"""
Adaptive Energy City — ML Model Trainer
========================================
Trains three models on the synthetic dataset:

  A. Demand Forecasting     → GradientBoostingRegressor
  B. Price-Peak Forecasting → GradientBoostingClassifier
  C. Shortage-Risk Forecast → GradientBoostingClassifier (probability output)

Evaluation protocol:
  - Chronological train / val / test split (no random shuffle of time series).
  - Preprocessing fitted on training data only (no leakage).
  - Lagged features use past observations only.
  - Compared against naive baselines (same-hour-yesterday).
  - Metrics reported on held-out test set; results saved to models/metrics.json.

⚠  WARNING: Metrics are measured on SYNTHETIC / SIMULATED data.
   They reflect how well models learn the simulated patterns, NOT
   real-world forecasting accuracy.

Usage:
    python train_models.py
"""

import json
import os
import sys
import warnings

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor
from sklearn.metrics import (
    f1_score, mean_absolute_error, mean_squared_error,
    precision_score, recall_score, roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

warnings.filterwarnings("ignore")

DATA_PATH   = "data/energy_dataset.csv"
MODELS_DIR  = "models"
METRICS_PATH = os.path.join(MODELS_DIR, "metrics.json")

os.makedirs(MODELS_DIR, exist_ok=True)

# ── Feature engineering ───────────────────────────────────────────────────────

def add_lag_features(df: pd.DataFrame, building_id: str) -> pd.DataFrame:
    """Add lag features from PAST observations only — no leakage."""
    bdf = df[df["building_id"] == building_id].copy().sort_values("timestamp")
    for lag in [1, 2, 3, 6, 12, 24]:
        bdf[f"demand_lag_{lag}h"] = bdf["demand_kw"].shift(lag)
        bdf[f"solar_lag_{lag}h"]  = bdf["solar_kw"].shift(lag)
    bdf[f"demand_rolling_mean_6h"]  = bdf["demand_kw"].shift(1).rolling(6).mean()
    bdf[f"demand_rolling_mean_24h"] = bdf["demand_kw"].shift(1).rolling(24).mean()
    return bdf.dropna()


FEATURE_COLS = [
    "hour", "day_of_week", "month", "is_weekend",
    "solar_factor", "temperature_c", "tariff_rs_per_kwh",
    "demand_lag_1h", "demand_lag_2h", "demand_lag_3h",
    "demand_lag_6h", "demand_lag_12h", "demand_lag_24h",
    "solar_lag_1h", "solar_lag_6h", "solar_lag_24h",
    "demand_rolling_mean_6h", "demand_rolling_mean_24h",
    "grid_capacity_kw",
]

# ── Chronological split ───────────────────────────────────────────────────────
# 0–70 % train, 70–85 % val (hyperparameter selection, not used here),
# 85–100 % test (evaluation reported to user).
TRAIN_FRAC = 0.70
TEST_FRAC  = 0.15   # from end


def chrono_split(df: pd.DataFrame):
    n = len(df)
    train_end = int(n * TRAIN_FRAC)
    test_start = int(n * (1 - TEST_FRAC))
    return (
        df.iloc[:train_end],
        df.iloc[train_end:test_start],
        df.iloc[test_start:],
    )


# ── Naive baseline ────────────────────────────────────────────────────────────
def same_hour_yesterday_baseline(train: pd.DataFrame, test: pd.DataFrame, target: str):
    """
    Naive baseline: predict the value at the same hour from 24h ago.
    Uses demand_lag_24h which was computed from past data only.
    """
    lag_col = f"{target.replace('_kw','')}_lag_24h"
    if lag_col not in test.columns:
        lag_col = "demand_lag_24h"
    return test[lag_col].fillna(test[target].mean()).values


# ── Per-building training ─────────────────────────────────────────────────────
def train_building(bld_id: str, df: pd.DataFrame) -> dict:
    print(f"\n  [{bld_id}] Building features …")
    bdf = add_lag_features(df, bld_id)

    train, val, test = chrono_split(bdf)
    print(f"    Train: {len(train)} | Val: {len(val)} | Test: {len(test)} rows")

    X_tr  = train[FEATURE_COLS].values
    X_val = val[FEATURE_COLS].values
    X_te  = test[FEATURE_COLS].values

    metrics = {}

    # ── A: Demand forecasting ─────────────────────────────────────────────────
    print("    Training demand model …")
    y_demand_tr = train["demand_kw"].values
    y_demand_te = test["demand_kw"].values

    demand_pipe = Pipeline([
        ("scaler", StandardScaler()),
        ("gbr", GradientBoostingRegressor(
            n_estimators=150, max_depth=4, learning_rate=0.08,
            subsample=0.8, random_state=42
        )),
    ])
    demand_pipe.fit(X_tr, y_demand_tr)
    pred_demand = demand_pipe.predict(X_te)

    base_demand = same_hour_yesterday_baseline(train, test, "demand_kw")
    mae_model   = mean_absolute_error(y_demand_te, pred_demand)
    rmse_model  = np.sqrt(mean_squared_error(y_demand_te, pred_demand))
    mae_base    = mean_absolute_error(y_demand_te, base_demand)
    rmse_base   = np.sqrt(mean_squared_error(y_demand_te, base_demand))

    metrics["demand"] = {
        "model_mae_kw":   round(mae_model, 3),
        "model_rmse_kw":  round(rmse_model, 3),
        "baseline_mae_kw":  round(mae_base, 3),
        "baseline_rmse_kw": round(rmse_base, 3),
        "improvement_pct": round((mae_base - mae_model) / mae_base * 100, 1),
    }
    print(f"    Demand MAE={mae_model:.2f} kW  (baseline={mae_base:.2f} kW)")
    joblib.dump(demand_pipe, os.path.join(MODELS_DIR, f"{bld_id}_demand.pkl"))

    # ── B: Price-peak forecasting ─────────────────────────────────────────────
    # The simulated tariff is deterministic from hour alone, so a model
    # that learns hour features will achieve near-perfect accuracy.
    # This is EXPECTED given the synthetic structure.
    print("    Training price-peak model …")
    y_price_tr = train["price_peak"].values
    y_price_te = test["price_peak"].values

    price_pipe = Pipeline([
        ("scaler", StandardScaler()),
        ("gbc", GradientBoostingClassifier(
            n_estimators=80, max_depth=3, learning_rate=0.1,
            random_state=42
        )),
    ])
    price_pipe.fit(X_tr, y_price_tr)
    pred_price_prob = price_pipe.predict_proba(X_te)[:, 1]
    pred_price_cls  = (pred_price_prob >= 0.5).astype(int)

    prec = precision_score(y_price_te, pred_price_cls, zero_division=0)
    rec  = recall_score(y_price_te, pred_price_cls, zero_division=0)
    f1   = f1_score(y_price_te, pred_price_cls, zero_division=0)
    auc  = roc_auc_score(y_price_te, pred_price_prob) if len(np.unique(y_price_te)) > 1 else 1.0

    metrics["price_peak"] = {
        "precision": round(prec, 4),
        "recall":    round(rec, 4),
        "f1":        round(f1, 4),
        "roc_auc":   round(auc, 4),
        "note": "Near-perfect scores expected: simulated tariff is deterministic by hour.",
    }
    print(f"    Price-peak F1={f1:.3f}  AUC={auc:.3f}")
    joblib.dump(price_pipe, os.path.join(MODELS_DIR, f"{bld_id}_price_peak.pkl"))

    # ── C: Shortage-risk forecasting ─────────────────────────────────────────
    print("    Training shortage-risk model …")
    y_shortage_tr = train["shortage"].values
    y_shortage_te = test["shortage"].values

    # Add grid-pressure feature: how close demand is to capacity
    def add_pressure(X, bdf_subset, capacity):
        demand_lag1 = bdf_subset["demand_lag_1h"].values.reshape(-1, 1)
        solar_lag1  = bdf_subset["solar_lag_1h"].values.reshape(-1, 1)
        pressure    = np.clip((demand_lag1 - solar_lag1) / capacity, 0, 2)
        return np.hstack([X, pressure])

    cap = bdf["grid_capacity_kw"].iloc[0]
    X_tr_s  = add_pressure(X_tr,  train, cap)
    X_te_s  = add_pressure(X_te,  test,  cap)

    n_unique_train = len(np.unique(y_shortage_tr))

    if n_unique_train < 2:
        # Only one class in training — building has no/all shortages. Skip ML model.
        print(f"    Shortage-risk: only {n_unique_train} class in training; using constant model.")
        majority_class = int(y_shortage_tr[0])
        # Dummy pipeline that always predicts majority
        from sklearn.dummy import DummyClassifier
        shortage_pipe = Pipeline([
            ("scaler", StandardScaler()),
            ("gbc", DummyClassifier(strategy="constant", constant=majority_class)),
        ])
        shortage_pipe.fit(X_tr_s, y_shortage_tr)
        s_prec, s_rec, s_f1, s_auc = 0.0, 0.0, 0.0, 0.5
    else:
        shortage_pipe = Pipeline([
            ("scaler", StandardScaler()),
            ("gbc", GradientBoostingClassifier(
                n_estimators=120, max_depth=4, learning_rate=0.08,
                subsample=0.8, random_state=42
            )),
        ])
        shortage_pipe.fit(X_tr_s, y_shortage_tr)
        pred_shortage_prob = shortage_pipe.predict_proba(X_te_s)[:, 1]
        pred_shortage_cls  = (pred_shortage_prob >= 0.40).astype(int)

        s_prec = precision_score(y_shortage_te, pred_shortage_cls, zero_division=0)
        s_rec  = recall_score(y_shortage_te, pred_shortage_cls, zero_division=0)
        s_f1   = f1_score(y_shortage_te, pred_shortage_cls, zero_division=0)
        try:
            s_auc = roc_auc_score(y_shortage_te, pred_shortage_prob)
        except ValueError:
            s_auc = 0.5

    metrics["shortage_risk"] = {
        "precision": round(s_prec, 4),
        "recall":    round(s_rec, 4),
        "f1":        round(s_f1, 4),
        "roc_auc":   round(s_auc, 4),
        "threshold": 0.40,
        "risk_categories": {
            "Low":    "probability < 0.25",
            "Medium": "0.25 ≤ probability < 0.60",
            "High":   "probability ≥ 0.60",
        },
    }
    print(f"    Shortage-risk F1={s_f1:.3f}  AUC={s_auc:.3f}")
    joblib.dump(shortage_pipe, os.path.join(MODELS_DIR, f"{bld_id}_shortage.pkl"))

    # Save pressure-feature flag so inference knows to append it
    joblib.dump({"grid_capacity_kw": cap}, os.path.join(MODELS_DIR, f"{bld_id}_meta.pkl"))

    return metrics


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    if not os.path.exists(DATA_PATH):
        print(f"[ERROR] Dataset not found at {DATA_PATH}.")
        print("        Run:  python generate_dataset.py")
        sys.exit(1)

    print("[SYNTHETIC DATA] Loading dataset …")
    df = pd.read_csv(DATA_PATH, parse_dates=["timestamp"])
    print(f"  {len(df):,} rows | {df['building_id'].nunique()} buildings")

    all_metrics = {
        "dataset": "SYNTHETIC — metrics measure fit on simulated patterns, not real-world accuracy.",
        "train_fraction":    TRAIN_FRAC,
        "test_fraction":     TEST_FRAC,
        "split_method":      "chronological (no shuffle)",
        "buildings":         {},
    }

    for bld in df["building_id"].unique():
        bld_metrics = train_building(bld, df)
        all_metrics["buildings"][bld] = bld_metrics

    with open(METRICS_PATH, "w") as f:
        json.dump(all_metrics, f, indent=2)

    print(f"\n[OK] Models saved to '{MODELS_DIR}/'")
    print(f"[OK] Metrics saved to '{METRICS_PATH}'")
    print("\nWARNING: All metrics are on SYNTHETIC / SIMULATED data.")


if __name__ == "__main__":
    main()
