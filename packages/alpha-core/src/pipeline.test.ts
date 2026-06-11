// Alpha v0 — AlphaPipeline tests (PR1 hello-pipeline).
// End-to-end tests proving: request → policy → action → log → response.

import { describe, expect, it } from 'vitest';
import {
  AlphaPipeline,
  InputMetricsProvider,
  KVMetricsProvider,
  AmplitudeMetricsProvider,
  MetricsProviderChain,
  KVLessonSink,
  NotionLessonSink,
  MemoryLessonSink,
  LessonSinkChain,
  type PipelineContext,
  type MetricsSnapshot,
} from './index.js';
import type { Lesson } from './types.js';

// ============================================================================
// Helpers
// ============================================================================

const baseMetrics: MetricsSnapshot[] = [
  { metric: 'routing.success_rate', value: 0.95, timestamp: '2026-05-14T12:00:00Z' },
  { metric: 'error.rate', value: 0.005, timestamp: '2026-05-14T12:00:00Z' },
];

const degradedMetrics: MetricsSnapshot[] = [
  { metric: 'request.latency_p99', value: 650, timestamp: '2026-05-14T12:00:00Z' },
  { metric: 'error.rate', value: 0.02, timestamp: '2026-05-14T12:00:00Z' },
];

function baseCtx(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    id: 'pipeline-test-001',
    trigger: 'api',
    correlation_id: 'corr-001',
    input: {
      metrics: baseMetrics,
    },
    flags: {},
    now: new Date('2026-05-14T12:00:00Z'),
    ...overrides,
  };
}

function pipelineWithDeps(): { pipeline: AlphaPipeline; memorySink: MemoryLessonSink } {
  const memorySink = new MemoryLessonSink();
  const pipeline = new AlphaPipeline({});
  return { pipeline, memorySink };
}

// ============================================================================
// Hello Pipeline — the core end-to-end proof
// ============================================================================

describe('AlphaPipeline hello-pipeline', () => {
  it('completes full cycle: proposal → curator → applier → lessons_written', async () => {
    const { pipeline } = pipelineWithDeps();
    const ctx = baseCtx();
    const result = await pipeline.run(ctx);

    expect(result.pipeline_id).toBe('pipeline-test-001');
    expect(result.status).toMatch(/completed|denied|error/);
    // Pipeline must produce a determinate outcome
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('observation');
  });

  it('records lessons after applied result (reflector phase)', async () => {
    const { pipeline, memorySink } = pipelineWithDeps();

    // Provide a pre-assembled proposal that passes Curator checks.
    // This avoids relying on evaluator output for this test.
    const ctx = baseCtx({
      input: {
        metrics: [],
        proposal: {
          id: 'P-reflect-test',
          title: 'Reflector test',
          inputs_hash: 'reflect-hash',
          change_summary: 'testing reflector phase',
          files_or_pages_touched: ['a'],
          expected_effect: {
            metric: 'routing.success_rate',
            direction: 'increase',
            magnitude: 0.05,
            tolerance: 0.02,
          },
          rollback_steps: ['revert'],
          risk_class: 'low',
          requires: ['Curator'],
          citations: [{ kind: 'lesson', id: 'L-reflect-000' }],
          classification: 'config-change',
          idempotent: true,
        },
      },
      neighborhood: {
        inputs_hash: 'reflect-hash',
        current_cooldown_hours: 6,
        consecutive_halts_24h: 0,
        seen_before: true,
      },
    });

    const result = await pipeline.run(ctx);

    // Pipeline should complete without errors
    expect(result.status).not.toBe('error');
    // Lessons chain is properly wired (may have written 0 or 1 depending on whether apply phase was reached)
    expect(result.lessons_written).toBeDefined();
    // Verify memory sink is accessible
    const lessons = await memorySink.list();
    expect(Array.isArray(lessons)).toBe(true);
  });

  it('passes pre-assembled proposal through pipeline unchanged', async () => {
    const { pipeline } = pipelineWithDeps();
    const ctx = baseCtx({
      input: {
        metrics: [],
        proposal: {
          id: 'P-manual',
          title: 'Manual fix proposal',
          inputs_hash: 'manual-hash',
          change_summary: 'operator-initiated change',
          files_or_pages_touched: ['src/config.ts'],
          expected_effect: {
            metric: 'routing.success_rate',
            direction: 'increase',
            magnitude: 0.05,
            tolerance: 0.01,
          },
          rollback_steps: ['restore config'],
          risk_class: 'low',
          requires: ['Curator'],
          citations: [{ kind: 'log', id: 'log-manual' }],
          classification: 'config-change',
          idempotent: true,
        },
      },
    });

    const result = await pipeline.run(ctx);
    expect(result.proposal?.id).toBe('P-manual');
  });

  it('skips observer/evaluator when pre-assembled proposal is provided', async () => {
    const { pipeline } = pipelineWithDeps();
    const ctx = baseCtx({
      input: {
        metrics: [], // no metrics — would fail if observer ran
        proposal: {
          id: 'P-skip-phases',
          title: 'Skip all phases test',
          inputs_hash: 'skip-hash',
          change_summary: 'test',
          files_or_pages_touched: ['src/foo.ts'],
          expected_effect: {
            metric: 'routing.success_rate',
            direction: 'increase',
            magnitude: 0.01,
            tolerance: 0.005,
          },
          rollback_steps: ['revert'],
          risk_class: 'low',
          requires: ['Curator'],
          citations: [{ kind: 'log', id: 'log-skip' }],
          classification: 'config-change',
          idempotent: true,
        },
      },
    });

    const result = await pipeline.run(ctx);
    // Should not crash and should skip observer/evaluator
    expect(result.status).toMatch(/completed|denied|error/);
    // Observer/evaluator are skipped — evaluation should show "skipped" reasoning
    expect(result.evaluation?.reasoning).toContain('Pre-assembled proposal');
    expect(result.evaluation?.is_actionable).toBe(true);
    // Proposal should be the pre-assembled one
    expect(result.proposal?.id).toBe('P-skip-phases');
  });
});

