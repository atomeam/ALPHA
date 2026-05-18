// Alpha v0 — Curator default-deny gate.
// Enforces the 5 base conditions in ALPHA.md plus cooldown + idempotency.
// Pure functions: no side effects, no network.

import { ALPHA_CONFIG } from './config';
import type { CuratorDecision, Lesson, NeighborhoodState, Proposal, RiskClass } from './types';

export interface CuratorContext {
  lessons: Lesson[];
  neighborhood: NeighborhoodState;
  amplitudeMetricsAvailable: Set<string>;
  now: Date;
}

const riskRank: Record<RiskClass, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function parseIsoMs(value: string): number | undefined {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function riskRequiresOperator(risk: RiskClass): boolean {
  const threshold = ALPHA_CONFIG.curator.requireOperatorForRiskAtOrAbove;
  return riskRank[risk] >= riskRank[threshold];
}

export function evaluateProposal(proposal: Proposal, ctx: CuratorContext): CuratorDecision {
  // 1. do-not-repeat
  const blockedLesson = ctx.lessons.find(
    (l) => l.signature === proposal.inputs_hash && l.tag === 'do-not-repeat',
  );
  if (blockedLesson) {
    return {
      approved: false,
      code: 'CUR_DO_NOT_REPEAT',
      message: `Blocked by lesson ${blockedLesson.id}: ${blockedLesson.generalization}`,
    };
  }

  // 2. citations resolve
  if (!proposal.citations.length || proposal.citations.some((c) => !c.id)) {
    return { approved: false, code: 'CUR_BAD_CITATION' };
  }

  // 3. rollback is concrete
  if (!proposal.rollback_steps.length) {
    return { approved: false, code: 'CUR_NO_ROLLBACK' };
  }

  // 4. expected_effect is measurable
  if (!ctx.amplitudeMetricsAvailable.has(proposal.expected_effect.metric)) {
    return { approved: false, code: 'CUR_UNMEASURABLE' };
  }

  // 5. risk gate
  if (riskRequiresOperator(proposal.risk_class) && !proposal.operator_cosign) {
    return { approved: false, code: 'CUR_NEEDS_OPERATOR' };
  }

  // Cooldown check (hardening rule 2)
  if (ctx.neighborhood.last_apply_at) {
    const last = parseIsoMs(ctx.neighborhood.last_apply_at);
    if (last === undefined) {
      return { approved: false, code: 'CUR_COOLDOWN', message: 'Invalid cooldown timestamp.' };
    }

    const cooldownMs = ctx.neighborhood.current_cooldown_hours * 60 * 60 * 1000;
    if (ctx.now.getTime() - last < cooldownMs) {
      const until = new Date(last + cooldownMs).toISOString();
      return { approved: false, code: 'CUR_COOLDOWN', cooldown_until: until };
    }
  }

  // Quarantine check (hardening rule 6)
  if (ctx.neighborhood.quarantined_until) {
    const quarantinedUntil = parseIsoMs(ctx.neighborhood.quarantined_until);
    if (quarantinedUntil === undefined) {
      return { approved: false, code: 'CUR_COOLDOWN', message: 'Invalid quarantine timestamp.' };
    }

    if (quarantinedUntil > ctx.now.getTime()) {
      return {
        approved: false,
        code: 'CUR_COOLDOWN',
        cooldown_until: ctx.neighborhood.quarantined_until,
        message: 'Neighborhood is quarantined.',
      };
    }
  }

  // Idempotency check (hardening rule 8)
  if (!proposal.idempotent && !proposal.idempotency_guard) {
    return { approved: false, code: 'CUR_NOT_IDEMPOTENT' };
  }

  return { approved: true };
}
