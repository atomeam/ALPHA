import { describe, expect, it } from 'vitest';
import { evaluateProposal, type CuratorContext } from './curator';
import type { Lesson, Proposal } from './types';

const baseProposal: Proposal = {
  id: 'P-test',
  title: 'tweak X',
  inputs_hash: 'hash-a',
  change_summary: 'lower routing threshold by 10%',
  files_or_pages_touched: ['src/foo.ts'],
  expected_effect: {
    metric: 'routing.success_rate',
    direction: 'increase',
    magnitude: 0.05,
    tolerance: 0.02,
  },
  rollback_steps: ['restore previous threshold value'],
  risk_class: 'low',
  requires: ['Curator'],
  citations: [{ kind: 'lesson', id: 'L-000' }],
  classification: 'config-change',
  idempotent: true,
};

function baseCtx(overrides: Partial<CuratorContext> = {}): CuratorContext {
  return {
    lessons: [],
    neighborhood: {
      inputs_hash: 'hash-a',
      current_cooldown_hours: 6,
      consecutive_halts_24h: 0,
      seen_before: true,
    },
    amplitudeMetricsAvailable: new Set(['routing.success_rate']),
    now: new Date('2026-05-14T12:00:00Z'),
    ...overrides,
  };
}

describe('evaluateProposal', () => {
  it('approves a clean low-risk proposal', () => {
    expect(evaluateProposal(baseProposal, baseCtx()).approved).toBe(true);
  });

  it('denies do-not-repeat lessons', () => {
    const lesson: Lesson = {
      id: 'L-001',
      signature: 'hash-a',
      outcome: 'failure',
      delta_predicted: 0,
      delta_actual: 0,
      generalization: 'already burned',
      tag: 'do-not-repeat',
      created_at: '2026-05-13T00:00:00Z',
    };

    const decision = evaluateProposal(baseProposal, baseCtx({ lessons: [lesson] }));

    expect(decision.approved).toBe(false);
    expect(decision.code).toBe('CUR_DO_NOT_REPEAT');
  });

  it('denies missing citations', () => {
    expect(evaluateProposal({ ...baseProposal, citations: [] }, baseCtx()).code).toBe(
      'CUR_BAD_CITATION',
    );
  });

  it('denies missing rollback', () => {
    expect(evaluateProposal({ ...baseProposal, rollback_steps: [] }, baseCtx()).code).toBe(
      'CUR_NO_ROLLBACK',
    );
  });

  it('denies unmeasurable metrics', () => {
    expect(
      evaluateProposal(baseProposal, baseCtx({ amplitudeMetricsAvailable: new Set() })).code,
    ).toBe('CUR_UNMEASURABLE');
  });

  it('denies medium or high risk without operator cosign', () => {
    expect(evaluateProposal({ ...baseProposal, risk_class: 'medium' }, baseCtx()).code).toBe(
      'CUR_NEEDS_OPERATOR',
    );
    expect(evaluateProposal({ ...baseProposal, risk_class: 'high' }, baseCtx()).code).toBe(
      'CUR_NEEDS_OPERATOR',
    );
  });

  it('approves elevated risk with operator cosign', () => {
    const operator_cosign = { user: 'user-40', at: '2026-05-14T11:59:00Z' };

    expect(
      evaluateProposal({ ...baseProposal, risk_class: 'medium', operator_cosign }, baseCtx())
        .approved,
    ).toBe(true);
    expect(
      evaluateProposal({ ...baseProposal, risk_class: 'high', operator_cosign }, baseCtx())
        .approved,
    ).toBe(true);
  });

  it('denies during active cooldown', () => {
    const decision = evaluateProposal(
      baseProposal,
      baseCtx({
        neighborhood: {
          inputs_hash: 'hash-a',
          last_apply_at: '2026-05-14T10:00:00Z',
          current_cooldown_hours: 6,
          consecutive_halts_24h: 0,
          seen_before: true,
        },
      }),
    );

    expect(decision.code).toBe('CUR_COOLDOWN');
    expect(decision.cooldown_until).toBeDefined();
  });

  it('denies during active quarantine', () => {
    const decision = evaluateProposal(
      baseProposal,
      baseCtx({
        neighborhood: {
          inputs_hash: 'hash-a',
          current_cooldown_hours: 24,
          consecutive_halts_24h: 3,
          quarantined_until: '2026-05-20T00:00:00Z',
          seen_before: true,
        },
      }),
    );

    expect(decision.code).toBe('CUR_COOLDOWN');
  });

  it('requires an idempotency guard for non-idempotent proposals', () => {
    expect(evaluateProposal({ ...baseProposal, idempotent: false }, baseCtx()).code).toBe(
      'CUR_NOT_IDEMPOTENT',
    );
    expect(
      evaluateProposal(
        { ...baseProposal, idempotent: false, idempotency_guard: 'check current threshold first' },
        baseCtx(),
      ).approved,
    ).toBe(true);
  });
});