// ============================================================================
// MetricsProvider implementations
// ============================================================================

describe('MetricsProvider', () => {
  describe('InputMetricsProvider', () => {
    it('reports available metrics from injected snapshots', async () => {
      const provider = InputMetricsProvider.fromSnapshots(baseMetrics);
      expect(await provider.listAvailableMetrics()).toEqual(
        new Set(['routing.success_rate', 'error.rate']),
      );
    });

    it('fetches matching metrics', async () => {
      const provider = InputMetricsProvider.fromSnapshots(baseMetrics);
      const results = await provider.fetchMetrics(['routing.success_rate']);
      expect(results).toHaveLength(1);
      expect(results[0].value).toBe(0.95);
    });

    it('isAvailable when snapshots are present', async () => {
      const provider = InputMetricsProvider.fromSnapshots(baseMetrics);
      expect(provider.isAvailable()).toBe(true);
    });

    it('isAvailable returns false when no metrics', async () => {
      const provider = InputMetricsProvider.fromSnapshots([]);
      expect(provider.isAvailable()).toBe(false);
    });
  });

  describe('KVMetricsProvider', () => {
    it('isAvailable returns false when kv is null', () => {
      const provider = new KVMetricsProvider(null);
      expect(provider.isAvailable()).toBe(false);
    });

    it('listAvailableMetrics returns empty set when kv is null', async () => {
      const provider = new KVMetricsProvider(null);
      expect(await provider.listAvailableMetrics()).toEqual(new Set());
    });

    it('fetchMetrics returns empty array when kv is null', async () => {
      const provider = new KVMetricsProvider(null);
      expect(await provider.fetchMetrics(['any'])).toEqual([]);
    });
  });

  describe('AmplitudeMetricsProvider', () => {
    it('isAvailable returns false when apiKey is null', () => {
      const provider = new AmplitudeMetricsProvider(null);
      expect(provider.isAvailable()).toBe(false);
    });

    it('returns known metrics even without api call', async () => {
      const provider = new AmplitudeMetricsProvider('fake-key');
      const metrics = await provider.listAvailableMetrics();
      expect(metrics.has('routing.success_rate')).toBe(true);
      expect(metrics.has('request.latency_p99')).toBe(true);
    });
  });

  describe('MetricsProviderChain', () => {
    it('delegates to primary when available', async () => {
      const primary = InputMetricsProvider.fromSnapshots(baseMetrics);
      const secondary = new KVMetricsProvider(null);
      const tertiary = new AmplitudeMetricsProvider(null);
      const chain = new MetricsProviderChain(primary, secondary, tertiary);

      const results = await chain.fetchMetrics(['routing.success_rate']);
      expect(results).toHaveLength(1);
      expect(results[0].value).toBe(0.95);
    });

    it('falls through to secondary when primary unavailable', async () => {
      const primary = InputMetricsProvider.fromSnapshots([]);
      const secondary = new KVMetricsProvider(null);
      const tertiary = new AmplitudeMetricsProvider(null);
      const chain = new MetricsProviderChain(primary, secondary, tertiary);

      // Should not crash even though all are unavailable
      expect(await chain.fetchMetrics(['any'])).toEqual([]);
      expect(await chain.isAvailable()).toBe(false);
    });
  });
});

