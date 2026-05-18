import { describe, expect, it, vi } from 'vitest';
import {
  nextNeighborhoodState,
  runApplier,
  type ApplierContext,
  type ApplierHooks,
} from '../src/applier';
import type { NeighborhoodState, Proposal } from '../src/types';

function makeHooks(overrides: Partial<ApplierHooks> = {}): ApplierHooks {
  return {
    snapshot: vi.fn(async () => 'snap-1'),
    dryRun: vi.fn(async () => ({ predictedDelta: 0.05 })),
    applyLive: vi.fn(async () => {}),
    applyShadow: vi.fn(async () => {}),
    restoreSnapshot: vi.fn(async () => {}),
    measureActual: vi.fn(async () => 0.05),
    ...overrides,
  };
}

const baseProposal: Proposal = {
  id: 'P-test',
  title: 't',
  inputs_hash: 'h',
  change_summary: 's',
  files_or_pages_touched: ['a'],
  expected_effect: { metric: 'm', direction: 'increase', magnitude: 0.05, tolerance: 0.02 },
  rollback_steps: ['r'],
  risk_class: 'low',
  requires: ['Curator'],
  citations: [{ kind: 'log', id: 'log-1' }],
  classification: 'config-change',
  idempotent: true,
};

function ctx(
  neighborhood: Partial<NeighborhoodState> = {},
  hookOverrides: Partial<ApplierHooks> = {},
): ApplierContext {
  return {
    hooks: makeHooks(hookOverrides),
    neighborhood: {
      inputs_hash: 'h',
      current_cooldown_hours: 6,
      consecutive_halts_24h: 0,
      seen_before: true,
      ...neighborhood,
    },
    now: new Date('2026-05-14T12:00:00Z'),
  };
}

describe('runApplier', () => {
  it('halts on blast-radius cap', async () => {
    const proposal = { ...baseProposal, files_or_pages_touched: ['a', 'b', 'c', 'd'] };
    const result = await runApplier(proposal, ctx());

    expect(result.status).toBe('halted');
    expect(result.code).toBe('APP_BLAST_CAP');
  });

  it('shadows on new neighborhoods', async () => {
    const context = ctx({ seen_before: false });
    const result = await runApplier(baseProposal, context);

    expect(result.status).toBe('shadowed');
    expect(context.hooks.applyShadow).toHaveBeenCalledTimes(1);
    expect(context.hooks.applyLive).not.toHaveBeenCalled();
  });

  it('halts on canary failure and restores the snapshot', async () => {
    const proposal = { ...baseProposal, files_or_pages_touched: ['a', 'b'] };
    const context = ctx(
      {},
      {
        applyLive: vi.fn(async () => {
          throw new Error('boom');
        }),
      },
    );
    const result = await runApplier(proposal, context);

    expect(result.code).toBe('APP_CANARY_FAIL');
    expect(context.hooks.restoreSnapshot).toHaveBeenCalledTimes(1);
  });

  it('auto-reverts when actual delta drifts past tolerance', async () => {
    const context = ctx(
      {},
      {
        dryRun: vi.fn(async () => ({ predictedDelta: 0.05 })),
        measureActual: vi.fn(async () => 0.2),
      },
    );
    const result = await runApplier(baseProposal, context);

    expect(result.status).toBe('reverted');
    expect(result.code).toBe('APP_AUTOREVERT');
    expect(context.hooks.restoreSnapshot).toHaveBeenCalledTimes(1);
  });

  it('applies cleanly when within tolerance', async () => {
    const result = await runApplier(baseProposal, ctx());

    expect(result.status).toBe('applied');
  });
});

describe('nextNeighborhoodState', () => {
  const now = new Date('2026-05-14T12:00:00Z');
  const base: NeighborhoodState = {
    inputs_hash: 'h',
    current_cooldown_hours: 6,
    consecutive_halts_24h: 0,
    seen_before: true,
  };

  it('doubles cooldown on halted results', () => {
    const next = nextNeighborhoodState(base, { status: 'halted', code: 'APP_BLAST_CAP' }, now);

    expect(next.current_cooldown_hours).toBe(12);
    expect(next.consecutive_halts_24h).toBe(1);
  });

  it('quarantines after three halt-equivalent results in 24 hours', () => {
    const afterTwo = { ...base, consecutive_halts_24h: 2, current_cooldown_hours: 24 };
    const next = nextNeighborhoodState(
      afterTwo,
      { status: 'halted', code: 'APP_CANARY_FAIL' },
      now,
    );

    expect(next.consecutive_halts_24h).toBe(3);
    expect(next.quarantined_until).toBeDefined();
  });

  it('resets cooldown and halt count on successful apply', () => {
    const afterTwo = { ...base, consecutive_halts_24h: 2, current_cooldown_hours: 24 };
    const next = nextNeighborhoodState(afterTwo, { status: 'applied' }, now);

    expect(next.consecutive_halts_24h).toBe(0);
    expect(next.current_cooldown_hours).toBe(6);
    expect(next.last_apply_at).toBe(now.toISOString());
  });

  it('treats reverted status as halt-equivalent for backoff', () => {
    const next = nextNeighborhoodState(base, { status: 'reverted', code: 'APP_AUTOREVERT' }, now);

    expect(next.consecutive_halts_24h).toBe(1);
    expect(next.current_cooldown_hours).toBe(12);
  });
});
