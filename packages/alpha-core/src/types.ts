// Alpha v0 — canonical Proposal contract.
// Mirrors the schema documented in ALPHA.md.

export type RiskClass = 'low' | 'medium' | 'high';

export type ProposalClassification = 'config-change' | 'lesson' | 'runbook-prune';

export type ProposalRequires = Array<'Curator' | 'Operator'>;

export interface Citation {
  kind: 'lesson' | 'log' | 'runbook' | 'decision';
  id: string;
  url?: string;
}

export interface Proposal {
  id: string;
  title: string;
  inputs_hash: string;
  change_summary: string;
  files_or_pages_touched: string[];
  expected_effect: {
    metric: string; // must exist in Amplitude v1
    direction: 'increase' | 'decrease' | 'hold';
    magnitude: number; // expected delta
    tolerance: number; // ± window before auto-revert triggers (rule 4)
  };
  rollback_steps: string[];
  risk_class: RiskClass;
  requires: ProposalRequires;
  citations: Citation[];
  classification: ProposalClassification;
  idempotent: boolean;
  idempotency_guard?: string; // required when idempotent === false
  operator_cosign?: {
    user: string;
    at: string; // ISO timestamp
  };
}

export type DenialCode =
  | 'CUR_DO_NOT_REPEAT'
  | 'CUR_BAD_CITATION'
  | 'CUR_NO_ROLLBACK'
  | 'CUR_UNMEASURABLE'
  | 'CUR_NEEDS_OPERATOR'
  | 'CUR_COOLDOWN'
  | 'CUR_NOT_IDEMPOTENT'
  | 'CUR_LOOP_CAP'
  | 'CUR_SHADOW_DRIFT';

export type HaltCode =
  | 'APP_BLAST_CAP'
  | 'APP_CANARY_FAIL'
  | 'APP_AUTOREVERT'
  | 'APP_QUARANTINE'
  | 'APPLY_HALT_DIFF_DRIFT'
  | 'APPLY_HALT_SNAPSHOT_FAIL';

export interface CuratorDecision {
  approved: boolean;
  code?: DenialCode;
  message?: string;
  cooldown_until?: string; // ISO timestamp
}

export interface ApplierResult {
  status: 'applied' | 'halted' | 'reverted' | 'shadowed';
  code?: HaltCode;
  snapshot_id?: string;
  delta_observed?: number;
  message?: string;
}

export interface Lesson {
  id: string; // L-001, L-002, ...
  signature: string; // inputs_hash
  outcome: 'success' | 'partial' | 'failure';
  delta_predicted: number;
  delta_actual: number;
  generalization: string;
  tag: 'keep' | 'do-not-repeat' | 'needs-operator' | 'needs-operator-review';
  created_at: string;
}

export interface NeighborhoodState {
  inputs_hash: string;
  last_apply_at?: string;
  current_cooldown_hours: number;
  consecutive_halts_24h: number;
  quarantined_until?: string;
  seen_before: boolean; // false → shadow apply required
}

// ============================================================================
// Pipeline Interfaces (PR1)
// ============================================================================

/**
 * Metrics snapshot from Amplitude or KV cache.
 * Used by Observer/Evaluator to assess current state.
 */
export interface MetricsSnapshot {
  metric: string;
  value: number;
  timestamp: string; // ISO
}

/**
 * Result of Observing phase — raw assessment ready for proposal.
 */
export interface Observation {
  id: string;
  timestamp: string;
  metrics: MetricsSnapshot[];
  findings: string[];
  severity: 'info' | 'warning' | 'critical';
}

/**
 * Result of Evaluating phase — validated assessment ready for proposal assembly.
 */
export interface Evaluation {
  id: string;
  observation_id: string;
  is_actionable: boolean;
  reasoning: string;
  suggested_metric?: string;
  suggested_direction?: 'increase' | 'decrease' | 'hold';
  suggested_magnitude?: number;
  suggested_tolerance?: number;
}

/**
 * Result of Proposing phase — full Proposal ready for Curator.
 */
export interface ProposalResult {
  proposal: Proposal;
  evaluation_id: string;
}

/**
 * Pipeline flags for precedence control.
 */
export interface PipelineFlags {
  /** Bypass KV cache, fetch from Amplitude directly */
  forceAmplitude?: boolean;
  /** Skip Notion writeback (for tests or when Notion is unavailable) */
  disableNotion?: boolean;
  /** Use in-memory fallback even if KV is available */
  forceMemoryFallback?: boolean;
}

/**
 * Pipeline context — all inputs needed to run one full loop cycle.
 */
export interface PipelineContext {
  id: string;
  trigger: 'cron' | 'api' | 'queue';
  correlation_id: string;
  input: {
    /** Primary: injected metrics from caller (tests, API, queue) */
    metrics?: MetricsSnapshot[];
    /** Raw observation data if already processed */
    observation?: Observation;
    /** Pre-assembled proposal (skip observer/evaluator/proposer) */
    proposal?: Proposal;
  };
  flags: PipelineFlags;
  /** Timestamp for consistent cooldown/cooldown checks */
  now: Date;
}

// ============================================================================
// MetricsProvider (PR1)
// ============================================================================

/**
 * Interface for retrieving metrics.
 * Implementations: InputMetricsProvider, KVMetricsProvider, AmplitudeMetricsProvider.
 * Precedence: first available in the chain.
 */
export interface MetricsProvider {
  /** Returns available metric names in Amplitude */
  listAvailableMetrics(): Promise<Set<string>>;
  /** Fetches current value(s) for given metric names */
  fetchMetrics(metricNames: string[]): Promise<MetricsSnapshot[]>;
  /** Returns true if this provider has data (avoids null-provider fallback loops) */
  isAvailable(): boolean;
}

// ============================================================================
// LessonSink (PR1)
// ============================================================================

/**
 * Interface for writing Lesson records.
 * Implementations: KVLessonSink, NotionLessonSink, MemoryLessonSink.
 * Precedence: first available in the chain.
 */
export interface LessonSink {
  /** Append a lesson record */
  write(lesson: Lesson): Promise<void>;
  /** List lessons (for Curator do-not-repeat lookup) */
  list(): Promise<Lesson[]>;
  /** Returns true if this sink has storage available */
  isAvailable(): boolean;
}

// ============================================================================
// Pipeline Result (PR1)
// ============================================================================

/**
 * Outcome of a full pipeline run.
 */
export interface PipelineResult {
  pipeline_id: string;
  status: 'completed' | 'denied' | 'halted' | 'reverted' | 'shadowed' | 'error';
  observation?: Observation;
  evaluation?: Evaluation;
  proposal?: Proposal;
  curator_decision?: CuratorDecision;
  applier_result?: ApplierResult;
  lessons_written: number;
  message?: string;
  error?: string;
}
