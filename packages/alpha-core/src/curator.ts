import { ALPHA_CONFIG } from './config';
import type { CuratorDecision, Lesson, NeighborhoodState, Proposal } from './types';

export interface CuratorContext {
  lessons: Lesson[];
  neighborhood: NeighborhoodState;
  amplitudeMetricsAvailable: Set<string>;
  now: Date;
}

export function evaluateProposal(proposal: Proposal, ctx: CuratorContext): CuratorDecision {
  const blockedLesson = ctx.lessons.find(
    (lesson) => lesson.signature === proposal.inputs_hash && lesson.tag === 'do-not-repeat',
  );

  if (blockedLesson) {
    return {
      approved: false,
      code: 'CUR_DO_NOT_REPEAT',
      message: `Blocked by lesson ${blockedLesson.id}: ${blockedLesson.generalization}`,
    };
  }

  if (!proposal.citations.length || proposal.citations.some((citation) => !citation.id)) {
    return { approved: false, code: 'CUR_BAD_CITATION' };
  }

  if (!proposal.rollback_steps.length) {
    return { approved: false, code: 'CUR_NO_ROLLBACK' };
  }

  if (!ctx.amplitudeMetricsAvailable.has(proposal.expected_effect.metric)) {
    return { approved: false, code: 'CUR_UNMEASURABLE' };
  }

  if (proposal.risk_class !== 'low' && !proposal.operator_cosign) {
    return { approved: false, code: 'CUR_NEEDS_OPERATOR' };
  }

  if (ctx.neighborhood.last_apply_at) {
    const lastApplyAt = new Date(ctx.neighborhood.last_apply_at).getTime();
    const cooldownMs = ctx.neighborhood.current_cooldown_hours * 60 * 60 * 1000;

    if (ctx.now.getTime() - lastApplyAt < cooldownMs) {
      return {
        approved: false,
        code: 'CUR_COOLDOWN',
        cooldown_until: new Date(lastApplyAt + cooldownMs).toISOString(),
      };
    }
  }

  if (
    ctx.neighborhood.quarantined_until &&
    new Date(ctx.neighborhood.quarantined_until) > ctx.now
  ) {
    return {
      approved: false,
      code: 'CUR_COOLDOWN',
      cooldown_until: ctx.neighborhood.quarantined_until,
      message: 'Neighborhood is quarantined.',
    };
  }

  if (!proposal.idempotent && !proposal.idempotency_guard) {
    return { approved: false, code: 'CUR_NOT_IDEMPOTENT' };
  }

  void ALPHA_CONFIG;

  return { approved: true };
}
