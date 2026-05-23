// Core types for self-adaptive system

export interface Metric {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
  tags?: Record<string, string>;
}

export interface HealthStatus {
  healthy: boolean;
  score: number; // 0-100
  checks: HealthCheck[];
}

export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message?: string;
  lastCheck: number;
}

export interface Assessment {
  id: string;
  timestamp: number;
  metrics: Metric[];
  health: HealthStatus;
  recommendations: Recommendation[];
  actions: PlannedAction[];
}

export interface Recommendation {
  id: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: 'scale' | 'optimize' | 'recover' | 'notify' | 'investigate';
  title: string;
  description: string;
  confidence: number; // 0-1
  estimatedImpact: string;
}

export interface PlannedAction {
  id: string;
  type: ActionType;
  target: string;
  parameters: Record<string, unknown>;
  scheduledFor: number;
  status: 'pending' | 'approved' | 'executed' | 'failed' | 'rolled_back';
  rollbackPlan?: RollbackPlan;
}

export type ActionType = 
  | 'scale_up'
  | 'scale_down'
  | 'restart_service'
  | 'clear_cache'
  | 'adjust_rate_limit'
  | 'send_alert'
  | 'enable_circuit_breaker'
  | 'fallback_to_backup';

export interface RollbackPlan {
  steps: RollbackStep[];
  timeoutMs: number;
}

export interface RollbackStep {
  order: number;
  action: string;
  parameters: Record<string, unknown>;
}

export interface ActionResult {
  actionId: string;
  success: boolean;
  executedAt: number;
  durationMs: number;
  output?: string;
  error?: string;
  rolledBack?: boolean;
}

// Assessment engine state
export interface AssessmentState {
  lastAssessment: number;
  consecutiveFailures: number;
  healthTrend: 'improving' | 'stable' | 'degrading';
  pendingActions: PlannedAction[];
  actionHistory: ActionResult[];
}