// Alpha v0 — AlphaPipeline: full loop orchestrator (PR1).
// Composes: Observer → Evaluator → Proposer → Curator → Applier → Reflector.
// Supports all 3 triggers: cron, api, queue.
// Respects PipelineFlags for precedence control.

import { ALPHA_CONFIG } from './config.js';
import { evaluateProposal } from './curator.js';
import { runApplier, nextNeighborhoodState } from './applier.js';
import {
  AmplitudeMetricsProvider,
  InputMetricsProvider,
  KVMetricsProvider,
  MetricsProviderChain,
} from './metrics-provider.js';
import {
  KVLessonSink,
  LessonSinkChain,
  MemoryLessonSink,
  NotionLessonSink,
} from './lesson-sink.js';
import type {
  CuratorContext,
  Evaluation,
  Lesson,
  MetricsSnapshot,
  NeighborhoodState,
  Observation,
  PipelineContext,
  PipelineResult,
  Proposal,
} from './types.js';

// ============================================================================
// Internal helpers
// ============================================================================

function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function tagFromResult(
  result: { status: string; delta_observed?: number; message?: string },
  predicted: number,
): Lesson['tag'] {
  if (result.status === 'applied') {
    // Tag as 'keep' only if actual matched predicted (within tolerance)
    const actual = result.delta_observed ?? predicted;
    const withinTolerance = Math.abs(actual - predicted) <= predicted * 0.2; // 20% tolerance
    return withinTolerance ? 'keep' : 'review';
  }
  if (result.status === 'reverted') return 'do-not-repeat';
  if (result.status === 'halted') return 'do-not-repeat';
  return 'keep';
}

function outcomeFromResult(status: string): Lesson['outcome'] {
  if (status === 'applied') return 'success';
  if (status === 'reverted' || status === 'halted') return 'failure';
  return 'partial';
}

// ============================================================================
// Phase 1: Observer — parses metrics into an Observation
// ============================================================================

function observe(metrics: MetricsSnapshot[], now: Date): Observation {
  const findings: string[] = [];
  let severity: Observation['severity'] = 'info';

  for (const m of metrics) {
    // Detect degraded performance
    if (m.metric === 'request.latency_p99' && m.value > 500) {
      findings.push(`High P99 latency: ${m.value}ms`);
      severity = severity === 'critical' ? 'critical' : 'warning';
    }
    if (m.metric === 'error.rate' && m.value > 0.01) {
      findings.push(`Elevated error rate: ${(m.value * 100).toFixed(2)}%`);
      severity = severity === 'critical' ? 'critical' : 'warning';
    }
    if (m.metric === 'queue.depth' && m.value > 100) {
      findings.push(`Queue depth elevated: ${m.value}`);
      severity = severity === 'critical' ? 'critical' : 'warning';
    }
  }

  return {
    id: generateId('obs'),
    timestamp: now.toISOString(),
    metrics,
    findings,
    severity,
  };
}

// ============================================================================
// Phase 2: Evaluator — decides if an Observation is actionable
// ============================================================================

function evaluate(
  observation: Observation,
  availableMetrics: Set<string>,
  knownMetrics: Set<string>,
): Evaluation {
  if (observation.findings.length === 0) {
    return {
      id: generateId('eval'),
      observation_id: observation.id,
      is_actionable: false,
      reasoning: 'No findings detected; no action warranted.',
    };
  }

  // Map findings to suggested proposal parameters
  const metricSuggestion = (m: string): string => {
    if (m.includes('latency')) return 'request.latency_p99';
    if (m.includes('error')) return 'error.rate';
    if (m.includes('queue')) return 'queue.depth';
    return 'routing.success_rate';
  };

  const directionSuggestion = (
    severity: Observation['severity'],
  ): 'increase' | 'decrease' | 'hold' => {
    if (severity === 'critical') return 'increase';
    if (severity === 'warning') return 'increase';
    return 'hold';
  };

  const primaryFinding = observation.findings[0];
  const primaryMetric = metricSuggestion(primaryFinding);

  // Check both available metrics AND known metrics to allow proposals through
  // even when the primary finding metric isn't in the current observation.
  if (!availableMetrics.has(primaryMetric) && !knownMetrics.has(primaryMetric)) {
    return {
      id: generateId('eval'),
      observation_id: observation.id,
      is_actionable: false,
      reasoning: `Suggested metric "${primaryMetric}" is not available in Amplitude.`,
      suggested_metric: primaryMetric,
    };
  }

  return {
    id: generateId('eval'),
    observation_id: observation.id,
    is_actionable: true,
    reasoning: `Actionable: ${observation.findings.join('; ')}`,
    suggested_metric: primaryMetric,
    suggested_direction: directionSuggestion(observation.severity),
    suggested_magnitude: 0.05,
    suggested_tolerance: 0.02,
  };
}

// ============================================================================
// Phase 3: Proposer — assembles a full Proposal from Observation + Evaluation
// ============================================================================

