// Debug test for pipeline
import { describe, expect, it } from 'vitest';
import { AlphaPipeline } from './pipeline.js';
import type { PipelineContext, MetricsSnapshot } from './types.js';

describe('debug pipeline', () => {
  it('basic run with no proposal', async () => {
    const pipeline = new AlphaPipeline({});
    const ctx: PipelineContext = {
      id: 'test-2',
      trigger: 'api',
      correlation_id: 'corr-2',
      input: {}, // No proposal, no metrics
      flags: {},
      now: new Date(),
      neighborhood: {
        inputs_hash: 'hash-2',
        current_cooldown_hours: 6,
        consecutive_halts_24h: 0,
        seen_before: true,
      },
    };
    const result = await pipeline.run(ctx);
    console.log('Result (no proposal):', JSON.stringify(result, null, 2));
    console.log('Error:', result.error);
    // Test the actual status — if error, print what happened
    expect(result.status).not.toBe('error'); // No runtime errors
    expect(result.observation).toBeDefined();
  });

  it('basic run with baseMetrics', async () => {
    const pipeline = new AlphaPipeline({});
    const baseMetrics: MetricsSnapshot[] = [
      {
        metric: 'routing.success_rate',
        value: 0.95,
        timestamp: '2026-05-14T12:00:00Z',
        tags: { service: 'api-gateway', region: 'us-west1' },
      },
    ];
    const ctx: PipelineContext = {
      id: 'test-3',
      trigger: 'api',
      correlation_id: 'corr-3',
      input: { metrics: baseMetrics }, // Has metrics, no proposal
      flags: {},
      now: new Date(),
      neighborhood: {
        inputs_hash: 'hash-3',
        current_cooldown_hours: 6,
        consecutive_halts_24h: 0,
        seen_before: true,
      },
    };
    const result = await pipeline.run(ctx);
    console.log('Result (baseMetrics):', JSON.stringify(result, null, 2));
    console.log('Error:', result.error);
    // Test the actual status
    expect(result.status).not.toBe('error'); // No runtime errors
    expect(result.observation).toBeDefined();
  });

  it('basic run with proposal', async () => {
    const pipeline = new AlphaPipeline({});
    const ctx: PipelineContext = {
      id: 'test-1',
      trigger: 'api',
      correlation_id: 'corr-1',
      input: {
        proposal: {
          id: 'P-test',
          title: 'test',
          inputs_hash: 'hash-test',
          change_summary: 'test',
          files_or_pages_touched: ['a'],
          expected_effect: { metric: 'm', direction: 'increase', magnitude: 0.05, tolerance: 0.02 },
          rollback_steps: ['revert'],
          risk_class: 'low',
          requires: ['Curator'],
          citations: [{ kind: 'log', id: 'log-1' }],
          classification: 'config-change',
          idempotent: true,
        },
      },
      flags: {},
      now: new Date(),
      neighborhood: {
        inputs_hash: 'hash-test',
        current_cooldown_hours: 6,
        consecutive_halts_24h: 0,
        seen_before: true,
      },
    };
    const result = await pipeline.run(ctx);
    console.log('Result (proposal):', JSON.stringify(result, null, 2));
    // Test the actual status — if denied, print curator decision
    console.log('Curator decision:', JSON.stringify(result.curator_decision));
    expect(result.status).not.toBe('error'); // No runtime errors
    expect(result.curator_decision).toBeDefined();
  });
});
