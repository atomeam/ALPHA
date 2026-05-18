// Alpha v0 — Applier with the 9 stability-resilience hardening rules.
// Pure orchestration: takes a Proposal + ctx, returns an ApplierResult.
// Real side effects (file writes, Notion writes) come from the injected hooks.

import { ALPHA_CONFIG } from './config';
import type {
  ApplierHookName,
  ApplierResult,
  HaltCode,
  NeighborhoodState,
  Proposal,
} from './types';

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

type HookOutcome<T> = { ok: true; value: T } | { ok: false; result: ApplierResult };

function blastWithinCap(proposal: Proposal): boolean {
  const cap = ALPHA_CONFIG.blastRadius;
  const targets = proposal.files_or_pages_touched;
  return targets.length <= cap.maxFiles && targets.length <= cap.maxNotionPages;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function halt(
  code: HaltCode,
  message: string,
  hook?: ApplierHookName,
  error?: string,
): ApplierResult {
  return { status: 'halted', code, message, hook, error };
}

async function runHook<T>(
  hook: ApplierHookName,
  code: HaltCode,
  message: string,
  action: () => Promise<T>,
): Promise<HookOutcome<T>> {
  try {
    return { ok: true, value: await action() };
  } catch (error) {
    return { ok: false, result: halt(code, message, hook, errorMessage(error)) };
  }
}

async function restoreOrHalt(
  ctx: ApplierContext,
  snapshotId: string,
): Promise<ApplierResult | undefined> {
  const restored = await runHook(
    'restoreSnapshot',
    'APP_RESTORE_FAIL',
    'Snapshot restore failed.',
    () => ctx.hooks.restoreSnapshot(snapshotId),
  );
  return restored.ok ? undefined : restored.result;
}

export async function runApplier(proposal: Proposal, ctx: ApplierContext): Promise<ApplierResult> {
  // Rule 1 — blast-radius cap
  if (!blastWithinCap(proposal)) {
    return halt('APP_BLAST_CAP', 'Proposal exceeded blast-radius cap.');
  }

  // Rule 9 — shadow apply for new neighborhoods
  if (!ctx.neighborhood.seen_before) {
    const shadowed = await runHook('applyShadow', 'APP_SHADOW_FAIL', 'Shadow apply failed.', () =>
      ctx.hooks.applyShadow(proposal),
    );
    if (!shadowed.ok) return shadowed.result;
    return {
      status: 'shadowed',
      message: 'First sighting of inputs_hash neighborhood; shadow only.',
    };
  }

  // Rule 3 — canary first when touching > 1 target
  const targets = proposal.files_or_pages_touched.slice();
  if (!targets.length) {
    return halt('APP_BLAST_CAP', 'Proposal has no target to apply.');
  }

  const isMulti = targets.length > 1;
  const canary = isMulti ? targets.slice(0, 1) : targets;
  const remainder = isMulti ? targets.slice(1) : [];

  const snapshot = await runHook('snapshot', 'APP_SNAPSHOT_FAIL', 'Snapshot failed.', () =>
    ctx.hooks.snapshot(targets),
  );
  if (!snapshot.ok) return snapshot.result;
  const snapshotId = snapshot.value;

  const dryRun = await runHook('dryRun', 'APP_DRY_RUN_FAIL', 'Dry run failed.', () =>
    ctx.hooks.dryRun(proposal),
  );
  if (!dryRun.ok) {
    return (await restoreOrHalt(ctx, snapshotId)) ?? dryRun.result;
  }

  const applied = await runHook('applyLive', 'APP_CANARY_FAIL', 'Canary apply failed.', () =>
    ctx.hooks.applyLive(proposal, canary),
  );
  if (!applied.ok) {
    return (await restoreOrHalt(ctx, snapshotId)) ?? applied.result;
  }

  const measured = await runHook(
    'measureActual',
    'APP_MEASURE_FAIL',
    'Actual-effect measure failed.',
    () => ctx.hooks.measureActual(proposal),
  );
  if (!measured.ok) {
    return (await restoreOrHalt(ctx, snapshotId)) ?? measured.result;
  }

  const actual = measured.value;
  const tolerance = proposal.expected_effect.tolerance;
  const driftLimit = tolerance * ALPHA_CONFIG.autoRevert.triggerMultiplier;
  const drift = Math.abs(actual - dryRun.value.predictedDelta);

  // Rule 4 — auto-revert circuit breaker
  if (drift > driftLimit) {
    const restoreFailure = await restoreOrHalt(ctx, snapshotId);
    if (restoreFailure) return restoreFailure;
    return {
      status: 'reverted',
      code: 'APP_AUTOREVERT',
      snapshot_id: snapshotId,
      delta_observed: actual,
      message: `Drift ${drift.toFixed(3)} exceeded ${driftLimit.toFixed(3)}; reverted.`,
    };
  }

  // Defer the rest by `waitCycles` — caller is responsible for scheduling.
  if (remainder.length) {
    return {
      status: 'applied',
      snapshot_id: snapshotId,
      delta_observed: actual,
      message:
        `Canary applied to ${canary.join(', ')}; ${remainder.length} target(s) deferred by ` +
        `${ALPHA_CONFIG.canary.waitCycles} cycle(s).`,
    };
  }

  return {
    status: 'applied',
    snapshot_id: snapshotId,
    delta_observed: actual,
  };
}

// Rules 5 & 6 — halt-backoff + quarantine. Caller updates NeighborhoodState
// after each Applier run using this helper.
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
      const until = new Date(
        now.getTime() + ALPHA_CONFIG.cooldown.quarantineDays * 24 * 60 * 60 * 1000,
      );
      next.quarantined_until = until.toISOString();
    }
  } else if (result.status === 'applied') {
    next.last_apply_at = now.toISOString();
    next.current_cooldown_hours = ALPHA_CONFIG.cooldown.baseHours;
    next.consecutive_halts_24h = 0;
  }

  return next;
}