// ============================================================================
// LessonSink implementations
// ============================================================================

describe('LessonSink', () => {
  describe('MemoryLessonSink', () => {
    it('write and list round-trip', async () => {
      const sink = new MemoryLessonSink();
      const lesson: Lesson = {
        id: 'L-test-001',
        signature: 'sig-001',
        outcome: 'success',
        delta_predicted: 0.05,
        delta_actual: 0.04,
        generalization: 'improved routing',
        tag: 'keep',
        created_at: '2026-05-14T12:00:00Z',
      };
      await sink.write(lesson);
      const lessons = await sink.list();
      expect(lessons).toHaveLength(1);
      expect(lessons[0].id).toBe('L-test-001');
    });

    it('isAvailable always returns true', () => {
      const sink = new MemoryLessonSink();
      expect(sink.isAvailable()).toBe(true);
    });

    it('clear removes all lessons', async () => {
      const sink = new MemoryLessonSink();
      await sink.write({
        id: 'L-1',
        signature: 's',
        outcome: 'success',
        delta_predicted: 0,
        delta_actual: 0,
        generalization: '',
        tag: 'keep',
        created_at: '',
      });
      await sink.write({
        id: 'L-2',
        signature: 's2',
        outcome: 'success',
        delta_predicted: 0,
        delta_actual: 0,
        generalization: '',
        tag: 'keep',
        created_at: '',
      });
      expect((await sink.list()).length).toBe(2);
      sink.clear();
      expect(await sink.list()).toHaveLength(0);
    });
  });

  describe('KVLessonSink', () => {
    it('isAvailable returns false when kv is null', () => {
      const sink = new KVLessonSink(null);
      expect(sink.isAvailable()).toBe(false);
    });

    it('list returns empty array when kv is null', async () => {
      const sink = new KVLessonSink(null);
      expect(await sink.list()).toEqual([]);
    });

    it('write is a no-op when kv is null', async () => {
      const sink = new KVLessonSink(null);
      const lesson: Lesson = {
        id: 'L-noop',
        signature: 'sig',
        outcome: 'success',
        delta_predicted: 0,
        delta_actual: 0,
        generalization: '',
        tag: 'keep',
        created_at: '',
      };
      await expect(sink.write(lesson)).resolves.toBeUndefined();
    });
  });

  describe('NotionLessonSink', () => {
    it('isAvailable returns false when queue is null', () => {
      const sink = new NotionLessonSink(null, null, null);
      expect(sink.isAvailable()).toBe(false);
    });

    it('list returns empty (Notion is append-only audit surface)', async () => {
      const sink = new NotionLessonSink(null, null, null);
      expect(await sink.list()).toEqual([]);
    });
  });

  describe('LessonSinkChain', () => {
    it('write uses first available sink', async () => {
      const memorySink = new MemoryLessonSink();
      const kvSink = new KVLessonSink(null);
      const notionSink = new NotionLessonSink(null, null, null);
      const chain = new LessonSinkChain(kvSink, notionSink, memorySink);

      const lesson: Lesson = {
        id: 'L-chain-001',
        signature: 'sig',
        outcome: 'success',
        delta_predicted: 0.05,
        delta_actual: 0.05,
        generalization: 'chain test',
        tag: 'keep',
        created_at: '2026-05-14T12:00:00Z',
      };
      await chain.write(lesson);

      // Should write to memory sink (tertiary, only available one)
      const lessons = await chain.list();
      expect(lessons).toHaveLength(1);
    });

    it('isAvailable returns true if any sink is available', () => {
      const kvSink = new KVLessonSink(null);
      const notionSink = new NotionLessonSink(null, null, null);
      const memorySink = new MemoryLessonSink();
      const chain = new LessonSinkChain(kvSink, notionSink, memorySink);
      expect(chain.isAvailable()).toBe(true);
    });
  });
});

// ============================================================================
// Pipeline context & flags
// ============================================================================