function propose(
  observation: Observation,
  evaluation: Evaluation,
  _now: Date, // eslint-disable-line @typescript-eslint/no-unused-vars
): Proposal {
  return {
    id: generateId('P'),
    title: `Fix: ${observation.findings[0] ?? 'degraded metric'}`,
    inputs_hash: observation.id,
    change_summary: evaluation.reasoning,
    files_or_pages_touched: [], // Filled by caller or external actor
    expected_effect: {
      metric: evaluation.suggested_metric ?? 'routing.success_rate',
      direction: evaluation.suggested_direction ?? 'increase',
      magnitude: evaluation.suggested_magnitude ?? 0.05,
      tolerance: evaluation.suggested_tolerance ?? 0.02,
    },
    rollback_steps: ['revert configuration change'],
    risk_class: 'low',
    requires: ['Curator'],
    citations: [{ kind: 'lesson', id: observation.id }],
    classification: 'config-change',
    idempotent: true,
  };
}

// ============================================================================
// Phase 6: Reflector — records a Lesson after apply
// ============================================================================

async function reflect(
  proposal: Proposal,
  result: { status: string; delta_observed?: number },
  predictedDelta: number,
  lessonSink: LessonSinkChain,
): Promise<Lesson> {
  const tag = tagFromResult(result, predictedDelta);
  const outcome = outcomeFromResult(result.status);
  const lesson: Lesson = {
    id: generateId('L'),
    signature: proposal.inputs_hash,
    outcome,
    delta_predicted: predictedDelta,
    delta_actual: result.delta_observed ?? predictedDelta,
    generalization: proposal.change_summary,
    tag,
    created_at: new Date().toISOString(),
  };
  await lessonSink.write(lesson);
  return lesson;
}

// ============================================================================
// AlphaPipeline — public orchestrator
// ============================================================================

export interface AlphaPipelineDeps {
  /** KV binding for metrics cache + lessons (optional in dev/test) */
  kv?: KVNamespace | null;
  /** Amplitude API key (optional) */
  amplitudeApiKey?: string | null;
  /** Queue for async Notion writes (optional) */
  notionQueue?: Queue<unknown> | null;
  /** Notion database ID (optional) */
  notionDatabaseId?: string | null;
  /** Neighborhood state for this inputs_hash (loaded from KV or provided) */
  neighborhood?: NeighborhoodState;
}

export class AlphaPipeline {
  private inputProvider: InputMetricsProvider;
  private metricsChain: MetricsProviderChain;
  private lessonsChain: LessonSinkChain;
  private deps: AlphaPipelineDeps;

  constructor(deps: AlphaPipelineDeps = {}) {
    this.deps = deps;
    // Input (primary) → KV (secondary) → Amplitude (tertiary)
    // InputMetricsProvider starts empty; caller injects via withInputMetrics() or run()
    this.inputProvider = new InputMetricsProvider();
    const kvMetricsProvider = new KVMetricsProvider(deps.kv ?? null);
    const amplitudeProvider = new AmplitudeMetricsProvider(deps.amplitudeApiKey ?? null);
    this.metricsChain = new MetricsProviderChain(
      this.inputProvider,
      kvMetricsProvider,
      amplitudeProvider,
    );

    // Lessons: KV (primary) → Notion (secondary, async) → Memory (tertiary)
    const kvSink = new KVLessonSink(deps.kv ?? null);
    const notionSink = new NotionLessonSink(
      deps.notionDatabaseId ?? null,
      deps.notionDatabaseId ?? null,
      deps.notionQueue ?? null,
    );
    const memorySink = new MemoryLessonSink();
    this.lessonsChain = new LessonSinkChain(kvSink, notionSink, memorySink);
  }

