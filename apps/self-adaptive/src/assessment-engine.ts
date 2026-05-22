/**
 * Assessment Engine Durable Object
 * 
 * The "brain" of the self-adaptive system that:
 * - Collects and analyzes metrics
 * - Evaluates health status
 * - Generates recommendations
 * - Plans and coordinates actions
 */

import type { 
  Metric, 
  HealthStatus, 
  Assessment, 
  Recommendation, 
  PlannedAction, 
  AssessmentState,
  ActionType 
} from './types';

interface DurableObjectState {
  lastAssessment: number;
  consecutiveFailures: number;
  healthTrend: 'improving' | 'stable' | 'degrading';
  pendingActions: PlannedAction[];
  actionHistory: Array<{
    id: string;
    type: string;
    success: boolean;
    timestamp: number;
  }>;
}

export class AssessmentEngine {
  private state: DurableObjectState = {
    lastAssessment: 0,
    consecutiveFailures: 0,
    healthTrend: 'stable',
    pendingActions: [],
    actionHistory: [],
  };

  private metricsBuffer: Metric[] = [];
  private readonly MAX_METRICS_BUFFER = 1000;

  constructor(private env: any) {}

  // HTTP handler for the Durable Object
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Route requests
    if (path === '/ingest' && request.method === 'POST') {
      return this.ingestMetrics(await request.json());
    }
    if (path === '/assess' && request.method === 'POST') {
      return this.runAssessment();
    }
    if (path === '/status') {
      return this.getStatus();
    }
    if (path === '/actions') {
      if (request.method === 'GET') return this.listPendingActions();
      if (request.method === 'POST') return this.approveAction(await request.json());
    }
    if (path.startsWith('/actions/') && request.method === 'DELETE') {
      const actionId = path.split('/').pop()!;
      return this.cancelAction(actionId);
    }
    
