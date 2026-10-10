/**
 * useForecast — React hook that fetches ML forecast data from the Python backend.
 * Falls back to a heuristic estimate if the backend is unavailable.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = 'http://127.0.0.1:8000';
const POLL_MS  = 120_000;   // refresh every 2 minutes

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ForecastPoint {
  timestamp:          string;
  hour:               number;
  h_offset:           number;
  building_id:        string;
  building_name:      string;
  pred_demand_kw:     number;
  pred_solar_kw:      number;
  pred_grid_import_kw: number;
  pred_tariff:        number;
  grid_capacity_kw:   number;
  pred_margin_kw:     number;
  shortage_prob:      number;
  risk_category:      'Low' | 'Medium' | 'High';
  risk_color:         string;
  price_peak:         number;
  reasons:            string[];
  action:             string | null;
  model_used:         string;
  data_source:        string;
}

export interface CityForecastPoint {
  timestamp:              string;
  hour:                   number;
  total_demand_kw:        number;
  total_solar_kw:         number;
  total_grid_import_kw:   number;
  city_grid_capacity_kw:  number;
  margin_kw:              number;
  pred_tariff:            number;
  max_shortage_prob:      number;
  risk_category:          'Low' | 'Medium' | 'High';
  risk_color:             string;
}

export interface MLNotification {
  id:         string;
  type:       string;
  severity:   string;
  building:   string;
  timestamp:  string;
  message:    string;
  action:     string | null;
}

export interface ModelMetrics {
  dataset:  string;
  buildings: Record<string, {
    demand:         { model_mae_kw: number; model_rmse_kw: number; baseline_mae_kw: number; improvement_pct: number };
    price_peak:     { precision: number; recall: number; f1: number; roc_auc: number; note: string };
    shortage_risk:  { precision: number; recall: number; f1: number; roc_auc: number; risk_categories: Record<string, string> };
  }>;
}

export interface BackendStatus {
  dataset_exists:  boolean;
  models_trained:  boolean;
  buildings:       string[];
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useForecast(buildingId: string) {
  const [forecast,     setForecast]     = useState<ForecastPoint[]>([]);
  const [cityForecast, setCityForecast] = useState<CityForecastPoint[]>([]);
  const [notifications, setNotifications] = useState<MLNotification[]>([]);
  const [metrics,      setMetrics]      = useState<ModelMetrics | null>(null);
  const [status,       setStatus]       = useState<BackendStatus | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Check backend status first
      const statusRes = await fetch(`${API_BASE}/api/status`, { signal: AbortSignal.timeout(5000) });
      if (!statusRes.ok) throw new Error('Backend offline');
      const st: BackendStatus = await statusRes.json();
      setStatus(st);
      setBackendOnline(true);

      // Building forecast
      const fcRes = await fetch(`${API_BASE}/api/forecast/${buildingId}`, { signal: AbortSignal.timeout(10000) });
      if (fcRes.ok) {
        const fcData = await fcRes.json();
        setForecast(fcData.forecast ?? []);
      }

      // City forecast
      const cityRes = await fetch(`${API_BASE}/api/forecast/city/summary`, { signal: AbortSignal.timeout(15000) });
      if (cityRes.ok) {
        const cityData = await cityRes.json();
        setCityForecast(cityData.city_forecast ?? []);
        setNotifications(cityData.notifications ?? []);
      }

      // Metrics (only if models are trained)
      if (st.models_trained) {
        const metricsRes = await fetch(`${API_BASE}/api/metrics`, { signal: AbortSignal.timeout(5000) });
        if (metricsRes.ok) setMetrics(await metricsRes.json());
      }
    } catch (err: any) {
      const msg = err?.message ?? 'Unknown error';
      setBackendOnline(false);
      setError(`Backend unavailable: ${msg}. Start the Python backend with: cd backend && python api.py`);
    } finally {
      setLoading(false);
    }
  }, [buildingId]);

  useEffect(() => {
    fetchAll();
    timerRef.current = setInterval(fetchAll, POLL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchAll]);

  // Trigger dataset generation
  const generateDataset = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/dataset/generate`, { method: 'POST' });
    return res.json();
  }, []);

  // Trigger model training
  const trainModels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/models/train`, { method: 'POST' });
      const data = await res.json();
      await fetchAll();
      return data;
    } finally {
      setLoading(false);
    }
  }, [fetchAll]);

  return {
    forecast,
    cityForecast,
    notifications,
    metrics,
    status,
    loading,
    error,
    backendOnline,
    refresh: fetchAll,
    generateDataset,
    trainModels,
  };
}