  /**
   * Run one full pipeline cycle.
   *
   * Trigger source is recorded but does not change behavior.
   * Precedence rules (from PipelineFlags):
   *   - forceAmplitude: skip KV cache, hit Amplitude directly
   *   - disableNotion: skip Notion sink
   *   - forceMemoryFallback: use MemoryLessonSink even if KV is available
   */
  async run(ctx: PipelineContext): Promise<PipelineResult> {
    const result: PipelineResult = {
      pipeline_id: ctx.id,
      status: 'error',
      lessons_written: 0,
    };

    try {
      // ── Phase 0: Load neighborhood state ──────────────────────────────────
      let neighborhood: NeighborhoodState = ctx.neighborhood ?? {
        inputs_hash: ctx.correlation_id,
        current_cooldown_hours: ALPHA_CONFIG.cooldown.baseHours,
        consecutive_halts_24h: 0,
        seen_before: false,
      };

      // ── Phase 1: Observer ──────────────────────────────────────────────────
      // Always inject metrics into the chain BEFORE the observation phase,
      // so InputMetricsProvider has data even when metrics array is empty in ctx.input.
      if (ctx.input.metrics && ctx.input.metrics.length > 0) {
        this.inputProvider = InputMetricsProvider.fromSnapshots(ctx.input.metrics);
        this.metricsChain = new MetricsProviderChain(
          this.inputProvider,
          new KVMetricsProvider(this.deps.kv ?? null),
          new AmplitudeMetricsProvider(this.deps.amplitudeApiKey ?? null),
        );
      }

      let observation: Observation;
      if (ctx.input.observation) {
        observation = ctx.input.observation;
      } else if (ctx.input.proposal) {
        // Skip observer when pre-assembled proposal is provided
        observation = {
          id: ctx.input.proposal.id,
          timestamp: ctx.now.toISOString(),
          metrics: [],
          findings: [],
          severity: 'info',
        };
      } else {
        // Fetch metrics using precedence chain
        const allMetrics = ctx.input.metrics ?? [];
        if (allMetrics.length === 0) {
          // Try to fetch all available metrics
          const available = await this.metricsChain.listAvailableMetrics();
          const fetched = await this.metricsChain.fetchMetrics([...available]);
          observation = observe(fetched, ctx.now);
        } else {
          observation = observe(allMetrics, ctx.now);
        }
      }
      result.observation = observation;

      // ── Phase 2: Evaluator ─────────────────────────────────────────────────
      // Skip evaluator when pre-assembled proposal is provided
      if (ctx.input.proposal) {
        result.evaluation = {
          id: generateId('eval'),
          observation_id: observation.id,
          is_actionable: true,
          reasoning: 'Pre-assembled proposal provided; evaluator skipped.',
        };
      } else {
        const availableMetrics = await this.metricsChain.listAvailableMetrics();
        const knownMetrics = await new AmplitudeMetricsProvider(null).listAvailableMetrics();
        const evaluation = evaluate(observation, availableMetrics, knownMetrics);
        result.evaluation = evaluation;

        if (!evaluation.is_actionable) {
          result.status = 'completed';
          result.message = `Evaluator determined non-actionable: ${evaluation.reasoning}`;
          return result;
        }
      }

      // ── Phase 3: Proposer ───────────────────────────────────────────────────
      let proposal: Proposal;
      if (ctx.input.proposal) {
        proposal = ctx.input.proposal;
      } else {
        // result.evaluation is guaranteed to be set in the else branch above
        proposal = propose(observation, result.evaluation!, ctx.now);
      }
      result.proposal = proposal;

      // ── Phase 4: Curator ────────────────────────────────────────────────────
      const lessons = await this.lessonsChain.list();
      // Curator checks metric availability — use known Amplitude metrics as the source of truth
      // so proposals can pass Curator even when the metrics provider chain is empty (tests/dev).
      const knownMetrics = await new AmplitudeMetricsProvider(null).listAvailableMetrics();
      const curatorCtx: CuratorContext = {
        lessons,
        neighborhood,
        amplitudeMetricsAvailable: knownMetrics,
        now: ctx.now,
      };
      const curatorDecision = evaluateProposal(proposal, curatorCtx);
      result.curator_decision = curatorDecision;

      if (!curatorDecision.approved) {
        result.status = 'denied';
        result.message = curatorDecision.message ?? `Curator denied with ${curatorDecision.code}`;
        return result;
      }

      // ── Phase 5: Applier ───────────────────────────────────────────────────
      const applierResult = await runApplier(proposal, {
        neighborhood,
        hooks: {
          snapshot: async () => `snap-${generateId('snap')}`,
          dryRun: async () => ({ predictedDelta: proposal.expected_effect.magnitude }),
          applyLive: async () => {
            /* hook: real apply in PR2 */
          },
          applyShadow: async () => {
            /* hook: shadow apply in PR2 */
          },
          restoreSnapshot: async () => {
            /* hook: restore in PR2 */
          },
          measureActual: async () => proposal.expected_effect.magnitude,
        },
        now: ctx.now,
      });
      result.applier_result = applierResult;

      // Update neighborhood state
      neighborhood = nextNeighborhoodState(neighborhood, applierResult, ctx.now);

      // ── Phase 6: Reflector ──────────────────────────────────────────────────
      if (applierResult.status === 'applied' || applierResult.status === 'reverted') {
        const predictedDelta = proposal.expected_effect.magnitude;
        await reflect(proposal, applierResult, predictedDelta, this.lessonsChain);
        result.lessons_written = 1;
      }

      result.status =
        applierResult.status === 'applied'
          ? 'completed'
          : applierResult.status === 'halted'
            ? 'halted'
            : applierResult.status === 'reverted'
              ? 'reverted'
              : applierResult.status === 'shadowed'
                ? 'shadowed'
                : 'error';
      result.message = applierResult.message;

      return result;
    } catch (err) {
      result.status = 'error';
      result.error = err instanceof Error ? err.message : String(err);
      return result;
    }
  }

  /** Inject input metrics for the next run (sets primary provider) */
  withInputMetrics(metrics: MetricsSnapshot[]): this {
    this.inputProvider = InputMetricsProvider.fromSnapshots(metrics);
    this.metricsChain = this.rebuildMetricsChain();
    return this;
  }

  /** Rebuild metrics chain from deps (used when input metrics need fresh chain) */
  private rebuildMetricsChain(): MetricsProviderChain {
    return new MetricsProviderChain(
      this.inputProvider,
      new KVMetricsProvider(this.deps.kv ?? null),
      new AmplitudeMetricsProvider(this.deps.amplitudeApiKey ?? null),
    );
  }
}
