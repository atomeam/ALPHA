import { ALPHA_CONFIG } from './config';
import type { ApplierResult, HaltCode, NeighborhoodState, Proposal } from './types';

export interface ApplierHooks {
  snapshot: (targets: string[]) => Promise<string>;
  dryRun: (proposal: Proposal) => Promise<{ predictedDelta: number }>;
  applyLive: (proposal: Proposal, targets: string[]) => Promise<void>;
  applyShadow: (proposal: Proposal) => Promise<void>;
  restoreSnapshot: (snapshotId: string) => Promise<void>;
  measureActual: (proposal: Proposal) => Promise<number>;
}

export interface ApplierContext {
  neighborhood: NeighborhoodState;
  hooks: ApplierHooks;
  now: Date;
}

function blastWithinCap(proposal: Proposal): boolean {
  const cap = ALPHA_CONFIG.blastRadius;
  const targets = proposal.files_or_pages_touched;

  return targets.length <= cap.maxFiles && targets.length <= cap.maxNotionPages;
}

function halt(code: HaltCode, message: string): ApplierResult {
  return { status: 'halted', code, message };
}

export async function runApplier(proposal: Proposal, ctx: ApplierContext): Promise<ApplierResult> {
  if (!blastWithinCap(proposal)) {
    return halt('APP_BLAST_CAP', 'Proposal exceeded blast-radius cap.');
  }

  if (!ctx.neighborhood.seen_before) {
    await ctx.hooks.applyShadow(proposal);

    return {
      status: 'shadowed',
      message: 'First sighting of inputs_hash neighborhood; shadow only.',
    };
  }

  const targets = proposal.files_or_pages_touched.slice();
  const isMultiTarget = targets.length > 1;
  const canaryTargets = isMultiTarget ? targets.slice(0, 1) : targets;
  const remainderTargets = isMultiTarget ? targets.slice(1) : [];
  const snapshotId = await ctx.hooks.snapshot(targets);
  const { predictedDelta } = await ctx.hooks.dryRun(proposal);

  try {
    await ctx.hooks.applyLive(proposal, canaryTargets);
  } catch (error) {
    await ctx.hooks.restoreSnapshot(snapshotId);

    return halt('APP_CANARY_FAIL', `Canary apply failed: ${errorMessage(error)}`);
  }

  const actual = await ctx.hooks.measureActual(proposal);
  const driftLimit = proposal.expected_effect.tolerance * ALPHA_CONFIG.autoRevert.triggerMultiplier;
  const drift = Math.abs(actual - predictedDelta);

  if (drift > driftLimit) {
    await ctx.hooks.restoreSnapshot(snapshotId);

    return {
      status: 'reverted',
      code: 'APP_AUTOREVERT',
      snapshot_id: snapshotId,
      delta_observed: actual,
      message: `Drift ${drift.toFixed(3)} exceeded ${driftLimit.toFixed(3)}; reverted.`,
    };
  }

  if (remainderTargets.length) {
    return {
      status: 'applied',
      snapshot_id: snapshotId,
      delta_observed: actual,
      message:
        `Canary applied to ${canaryTargets[0]}; ${remainderTargets.length} target(s) deferred by ` +
        `${ALPHA_CONFIG.canary.waitCycles} cycle(s).`,
    };
  }

  return {
    status: 'applied',
    snapshot_id: snapshotId,
    delta_observed: actual,
  };
}

export function nextNeighborhoodState(
  prev: NeighborhoodState,
  result: ApplierResult,
  now: Date,
): NeighborhoodState {
  const next: NeighborhoodState = { ...prev, seen_before: true };

  if (result.status === 'halted' || result.status === 'reverted') {
    next.consecutive_halts_24h = prev.consecutive_halts_24h + 1;
    next.current_cooldown_hours =
      prev.current_cooldown_hours * ALPHA_CONFIG.cooldown.backoffMultiplier ||
      ALPHA_CONFIG.cooldown.baseHours;

    if (next.consecutive_halts_24h >= ALPHA_CONFIG.cooldown.quarantineThresholdHalts24h) {
      next.quarantined_until = new Date(
        now.getTime() + ALPHA_CONFIG.cooldown.quarantineDays * 24 * 60 * 60 * 1000,
      ).toISOString();
    }
  } else if (result.status === 'applied') {
    next.last_apply_at = now.toISOString();
    next.current_cooldown_hours = ALPHA_CONFIG.cooldown.baseHours;
    next.consecutive_halts_24h = 0;
  }

  return next;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