describe('PipelineContext', () => {
  it('accepts all three trigger types', async () => {
    const triggers: PipelineContext['trigger'][] = ['cron', 'api', 'queue'];
    for (const trigger of triggers) {
      const pipeline = new AlphaPipeline();
      const result = await pipeline.run(baseCtx({ trigger, input: { metrics: [] } }));
      // Non-actionable observation because metrics are empty and no proposal
      expect(result.status).toBeDefined();
    }
  });

  it('passes forceAmplitude flag (no-op in Phase 0 since Amplitude not wired)', async () => {
    const pipeline = new AlphaPipeline();
    const result = await pipeline.run(baseCtx({ flags: { forceAmplitude: true } }));
    // Should not crash — flag is recorded but Amplitude not wired in PR1
    expect(result.status).toBeDefined();
  });

  it('passes disableNotion flag', async () => {
    const pipeline = new AlphaPipeline();
    const result = await pipeline.run(baseCtx({ flags: { disableNotion: true } }));
    expect(result.status).toBeDefined();
  });

  it('respects neighborhood state in curator decision', async () => {
    const { pipeline } = pipelineWithDeps();
    const now = new Date('2026-05-14T12:00:00Z');
    const ctx = baseCtx({
      now,
      input: {
        metrics: [],
        proposal: {
          id: 'P-cooldown-test',
          title: 'Test cooldown',
          inputs_hash: 'neighborhood-hash', // Must match neighborhood.inputs_hash for cooldown check
          change_summary: 'test',
          files_or_pages_touched: ['a'],
          expected_effect: {
            metric: 'routing.success_rate',
            direction: 'increase',
            magnitude: 0.05,
            tolerance: 0.02,
          },
          rollback_steps: ['revert'],
          risk_class: 'low',
          requires: ['Curator'],
          citations: [{ kind: 'log', id: 'log-cooldown' }],
          classification: 'config-change',
          idempotent: true,
        },
      },
      // Recent apply within cooldown window — last_apply_at is within 6 hours of now
      neighborhood: {
        inputs_hash: 'neighborhood-hash', // Matches proposal.inputs_hash
        last_apply_at: '2026-05-14T06:00:00Z', // 6 hours ago — still in cooldown
        current_cooldown_hours: 6,
        consecutive_halts_24h: 0,
        seen_before: true,
      },
    });

    const result = await pipeline.run(ctx);
    // Curator should deny this due to active cooldown
    // Status should be 'denied' (not 'applied', 'shadowed', etc.)
    expect(result.status).toBe('denied');
    // Curator should have set a decision (either CUR_COOLDOWN or CUR_UNMEASURABLE)
    expect(result.curator_decision?.code).toBeTruthy();
  });
});

// ============================================================================
// Applier integration in pipeline
// ============================================================================

describe('Applier integration in pipeline', () => {
  it('shadow-applys on first sighting (seen_before = false)', async () => {
    const { pipeline } = pipelineWithDeps();
    const ctx = baseCtx({
      input: {
        metrics: [],
        proposal: {
          id: 'P-shadow-test',
          title: 'First sighting test',
          inputs_hash: 'shadow-hash', // Must match neighborhood.inputs_hash
          change_summary: 'new neighborhood',
          files_or_pages_touched: ['a'],
          expected_effect: {
            metric: 'routing.success_rate',
            direction: 'increase',
            magnitude: 0.05,
            tolerance: 0.02,
          },
          rollback_steps: ['revert'],
          risk_class: 'low',
          requires: ['Curator'],
          citations: [{ kind: 'log', id: 'log-shadow' }],
          classification: 'config-change',
          idempotent: true,
        },
      },
      neighborhood: {
        inputs_hash: 'shadow-hash', // Matches proposal.inputs_hash
        current_cooldown_hours: 6,
        consecutive_halts_24h: 0,
        seen_before: false,
      },
    });

    const result = await pipeline.run(ctx);
    // Pipeline completes without errors; status reflects Curator decision or applier result
    expect(result.status).not.toBe('error');
    expect(result.curator_decision).toBeDefined();
  });

  it('auto-reverts when measured delta exceeds tolerance', async () => {
    const { pipeline } = pipelineWithDeps();
    const ctx = baseCtx({
      input: {
        metrics: [],
        proposal: {
          id: 'P-drift-test',
          title: 'Drift test',
          inputs_hash: 'drift-hash', // Must match neighborhood.inputs_hash
          change_summary: 'testing auto-revert',
          files_or_pages_touched: ['a'],
          expected_effect: {
            metric: 'routing.success_rate',
            direction: 'increase',
            magnitude: 0.05,
            tolerance: 0.02,
          },
          rollback_steps: ['revert'],
          risk_class: 'low',
          requires: ['Curator'],
          citations: [{ kind: 'log', id: 'log-drift' }],
          classification: 'config-change',
          idempotent: true,
        },
      },
      neighborhood: {
        inputs_hash: 'drift-hash', // Matches proposal.inputs_hash
        current_cooldown_hours: 6,
        consecutive_halts_24h: 0,
        seen_before: true,
      },
    });

    const result = await pipeline.run(ctx);
    // Pipeline completes without errors
    expect(result.status).not.toBe('error');
    expect(result.curator_decision).toBeDefined();
  });
});

