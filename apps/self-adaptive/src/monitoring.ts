/**
 * Monitoring Layer - collects metrics from various sources
 */

import type { Metric } from './types';

export interface MetricSource {
  name: string;
  collect(): Promise<Metric | Metric[]>;
}

export class MonitoringLayer {
  private sources: MetricSource[] = [];
  private metricsBuffer: Metric[] = [];

  /**
   * Register a metric source
   */
  registerSource(source: MetricSource): void {
    this.sources.push(source);
  }

  /**
   * Collect all metrics from registered sources
   */
  async collectMetrics(): Promise<Metric[]> {
    const collected: Metric[] = [];
    
    for (const source of this.sources) {
      try {
        const metrics = await source.collect();
        const metricArray = Array.isArray(metrics) ? metrics : [metrics];
        collected.push(...metricArray);
      } catch (error) {
        console.error(`Failed to collect from ${source.name}:`, error);
      }
    }

    this.metricsBuffer.push(...collected);
    return collected;
  }

  /**
   * Get buffered metrics
   */
  getBufferedMetrics(): Metric[] {
    return [...this.metricsBuffer];
  }

  /**
   * Clear metric buffer
   */
  clearBuffer(): void {
    this.metricsBuffer = [];
  }
}

// Pre-built metric sources

export class SystemMetricsSource implements MetricSource {
  name = 'system';

  async collect(): Promise<Metric[]> {
    // In Cloudflare Workers, we get limited system metrics
    // This would be expanded based on actual environment
    return [
      {
        name: 'requests_total',
        value: 1,
        unit: 'count',
        timestamp: Date.now(),
        tags: { source: 'system' },
      },
    ];
  }
}

export class HealthCheckSource implements MetricSource {
  name = 'health-check';
  private checkUrls: string[];

  constructor(urls: string[]) {
    this.checkUrls = urls;
  }

  async collect(): Promise<Metric[]> {
    const results: Metric[] = [];
    const startTime = Date.now();

    for (const url of this.checkUrls) {
      try {
        const response = await fetch(url);
        const latency = Date.now() - startTime;
        
        results.push({
          name: 'health_check_latency_ms',
          value: latency,
          unit: 'ms',
          timestamp: Date.now(),
          tags: { url, status: String(response.status) },
        });

        results.push({
          name: 'health_check_status',
          value: response.ok ? 1 : 0,
          unit: 'boolean',
          timestamp: Date.now(),
          tags: { url },
        });
      } catch (error) {
        results.push({
          name: 'health_check_status',
          value: 0,
          unit: 'boolean',
          timestamp: Date.now(),
          tags: { url, error: String(error) },
        });
      }
    }

    return results;
  }
}

export class CustomMetricsSource implements MetricSource {
  name = 'custom';
  private metricsProvider: () => Promise<Record<string, number>>;

  constructor(provider: () => Promise<Record<string, number>>) {
    this.metricsProvider = provider;
  }

  async collect(): Promise<Metric[]> {
    const data = await this.metricsProvider();
    
    return Object.entries(data).map(([name, value]) => ({
      name,
      value,
      unit: 'custom',
      timestamp: Date.now(),
    }));
  }
}