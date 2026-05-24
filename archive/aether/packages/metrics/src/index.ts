/**
 * Metrics Package
 * 
 * Simple in-memory metrics for monitoring agent performance.
 */

export interface Metric {
  name: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
}

// In-memory store
const metrics = new Map<string, Metric[]>();
const counters = new Map<string, number>();
const gauges = new Map<string, number>();

// Record a metric point
export function record(name: string, value: number, tags?: Record<string, string>) {
  const point: Metric = {
    name,
    value,
    timestamp: Date.now(),
    tags,
  };
  
  const existing = metrics.get(name) || [];
  existing.push(point);
  
  // Keep last 1000 points
  if (existing.length > 1000) {
    existing.shift();
  }
  
  metrics.set(name, existing);
  return point;
}

// Increment a counter
export function increment(name: string, delta = 1) {
  const current = counters.get(name) || 0;
  counters.set(name, current + delta);
  return current + delta;
}

// Get counter value
export function counter(name: string) {
  return counters.get(name) || 0;
}

// Set a gauge
export function gauge(name: string, value: number) {
  gauges.set(name, value);
  return value;
}

// Get gauge value
export function getGauge(name: string) {
  return gauges.get(name) || 0;
}

// Get metric history
export function getHistory(name: string, since?: number) {
  const points = metrics.get(name) || [];
  if (!since) return points;
  
  const cutoff = Date.now() - since;
  return points.filter(p => p.timestamp >= cutoff);
}

// Get summary stats
export function summary(name: string) {
  const points = metrics.get(name) || [];
  if (points.length === 0) {
    return { count: 0, min: 0, max: 0, avg: 0 };
  }
  
  const values = points.map(p => p.value);
  const sum = values.reduce((a, b) => a + b, 0);
  
  return {
    count: values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    avg: sum / values.length,
    sum,
  };
}

// Get all metrics snapshot
export function snapshot() {
  return {
    counters: Object.fromEntries(counters),
    gauges: Object.fromEntries(gauges),
    metrics: Object.fromEntries(metrics),
  };
}

// Reset all metrics
export function reset() {
  metrics.clear();
  counters.clear();
  gauges.clear();
}