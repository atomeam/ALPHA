// Alpha v0 — MetricsProvider implementations (PR1).
// Three implementations with precedence chain:
//   InputMetricsProvider (primary, test/injection) → KVMetricsProvider (secondary, runtime cache) → AmplitudeMetricsProvider (tertiary, live API)

import type { MetricsProvider, MetricsSnapshot } from './types.js';

/**
 * InputMetricsProvider — reads metrics directly from PipelineContext.input.metrics.
 * Primary source for tests and API-triggered runs.
 * Always available when metrics are injected.
 */
export class InputMetricsProvider implements MetricsProvider {
  constructor(private metrics: MetricsSnapshot[] = []) {}

  async listAvailableMetrics(): Promise<Set<string>> {
    return new Set(this.metrics.map((m) => m.metric));
  }

  async fetchMetrics(metricNames: string[]): Promise<MetricsSnapshot[]> {
    return this.metrics.filter((m) => metricNames.includes(m.metric));
  }

  isAvailable(): boolean {
    return this.metrics.length > 0;
  }

  static fromSnapshots(snapshots: MetricsSnapshot[]): InputMetricsProvider {
    return new InputMetricsProvider(snapshots);
  }
}

/**
 * KVMetricsProvider — reads cached metrics from Cloudflare KV.
 * Secondary source: fast, reused recent fetches.
 * Available only when KV binding is present and has cached data.
 */
export class KVMetricsProvider implements MetricsProvider {
  constructor(
    private kv: KVNamespace | null,
    private keyPrefix = 'metrics:',
  ) {}

  async listAvailableMetrics(): Promise<Set<string>> {
    if (!this.kv) return new Set();
    const indexKey = `${this.keyPrefix}index`;
    const data = await this.kv.get(indexKey, 'json');
    if (!data) return new Set();
    return new Set(data as string[]);
  }

  async fetchMetrics(metricNames: string[]): Promise<MetricsSnapshot[]> {
    if (!this.kv) return [];
    const results: MetricsSnapshot[] = [];
    const kv = this.kv; // capture for closure
    await Promise.all(
      metricNames.map(async (name) => {
        const raw = await kv.get(`${this.keyPrefix}${name}`, 'json');
        if (raw) results.push(raw as MetricsSnapshot);
      }),
    );
    return results;
  }

  isAvailable(): boolean {
    return this.kv !== null;
  }

  /** Write a metrics snapshot into KV for caching */
  async cacheMetrics(snapshot: MetricsSnapshot): Promise<void> {
    if (!this.kv) return;
    await this.kv.put(`${this.keyPrefix}${snapshot.metric}`, JSON.stringify(snapshot));
    // Update index
    const indexKey = `${this.keyPrefix}index`;
    const existing = ((await this.kv.get(indexKey, 'json')) as string[]) || [];
    if (!existing.includes(snapshot.metric)) {
      await this.kv.put(indexKey, JSON.stringify([...existing, snapshot.metric]));
    }
  }
}

/**
 * AmplitudeMetricsProvider — fetches live metrics from Amplitude API.
 * Tertiary source: used on cache miss or when forceAmplitude is set.
 * Rate-limited: caller should cache results into KV after fetch.
 */
export class AmplitudeMetricsProvider implements MetricsProvider {
  constructor(
    private apiKey: string | null,
    private baseUrl = 'https://amplitude.com/api/2',
  ) {}

  async listAvailableMetrics(): Promise<Set<string>> {
    if (!this.apiKey) return new Set();
    // Amplitude v1 metric list — in Phase 0 we expose a known set.
    // Expand via /api/2/events/list when Amplitude wiring is complete (PR2).
    const knownMetrics = [
      'routing.success_rate',
      'request.latency_p50',
      'request.latency_p99',
      'queue.depth',
      'error.rate',
      'canary.success_rate',
    ];
    return new Set(knownMetrics);
  }

  async fetchMetrics(metricNames: string[]): Promise<MetricsSnapshot[]> {
    if (!this.apiKey) return [];
    const results: MetricsSnapshot[] = [];
    await Promise.all(
      metricNames.map(async (metric) => {
        const data = await this.fetchSingleMetric(metric);
        if (data) results.push(data);
      }),
    );
    return results;
  }

  private async fetchSingleMetric(metric: string): Promise<MetricsSnapshot | null> {
    if (!this.apiKey) return null;
    try {
      const url = `${this.baseUrl}/events/series?e=^[{"name":"${metric}"}]$&limit=1`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Basic ${btoa(this.apiKey + ':')}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { data: Array<{ series: number[][] }> };
      const series = body?.data?.[0]?.series?.[0];
      if (!series || series.length < 2) return null;
      return {
        metric,
        value: series[1] as number,
        timestamp: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }

  isAvailable(): boolean {
    return this.apiKey !== null;
  }
}

/**
 * MetricsProviderChain — resolves metrics using precedence.
 * Primary → Secondary → Tertiary with first-available semantics.
 */
export class MetricsProviderChain implements MetricsProvider {
  constructor(
    private primary: MetricsProvider,
    private secondary: MetricsProvider,
    private tertiary: MetricsProvider,
  ) {}

  async listAvailableMetrics(): Promise<Set<string>> {
    if (await this.primary.isAvailable()) return this.primary.listAvailableMetrics();
    if (await this.secondary.isAvailable()) return this.secondary.listAvailableMetrics();
    return this.tertiary.listAvailableMetrics();
  }

  async fetchMetrics(metricNames: string[]): Promise<MetricsSnapshot[]> {
    if (await this.primary.isAvailable()) return this.primary.fetchMetrics(metricNames);
    if (await this.secondary.isAvailable()) return this.secondary.fetchMetrics(metricNames);
    return this.tertiary.fetchMetrics(metricNames);
  }

  async isAvailable(): Promise<boolean> {
    if (await this.primary.isAvailable()) return true;
    if (await this.secondary.isAvailable()) return true;
    return this.tertiary.isAvailable();
  }
}