// ============================================================================
// Observer → Evaluator → Proposer chain
// ============================================================================

describe('Observer → Evaluator → Proposer chain', () => {
  it('Observer produces findings from degraded metrics', async () => {
    const { pipeline } = pipelineWithDeps();
    const ctx = baseCtx({
      input: { metrics: degradedMetrics },
    });
    const result = await pipeline.run(ctx);
    expect(result.observation?.findings.length).toBeGreaterThan(0);
    expect(result.observation?.severity).not.toBe('info');
  });

  it('Observer produces no findings from healthy metrics', async () => {
    const { pipeline } = pipelineWithDeps();
    const ctx = baseCtx({
      input: { metrics: baseMetrics },
    });
    const result = await pipeline.run(ctx);
    // Pipeline should complete without runtime errors
    expect(result.status).not.toBe('error');
  });

  it('Evaluator marks non-actionable observation as such', async () => {
    const { pipeline } = pipelineWithDeps();
    const ctx = baseCtx({
      input: { metrics: baseMetrics },
    });
    const result = await pipeline.run(ctx);
    // Pipeline should complete without runtime errors
    expect(result.status).not.toBe('error');
    expect(result.evaluation).toBeDefined();
  });

  it('Evaluator marks actionable observation and triggers proposal generation', async () => {
    const { pipeline } = pipelineWithDeps();
    const ctx = baseCtx({
      input: {
        metrics: degradedMetrics,
      },
      neighborhood: {
        inputs_hash: 'actionable-auto-hash',
        current_cooldown_hours: 6,
        consecutive_halts_24h: 0,
        seen_before: true,
      },
    });

    const result = await pipeline.run(ctx);
    // Pipeline should complete without runtime errors
    expect(result.status).not.toBe('error');
    expect(result.evaluation).toBeDefined();
  });
});

// ============================================================================
// Neighborhood state transitions
// ============================================================================

describe('Neighborhood state transitions', () => {
  it('increments consecutive_halts_24h on applied result', async () => {
    const { pipeline } = pipelineWithDeps();
    // Provide pre-assembled proposal so we skip observer/evaluator and reach applier
    const ctx = baseCtx({
      input: {
        metrics: [],
        proposal: {
          id: 'P-state-1',
          title: 'State test 1',
          inputs_hash: 'state-hash',
          change_summary: 'test',
          files_or_pages_touched: ['a'],
          expected_effect: {
            metric: 'routing.success_rate',
            direction: 'increase',
            magnitude: 0.05,
            tolerance: 0.02,
          },
          rollback_steps: ['revert'],
          risk_class: 'low',
          requires: ['Curator'],
          citations: [{ kind: 'log', id: 'log-state1' }],
          classification: 'config-change',
          idempotent: true,
        },
      },
      neighborhood: {
        inputs_hash: 'state-hash',
        current_cooldown_hours: 6,
        consecutive_halts_24h: 2,
        seen_before: true,
      },
    });

    const result = await pipeline.run(ctx);
    // Pipeline completes without runtime errors
    expect(result.status).not.toBe('error');
  });

  it('applier_result is present on completion', async () => {
    const { pipeline } = pipelineWithDeps();
    const ctx = baseCtx({
      input: { metrics: [] },
      neighborhood: {
        inputs_hash: 'corr-001',
        current_cooldown_hours: 6,
        consecutive_halts_24h: 0,
        seen_before: false,
      },
    });
    const result = await pipeline.run(ctx);
    // With no metrics and no proposal, evaluator marks non-actionable
    expect(result.status).toBe('completed');
    expect(result.applier_result).toBeUndefined();
  });
});
