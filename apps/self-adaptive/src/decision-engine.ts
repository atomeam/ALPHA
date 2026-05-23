/**
 * Rule-based decision engine for the self-adaptive system
 * 
 * Evaluates conditions against metrics and triggers appropriate actions
 */

import type { Metric, Recommendation, HealthStatus, ActionType } from './types';
import { isAnomalous, calculateTrend, ema } from './utils';

export interface Rule {
  id: string;
  name: string;
  description: string;
  condition: RuleCondition;
  action: ActionType;
  parameters: Record<string, unknown>;
  priority: 'critical' | 'high' | 'medium' | 'low';
  enabled: boolean;
}

export interface RuleCondition {
  metric: string;
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
  value: number;
  duration?: number; // How long the condition must be true
  anomalyDetection?: boolean; // Use anomaly detection instead of fixed threshold
}

export interface RuleEvaluationResult {
  rule: Rule;
  triggered: boolean;
  currentValue: number | null;
  reason?: string;
}

export class DecisionEngine {
  private rules: Rule[] = [];
  private metricHistory: Map<string, number[]> = new Map();
  private readonly MAX_HISTORY = 100;

  /**
   * Add a rule to the engine
   */
  addRule(rule: Rule): void {
    this.rules.push(rule);
  }

  /**
   * Add multiple rules
   */
  addRules(rules: Rule[]): void {
    this.rules.push(...rules);
  }

  /**
   * Remove a rule by ID
   */
  removeRule(ruleId: string): boolean {
    const index = this.rules.findIndex(r => r.id === ruleId);
    if (index !== -1) {
      this.rules.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Enable/disable a rule
   */
  setRuleEnabled(ruleId: string, enabled: boolean): boolean {
    const rule = this.rules.find(r => r.id === ruleId);
    if (rule) {
      rule.enabled = enabled;
      return true;
    }
    return false;
  }

  /**
   * Evaluate all rules against current metrics
   */
  evaluate(metrics: Metric[], health: HealthStatus): RuleEvaluationResult[] {
    const results: RuleEvaluationResult[] = [];

    // Update history with new metrics
    for (const metric of metrics) {
      const history = this.metricHistory.get(metric.name) || [];
      history.push(metric.value);
      if (history.length > this.MAX_HISTORY) {
        history.shift();
      }
      this.metricHistory.set(metric.name, history);
    }

    // Evaluate each rule
    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      const metric = metrics.find(m => m.name === rule.condition.metric);
      const currentValue = metric?.value ?? null;
      const history = this.metricHistory.get(rule.condition.metric) || [];

      let triggered = false;
      let reason: string | undefined;

      if (rule.condition.anomalyDetection && history.length >= 5) {
        // Use anomaly detection
        triggered = isAnomalous(currentValue, history, 2.5);
        reason = triggered 
          ? `Anomaly detected: ${currentValue} is outside normal range`
          : undefined;
      } else if (currentValue !== null) {
        // Use threshold comparison
        triggered = this.evaluateCondition(currentValue, rule.condition.operator, rule.condition.value);
        reason = triggered
          ? `${rule.condition.metric} ${rule.condition.operator} ${rule.condition.value} (current: ${currentValue})`
          : undefined;
      }

      results.push({ rule, triggered, currentValue, reason });
    }

    return results;
  }

  /**
   * Get recommendations based on triggered rules
   */
  getRecommendations(results: RuleEvaluationResult[]): Recommendation[] {
    return results
      .filter(r => r.triggered)
      .map(r => ({
        id: `rule-${r.rule.id}`,
        priority: r.rule.priority,
        category: this.actionToCategory(r.rule.action),
        title: r.rule.name,
        description: r.rule.description + (r.reason ? `. ${r.reason}` : ''),
        confidence: 0.95,
        estimatedImpact: `Action: ${r.rule.action}`,
      }));
  }

  /**
   * Get all rules
   */
  getRules(): Rule[] {
    return [...this.rules];
  }

  /**
   * Get rule by ID
   */
  getRule(ruleId: string): Rule | undefined {
    return this.rules.find(r => r.id === ruleId);
  }

  /**
   * Clear all rules
   */
  clearRules(): void {
    this.rules = [];
  }

  /**
   * Export rules for persistence
   */
  exportRules(): string {
    return JSON.stringify(this.rules, null, 2);
  }

  /**
   * Import rules from JSON
   */
  importRules(json: string): void {
    try {
      const imported = JSON.parse(json);
      if (Array.isArray(imported)) {
        this.rules = imported;
      }
    } catch (error) {
      throw new Error('Invalid rules JSON');
    }
  }

  private evaluateCondition(value: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case '>': return value > threshold;
      case '<': return value < threshold;
      case '>=': return value >= threshold;
      case '<=': return value <= threshold;
      case '==': return value === threshold;
      case '!=': return value !== threshold;
      default: return false;
    }
  }

  private actionToCategory(action: ActionType): Recommendation['category'] {
    switch (action) {
      case 'scale_up':
      case 'scale_down':
        return 'scale';
      case 'clear_cache':
      case 'adjust_rate_limit':
        return 'optimize';
      case 'restart_service':
        return 'recover';
      case 'send_alert':
        return 'notify';
      default:
        return 'investigate';
    }
  }
}

// Default rules for common scenarios
export const DEFAULT_RULES: Rule[] = [
  {
    id: 'high-cpu',
    name: 'High CPU Usage',
    description: 'CPU usage has exceeded safe threshold',
    condition: { metric: 'cpu_usage_percent', operator: '>', value: 85 },
    action: 'scale_up',
    parameters: { minInstances: 2 },
    priority: 'high',
    enabled: true,
  },
  {
    id: 'critical-cpu',
    name: 'Critical CPU Usage',
    description: 'CPU usage at critical levels',
    condition: { metric: 'cpu_usage_percent', operator: '>', value: 95 },
    action: 'scale_up',
    parameters: { minInstances: 4 },
    priority: 'critical',
    enabled: true,
  },
  {
    id: 'high-memory',
    name: 'High Memory Usage',
    description: 'Memory usage is elevated',
    condition: { metric: 'memory_usage_percent', operator: '>', value: 80 },
    action: 'clear_cache',
    parameters: { cacheType: 'all' },
    priority: 'high',
    enabled: true,
  },
  {
    id: 'high-error-rate',
    name: 'High Error Rate',
    description: 'Error rate has increased significantly',
    condition: { metric: 'error_rate', operator: '>', value: 0.02 },
    action: 'send_alert',
    parameters: { channels: ['slack', 'email'] },
    priority: 'high',
    enabled: true,
  },
  {
    id: 'high-latency',
    name: 'High Latency',
    description: 'Response time is degrading',
    condition: { metric: 'response_time_ms', operator: '>', value: 2000 },
    action: 'send_alert',
    parameters: { channels: ['slack'] },
    priority: 'medium',
    enabled: true,
  },
  {
    id: 'low-throughput',
    name: 'Low Throughput',
    description: 'Requests per second has dropped',
    condition: { metric: 'requests_per_second', operator: '<', value: 50 },
    action: 'investigate',
    parameters: {},
    priority: 'medium',
    enabled: true,
  },
];