import type {
  Lesson,
  NeighborhoodState,
  Proposal,
  ProposalClassification,
  RiskClass,
} from '@alpha/alpha-core';

interface JsonRecord {
  [key: string]: unknown;
}

const riskClasses = new Set<RiskClass>(['low', 'medium', 'high']);
const classifications = new Set<ProposalClassification>([
  'config-change',
  'lesson',
  'runbook-prune',
]);

export function parseProposal(input: unknown): Proposal | null {
  const proposal = unwrapProposal(input);

  if (!proposal) {
    return null;
  }

  const expectedEffect = proposal.expected_effect;

  if (
    !isRecord(expectedEffect) ||
    typeof proposal.id !== 'string' ||
    typeof proposal.title !== 'string' ||
    typeof proposal.inputs_hash !== 'string' ||
    typeof proposal.change_summary !== 'string' ||
    !isStringArray(proposal.files_or_pages_touched) ||
    typeof expectedEffect.metric !== 'string' ||
    !isEffectDirection(expectedEffect.direction) ||
    typeof expectedEffect.magnitude !== 'number' ||
    typeof expectedEffect.tolerance !== 'number' ||
    !isStringArray(proposal.rollback_steps) ||
    !isRiskClass(proposal.risk_class) ||
    !isCitationArray(proposal.citations) ||
    !isProposalClassification(proposal.classification) ||
    typeof proposal.idempotent !== 'boolean'
  ) {
    return null;
  }

  return {
    id: proposal.id,
    title: proposal.title,
    inputs_hash: proposal.inputs_hash,
    change_summary: proposal.change_summary,
    files_or_pages_touched: proposal.files_or_pages_touched,
    expected_effect: {
      metric: expectedEffect.metric,
      direction: expectedEffect.direction,
      magnitude: expectedEffect.magnitude,
      tolerance: expectedEffect.tolerance,
    },
    rollback_steps: proposal.rollback_steps,
    risk_class: proposal.risk_class,
    requires: isRequiresArray(proposal.requires) ? proposal.requires : ['Curator'],
    citations: proposal.citations,
    classification: proposal.classification,
    idempotent: proposal.idempotent,
    ...(typeof proposal.idempotency_guard === 'string'
      ? { idempotency_guard: proposal.idempotency_guard }
      : {}),
    ...(isOperatorCosign(proposal.operator_cosign)
      ? { operator_cosign: proposal.operator_cosign }
      : {}),
  };
}

export function parseLessons(input: unknown): Lesson[] {
  const body = isRecord(input) ? input : {};

  if (!Array.isArray(body.lessons)) {
    return [];
  }

  return body.lessons.filter(isLesson);
}

export function parseNeighborhood(input: unknown, inputsHash: string): NeighborhoodState {
  const body = isRecord(input) ? input : {};
  const neighborhood = isRecord(body.neighborhood) ? body.neighborhood : {};

  return {
    inputs_hash:
      typeof neighborhood.inputs_hash === 'string' ? neighborhood.inputs_hash : inputsHash,
    last_apply_at:
      typeof neighborhood.last_apply_at === 'string' ? neighborhood.last_apply_at : undefined,
    current_cooldown_hours:
      typeof neighborhood.current_cooldown_hours === 'number'
        ? neighborhood.current_cooldown_hours
        : 6,
    consecutive_halts_24h:
      typeof neighborhood.consecutive_halts_24h === 'number'
        ? neighborhood.consecutive_halts_24h
        : 0,
    quarantined_until:
      typeof neighborhood.quarantined_until === 'string'
        ? neighborhood.quarantined_until
        : undefined,
    seen_before: typeof neighborhood.seen_before === 'boolean' ? neighborhood.seen_before : true,
  };
}

export function parseMetrics(input: unknown, proposal: Proposal): string[] {
  const body = isRecord(input) ? input : {};

  if (isStringArray(body.metrics)) {
    return body.metrics;
  }

  return [proposal.expected_effect.metric];
}

function unwrapProposal(input: unknown): JsonRecord | null {
  if (!isRecord(input)) {
    return null;
  }

  if (isRecord(input.proposal)) {
    return input.proposal;
  }

  return input;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isEffectDirection(value: unknown): value is Proposal['expected_effect']['direction'] {
  return value === 'increase' || value === 'decrease' || value === 'hold';
}

function isRiskClass(value: unknown): value is RiskClass {
  return typeof value === 'string' && riskClasses.has(value as RiskClass);
}

function isProposalClassification(value: unknown): value is ProposalClassification {
  return typeof value === 'string' && classifications.has(value as ProposalClassification);
}

function isRequiresArray(value: unknown): value is Proposal['requires'] {
  return Array.isArray(value) && value.every((item) => item === 'Curator' || item === 'Operator');
}

function isCitationArray(value: unknown): value is Proposal['citations'] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        (item.kind === 'lesson' ||
          item.kind === 'log' ||
          item.kind === 'runbook' ||
          item.kind === 'decision') &&
        typeof item.id === 'string' &&
        (typeof item.url === 'string' || item.url === undefined),
    )
  );
}

function isOperatorCosign(value: unknown): value is NonNullable<Proposal['operator_cosign']> {
  return isRecord(value) && typeof value.user === 'string' && typeof value.at === 'string';
}

function isLesson(value: unknown): value is Lesson {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.signature === 'string' &&
    (value.outcome === 'success' || value.outcome === 'partial' || value.outcome === 'failure') &&
    typeof value.delta_predicted === 'number' &&
    typeof value.delta_actual === 'number' &&
    typeof value.generalization === 'string' &&
    (value.tag === 'keep' ||
      value.tag === 'do-not-repeat' ||
      value.tag === 'needs-operator' ||
      value.tag === 'needs-operator-review') &&
    typeof value.created_at === 'string'
  );
}
