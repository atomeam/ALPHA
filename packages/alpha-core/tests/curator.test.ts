import { describe, expect, it } from 'vitest';
import { evaluateProposal, type CuratorContext } from '../src/curator';
import type { Lesson, Proposal } from '../src/types';

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
    const decision = evaluateProposal({ ...baseProposal, citations: [] }, baseCtx());

    expect(decision.code).toBe('CUR_BAD_CITATION');
  });

  it('denies missing rollback steps', () => {
    const decision = evaluateProposal({ ...baseProposal, rollback_steps: [] }, baseCtx());

    expect(decision.code).toBe('CUR_NO_ROLLBACK');
  });

  it('denies unmeasurable metrics', () => {
    const decision = evaluateProposal(
      baseProposal,
      baseCtx({ amplitudeMetricsAvailable: new Set() }),
    );

    expect(decision.code).toBe('CUR_UNMEASURABLE');
  });

  it('denies medium and high risk without operator co-sign', () => {
    const medium = evaluateProposal({ ...baseProposal, risk_class: 'medium' }, baseCtx());
    const high = evaluateProposal({ ...baseProposal, risk_class: 'high' }, baseCtx());

    expect(medium.code).toBe('CUR_NEEDS_OPERATOR');
    expect(high.code).toBe('CUR_NEEDS_OPERATOR');
  });

  it('approves elevated risk with operator co-sign at Curator level', () => {
    const decision = evaluateProposal(
      {
        ...baseProposal,
        risk_class: 'medium',
        operator_cosign: { user: 'user-40', at: '2026-05-14T11:59:00Z' },
      },
      baseCtx(),
    );

    expect(decision.approved).toBe(true);
  });

  it('denies active cooldown and quarantine windows', () => {
    const cooldown = evaluateProposal(
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
    const quarantine = evaluateProposal(
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

    expect(cooldown.code).toBe('CUR_COOLDOWN');
    expect(cooldown.cooldown_until).toBeDefined();
    expect(quarantine.code).toBe('CUR_COOLDOWN');
  });

  it('requires an idempotency guard for non-idempotent proposals', () => {
    const denied = evaluateProposal({ ...baseProposal, idempotent: false }, baseCtx());
    const approved = evaluateProposal(
      { ...baseProposal, idempotent: false, idempotency_guard: 'check current threshold first' },
      baseCtx(),
    );

    expect(denied.code).toBe('CUR_NOT_IDEMPOTENT');
    expect(approved.approved).toBe(true);
  });
});
