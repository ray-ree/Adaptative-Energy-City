/**
 * useResidentStream — SSE hook for resident real-time monitoring
 * Connects to /api/resident/{id}/stream and dispatches typed events.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

const API = 'http://127.0.0.1:8000';

export interface Snapshot {
  building_id: string; building_name: string;
  current_demand_kw: number; current_solar_kw: number;
  current_import_kw: number; current_tariff: number;
  grid_capacity_kw: number; risk_category: 'Low'|'Medium'|'High';
  shortage_prob: number; next_24h_peak_kw: number;
  max_risk_24h: number; last_updated: string; mode: string;
}
export interface ResidentAlert {
  alert_id: string; building_id: string; building_name: string;
  predicted_time: string; window_label: string; risk_level: string;
  pred_demand_kw: number; capacity_kw: number; deficit_kw: number;
  shortage_prob: number; tariff: number; action: string;
}
export interface RescheduleItem {
  from_ts: string; to_ts: string; flex_kw: number;
  from_price: number; to_price: number; saving_rs: number; reason: string;
}
export interface Schedule {
  building_id: string; original_cost_rs: number; revised_cost_rs: number;
  saving_rs: number; rescheduled_count: number; rescheduled: RescheduleItem[];
  feasible: boolean; version: number; trigger: string;
}
export interface ForecastPoint {
  timestamp: string; hour: number; h_offset: number;
  pred_demand_kw: number; pred_solar_kw: number;
  pred_grid_import_kw: number; pred_tariff: number;
  grid_capacity_kw: number; pred_margin_kw: number;
  shortage_prob: number; risk_category: 'Low'|'Medium'|'High';
  risk_color: string; price_peak: number; action: string|null;
}

export function useResidentStream(residentId: string | null) {
  const [snapshot,      setSnapshot]      = useState<Snapshot | null>(null);
  const [alerts,        setAlerts]        = useState<ResidentAlert[]>([]);
  const [schedule,      setSchedule]      = useState<Schedule | null>(null);
  const [forecast,      setForecast]      = useState<ForecastPoint[]>([]);
  const [connected,     setConnected]     = useState(false);
  const [backendOnline, setBackendOnline] = useState(false);
  const [lastUpdated,   setLastUpdated]   = useState<string | null>(null);
  const [streamError,   setStreamError]   = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seenAlerts = useRef<Set<string>>(new Set());

  const connect = useCallback(() => {
    if (!residentId) return;
    if (esRef.current) { esRef.current.close(); esRef.current = null; }

    const es = new EventSource(`${API}/api/resident/${residentId}/stream`);
    esRef.current = es;

    es.onopen = () => { setConnected(true); setBackendOnline(true); setStreamError(null); };

    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        setLastUpdated(msg.ts);
        if (msg.type === 'connected') { setConnected(true); setBackendOnline(true); }
        if (msg.type === 'snapshot')  { setSnapshot(msg.data); }
        if (msg.type === 'alert') {
          const a: ResidentAlert = msg.data;
          if (!seenAlerts.current.has(a.alert_id)) {
            seenAlerts.current.add(a.alert_id);
            setAlerts(prev => [a, ...prev].slice(0, 20));
          }
        }
        if (msg.type === 'schedule') { setSchedule(msg.data); }
        if (msg.type === 'error')    { setStreamError(msg.data?.message ?? 'Unknown error'); }
      } catch { /* ignore malformed */ }
    };

    es.onerror = () => {
      setConnected(false); setBackendOnline(false);
      setStreamError('Stream disconnected — reconnecting in 8s…');
      es.close();
      reconnectTimer.current = setTimeout(connect, 8000);
    };
  }, [residentId]);

  // Also poll forecast separately (richer data than snapshot)
  const pollForecast = useCallback(async () => {
    if (!residentId) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fetch(`${API}/api/resident/${residentId}/forecast`, { signal: ctrl.signal });
      if (r.ok) { const d = await r.json(); setForecast(d.forecast ?? []); }
    } catch { /* backend may be starting */ }
    finally { clearTimeout(timer); }
  }, [residentId]);

  useEffect(() => {
    connect();
    pollForecast();
    const poll = setInterval(pollForecast, 60_000);
    return () => {
      clearTimeout(reconnectTimer.current);
      clearInterval(poll);
      esRef.current?.close();
    };
  }, [connect, pollForecast]);

  return { snapshot, alerts, schedule, forecast, connected, backendOnline, lastUpdated, streamError };
}