    return new Response('Not Found', { status: 404 });
  }

  /**
   * Ingest metrics from various sources
   */
  private async ingestMetrics(metrics: Metric | Metric[]): Promise<Response> {
    const metricArray = Array.isArray(metrics) ? metrics : [metrics];
    
    for (const metric of metricArray) {
      metric.timestamp = metric.timestamp || Date.now();
      this.metricsBuffer.push(metric);
    }

    // Trim buffer if needed
    if (this.metricsBuffer.length > this.MAX_METRICS_BUFFER) {
      this.metricsBuffer = this.metricsBuffer.slice(-this.MAX_METRICS_BUFFER);
    }

    return Response.json({
      success: true,
      ingested: metricArray.length,
      bufferSize: this.metricsBuffer.length,
    });
  }

  /**
   * Run a full assessment cycle
   */
  private async runAssessment(): Promise<Response> {
    const startTime = Date.now();
    
    // Collect metrics for analysis
    const analysisMetrics = this.collectMetricsForAnalysis();
    
    // Evaluate health
    const health = this.evaluateHealth(analysisMetrics);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(health, analysisMetrics);
    
    // Plan actions based on recommendations
    const plannedActions = this.planActions(recommendations, health);
    
    // Create assessment record
    const assessment: Assessment = {
      id: this.generateId(),
      timestamp: startTime,
      metrics: analysisMetrics,
      health,
      recommendations,
      actions: plannedActions,
    };

    // Update state
    this.state.lastAssessment = startTime;
    this.state.pendingActions = [...this.state.pendingActions, ...plannedActions];
    this.updateHealthTrend(health);

    // Store assessment in KV (if binding available)
    await this.storeAssessment(assessment);

    return Response.json({
      assessment,
      durationMs: Date.now() - startTime,
      state: {
        healthTrend: this.state.healthTrend,
        pendingActionsCount: this.state.pendingActions.length,
      },
    });
  }

  /**
   * Collect and aggregate metrics for analysis
   */
  private collectMetricsForAnalysis(): Metric[] {
    // Group metrics by name and compute aggregates
    const grouped = new Map<string, Metric[]>();
    
    for (const metric of this.metricsBuffer) {
      const existing = grouped.get(metric.name) || [];
      existing.push(metric);
      grouped.set(metric.name, existing);
    }

    // Compute aggregates
    const aggregated: Metric[] = [];
    for (const [name, metrics] of grouped) {
      const values = metrics.map(m => m.value);
      aggregated.push({
        name,
        value: this.computeAverage(values),
        unit: metrics[0].unit,
        timestamp: Date.now(),
        tags: metrics[0].tags,
      });
    }

    return aggregated;
  }

  /**
   * Evaluate overall health status
   */
  private evaluateHealth(metrics: Metric[]): HealthStatus {
    const checks: HealthStatus['checks'] = [];
    let totalScore = 100;

    // Check response time
    const responseTime = metrics.find(m => m.name === 'response_time_ms');
    if (responseTime) {
      if (responseTime.value > 5000) {
        checks.push({ name: 'response_time', status: 'fail', message: 'Critical latency', lastCheck: Date.now() });
        totalScore -= 40;
      } else if (responseTime.value > 2000) {
        checks.push({ name: 'response_time', status: 'warn', message: 'High latency', lastCheck: Date.now() });
        totalScore -= 20;
      } else {
        checks.push({ name: 'response_time', status: 'pass', lastCheck: Date.now() });
      }
    }

    // Check error rate
    const errorRate = metrics.find(m => m.name === 'error_rate');
    if (errorRate) {
      if (errorRate.value > 0.05) {
        checks.push({ name: 'error_rate', status: 'fail', message: 'High error rate', lastCheck: Date.now() });
        totalScore -= 35;
      } else if (errorRate.value > 0.01) {
        checks.push({ name: 'error_rate', status: 'warn', message: 'Elevated errors', lastCheck: Date.now() });
        totalScore -= 15;
      } else {
        checks.push({ name: 'error_rate', status: 'pass', lastCheck: Date.now() });
      }
    }

    // Check CPU usage
    const cpuUsage = metrics.find(m => m.name === 'cpu_usage_percent');
    if (cpuUsage) {
      if (cpuUsage.value > 90) {
        checks.push({ name: 'cpu_usage', status: 'fail', message: 'Critical CPU', lastCheck: Date.now() });
        totalScore -= 25;
      } else if (cpuUsage.value > 75) {
        checks.push({ name: 'cpu_usage', status: 'warn', message: 'High CPU', lastCheck: Date.now() });
        totalScore -= 10;
      } else {
        checks.push({ name: 'cpu_usage', status: 'pass', lastCheck: Date.now() });
      }
    }

    return {
      healthy: totalScore >= 70,
      score: Math.max(0, totalScore),
      checks,
    };
  }

  /**
   * Generate recommendations based on health and metrics
   */
  private generateRecommendations(health: HealthStatus, metrics: Metric[]): Recommendation[] {
    const recommendations: Recommendation[] = [];
    const timestamp = Date.now();

    // Check for scaling needs
    const cpuUsage = metrics.find(m => m.name === 'cpu_usage_percent');
    if (cpuUsage && cpuUsage.value > 80) {
      recommendations.push({
        id: this.generateId(),
        priority: cpuUsage.value > 90 ? 'critical' : 'high',
        category: 'scale',
        title: 'Scale up resources',
        description: `CPU usage at ${cpuUsage.value.toFixed(1)}% - consider scaling horizontally`,
        confidence: 0.95,
        estimatedImpact: 'Reduce latency by 30-50%',
      });
    }

    // Check for memory pressure
    const memoryUsage = metrics.find(m => m.name === 'memory_usage_percent');
    if (memoryUsage && memoryUsage.value > 85) {
      recommendations.push({
        id: this.generateId(),
        priority: memoryUsage.value > 95 ? 'critical' : 'high',
        category: 'optimize',
        title: 'Memory pressure detected',
        description: `Memory usage at ${memoryUsage.value.toFixed(1)}% - consider clearing cache`,
        confidence: 0.9,
        estimatedImpact: 'Prevent OOM crashes',
      });
    }

    // Check for high error rates
    const errorRate = metrics.find(m => m.name === 'error_rate');
    if (errorRate && errorRate.value > 0.02) {
      recommendations.push({
        id: this.generateId(),
        priority: errorRate.value > 0.05 ? 'high' : 'medium',
        category: 'investigate',
        title: 'Elevated error rate',
        description: `Error rate at ${(errorRate.value * 100).toFixed(2)}% - investigate root cause`,
        confidence: 0.85,
        estimatedImpact: 'Reduce user-facing errors',
      });
    }

    // Check for slow responses
    const responseTime = metrics.find(m => m.name === 'response_time_ms');
    if (responseTime && responseTime.value > 2000) {
      recommendations.push({
        id: this.generateId(),
        priority: responseTime.value > 5000 ? 'high' : 'medium',
        category: 'optimize',
        title: 'High latency detected',
        description: `Avg response time ${responseTime.value.toFixed(0)}ms - consider optimization`,
        confidence: 0.88,
        estimatedImpact: 'Improve user experience',
      });
    }

    // Check for low throughput
    const throughput = metrics.find(m => m.name === 'requests_per_second');
    if (throughput && throughput.value < 50) {
      recommendations.push({
        id: this.generateId(),
        priority: 'low',
        category: 'optimize',
        title: 'Low throughput',
        description: `RPS at ${throughput.value.toFixed(1)} - investigate bottlenecks`,
        confidence: 0.75,
        estimatedImpact: 'Increase capacity utilization',
      });
    }

    // If overall health is poor, recommend investigation
    if (!health.healthy) {
      recommendations.push({
        id: this.generateId(),
        priority: 'high',
        category: 'notify',
        title: 'System health degraded',
        description: `Health score: ${health.score}/100. ${health.checks.filter(c => c.status !== 'pass').length} checks failing.`,
        confidence: 1.0,
        estimatedImpact: 'Prevent cascading failures',
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * Plan actions based on recommendations
   */
  private planActions(recommendations: Recommendation[], health: HealthStatus): PlannedAction[] {
    const actions: PlannedAction[] = [];
    const now = Date.now();

    // Only plan actions for critical/high priority recommendations
    // Medium/low priority recommendations are for human review
    for (const rec of recommendations) {
      if (rec.priority === 'critical' || rec.priority === 'high') {
        const actionType = this.mapRecommendationToAction(rec);
        
        actions.push({
          id: this.generateId(),
          type: actionType,
          target: 'self',
          parameters: {
            recommendationId: rec.id,
            reason: rec.description,
          },
          scheduledFor: now + 5000, // 5 second delay for potential human approval
          status: 'pending',
          rollbackPlan: this.createRollbackPlan(actionType),
        });
      }
    }

    return actions;
  }

  /**
   * Map recommendation to specific action type
   */
  private mapRecommendationToAction(rec: Recommendation): ActionType {
    switch (rec.category) {
      case 'scale':
        return 'scale_up';
      case 'optimize':
        return 'clear_cache';
      case 'recover':
        return 'restart_service';
      case 'notify':
        return 'send_alert';
      default:
        return 'send_alert';
    }
  }

  /**
   * Create rollback plan for an action
   */
  private createRollbackPlan(actionType: ActionType): { steps: any[]; timeoutMs: number } {
    switch (actionType) {
      case 'scale_up':
        return {
          steps: [{ order: 1, action: 'scale_down', parameters: {} }],
          timeoutMs: 30000,
        };
      case 'clear_cache':
        return {
          steps: [{ order: 1, action: 'rebuild_cache', parameters: {} }],
          timeoutMs: 60000,
        };
      case 'restart_service':
        return {
          steps: [],
          timeoutMs: 0,
        };
      default:
        return { steps: [], timeoutMs: 0 };
    }
  }

  /**
   * Get current status
   */
  private getStatus(): Response {
    return Response.json({
      state: this.state,
      metricsBufferSize: this.metricsBuffer.length,
      uptime: Date.now() - this.state.lastAssessment,
    });
  }

  /**
   * List pending actions
   */
  private listPendingActions(): Response {
    return Response.json({
      pendingActions: this.state.pendingActions.filter(a => a.status === 'pending'),
      approvedActions: this.state.pendingActions.filter(a => a.status === 'approved'),
    });
  }

  /**
   * Approve a pending action
   */
  private approveAction(body: { actionId: string; approved: boolean }): Response {
    const { actionId, approved } = body;
    const action = this.state.pendingActions.find(a => a.id === actionId);
    
    if (!action) {
      return Response.json({ error: 'Action not found' }, { status: 404 });
    }

    if (approved) {
      action.status = 'approved';
      this.executeAction(action);
    } else {
      action.status = 'rolled_back'; // Using rolled_back to indicate rejected
    }

    return Response.json({ success: true, action });
  }

  /**
   * Cancel a pending action
   */
  private cancelAction(actionId: string): Response {
    const action = this.state.pendingActions.find(a => a.id === actionId);
    
    if (!action) {
      return Response.json({ error: 'Action not found' }, { status: 404 });
    }

    action.status = 'rolled_back';
    return Response.json({ success: true });
  }

  /**
   * Execute an approved action
   */
  private async executeAction(action: PlannedAction): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Dispatch to action queue for execution
      // In real implementation, this would send to the Queue
      const result = {
        actionId: action.id,
        type: action.type,
        success: true,
        executedAt: Date.now(),
        durationMs: Date.now() - startTime,
        output: `Action ${action.type} executed successfully`,
      };

      action.status = 'executed';
      this.state.actionHistory.push(result);

    } catch (error) {
      action.status = 'failed';
      // Attempt rollback
      if (action.rollbackPlan && action.rollbackPlan.steps.length > 0) {
        await this.rollbackAction(action);
      }

      this.state.actionHistory.push({
        actionId: action.id,
        type: action.type,
        success: false,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Rollback a failed action
   */
  private async rollbackAction(action: PlannedAction): Promise<void> {
    if (!action.rollbackPlan) return;

    for (const step of action.rollbackPlan.steps) {
      // Execute rollback steps
      console.log(`Rolling back: ${step.action}`);
    }

    action.status = 'rolled_back';
  }

  /**
   * Update health trend based on assessment history
   */
  private updateHealthTrend(health: HealthStatus): void {
    if (health.healthy) {
      this.state.consecutiveFailures = 0;
      if (this.state.healthTrend === 'degrading') {
        this.state.healthTrend = 'stable';
      } else if (this.state.healthTrend === 'stable') {
        // Only improve after consistent healthy assessments
        this.state.healthTrend = 'improving';
      }
    } else {
      this.state.consecutiveFailures++;
      if (this.state.consecutiveFailures >= 3) {
        this.state.healthTrend = 'degrading';
      }
    }
  }

  /**
   * Store assessment in KV for historical analysis
   */
  private async storeAssessment(assessment: Assessment): Promise<void> {
    try {
      if (this.env.METRICS_KV) {
        const key = `assessment:${assessment.id}`;
        await this.env.METRICS_KV.put(key, JSON.stringify(assessment), {
          expirationTtl: 7 * 24 * 60 * 60, // 7 days
        });
      }
    } catch (error) {
      console.error('Failed to store assessment:', error);
    }
  }

  /**
   * Utility: Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Utility: Compute average
   */
  private computeAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
}