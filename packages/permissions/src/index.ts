export type SubjectId = `user:${string}` | `app:${string}` | `integration:${string}` | 'kernel';
export type Action = 'read' | 'write' | 'invoke' | 'receive' | 'sync';
export type ResourceUrn = `urn:alpha:${string}`;
export type DenyReason =
  | 'malformed_request'
  | 'unknown_subject'
  | 'missing_grant'
  | 'expired_grant'
  | 'revoked_grant'
  | 'condition_failed'
  | 'invalid_ephemeral';

export interface TrustRequest {
  subject: SubjectId;
  action: Action;
  resource: ResourceUrn;
  context?: Record<string, string | number | boolean | null>;
  requestId: string;
}

/** Closed enum of typed predicates per docs/TRUST.md §4.5, evaluated in pipeline stage 4. */
export type Condition =
  | { type: 'time_window'; notBefore: string; notAfter: string }
  | { type: 'rate_limit'; max: number; windowMs: number }
  | { type: 'context_equals'; key: string; value: string | number | boolean | null }
  | { type: 'context_one_of'; key: string; values: (string | number | boolean | null)[] }
  | { type: 'requires_mfa' };

export interface DirectGrant {
  kind: 'direct';
  id: string;
  subject: SubjectId;
  action: Action;
  resource: ResourceUrn;
  conditions?: Condition[];
  issuedAt: string;
  expiresAt?: string;
  revokedAt?: string;
  issuer: SubjectId;
  signature?: string;
}

export interface ScopeGrant {
  kind: 'scope';
  id: string;
  subject: SubjectId;
  actions: Action[];
  resourcePrefix: ResourceUrn;
  conditions?: Condition[];
  issuedAt: string;
  expiresAt?: string;
  revokedAt?: string;
  issuer: SubjectId;
  signature?: string;
}

/**
 * Capability handoff per docs/TRUST.md §4.3: `delegate` may act on behalf of
 * `onBehalfOf` for a narrow scope. The kernel re-runs the check for
 * `onBehalfOf`, so delegation can only narrow authority, never expand it.
 */
export interface DelegationGrant {
  kind: 'delegation';
  id: string;
  delegate: SubjectId;
  onBehalfOf: SubjectId;
  actions: Action[];
  resourcePrefix: ResourceUrn;
  conditions?: Condition[];
  issuedAt: string;
  expiresAt: string;
  revokedAt?: string;
  issuer: SubjectId;
  signature?: string;
}

/**
 * Request-scoped bearer grant per docs/TRUST.md §4.4. Only the kernel mints
 * these (via `issueEphemeralGrant`); they are never matched against the
 * registry and are verified directly via `verifyEphemeralGrant`.
 */
export interface EphemeralGrant {
  kind: 'ephemeral';
  id: string;
  subject: SubjectId;
  action: Action;
  resource: ResourceUrn;
  rootDecisionId: string;
  issuedAt: string;
  expiresAt: string;
  issuer: 'kernel';
  signature: string;
}

export type Grant = DirectGrant | ScopeGrant | DelegationGrant;

export type TrustDecision =
  | { outcome: 'allow'; grantId: string; decisionId: string; expiresAt?: string }
  | { outcome: 'deny'; reason: DenyReason; decisionId: string };

export interface GrantRegistry {
  subjects: SubjectId[];
  grants: Grant[];
}

/** Default TTL for kernel-minted ephemeral grants (docs/TRUST.md §4.4). */
export const TRUST_EPHEMERAL_TTL_MS = 60_000;

export interface CheckTrustOptions {
  now?: Date;
  /**
   * Counter backing `rate_limit` conditions: returns how many allow decisions
   * already matched the grant within the window. When absent, any grant with a
   * `rate_limit` condition fails closed (`condition_failed`).
   */
  countDecisions?: (grantId: string, windowMs: number) => number;
}

function decisionId(request: Pick<TrustRequest, 'requestId'>, suffix: string): string {
  return `${request.requestId}:${suffix}`;
}

function isTrustRequest(value: unknown): value is TrustRequest {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<Record<keyof TrustRequest, unknown>>;
  return (
    typeof record.subject === 'string' &&
    typeof record.action === 'string' &&
    typeof record.resource === 'string' &&
    typeof record.requestId === 'string' &&
    record.resource.startsWith('urn:alpha:')
  );
}

function grantMatches(grant: Grant, request: TrustRequest): boolean {
  if (grant.kind === 'delegation') {
    return (
      grant.delegate === request.subject &&
      grant.actions.includes(request.action) &&
      request.resource.startsWith(grant.resourcePrefix)
    );
  }
  if (grant.subject !== request.subject) return false;
  if (grant.kind === 'direct') {
    return grant.action === request.action && grant.resource === request.resource;
  }
  return (
    grant.actions.includes(request.action) && request.resource.startsWith(grant.resourcePrefix)
  );
}

function isExpired(grant: Grant, now: Date): boolean {
  return !!grant.expiresAt && new Date(grant.expiresAt).getTime() <= now.getTime();
}

/**
 * Sort key implementing docs/TRUST.md §3.3 stage 3 ordering. Smaller sort values
 * sort first. Tiers:
 *   tier 0: DirectGrant (exact resource match — most specific)
 *   tier 1: ScopeGrant, ordered by descending resourcePrefix length so the
 *           longest matching prefix wins within the tier.
 *   tier 2: DelegationGrant, same prefix-length ordering as ScopeGrant.
 */
function specificity(grant: Grant): [number, number] {
  if (grant.kind === 'direct') return [0, 0];
  if (grant.kind === 'scope') return [1, -grant.resourcePrefix.length];
  return [2, -grant.resourcePrefix.length];
}

function compareGrants(a: Grant, b: Grant): number {
  const [aTier, aSub] = specificity(a);
  const [bTier, bSub] = specificity(b);
  if (aTier !== bTier) return aTier - bTier;
  if (aSub !== bSub) return aSub - bSub;
  // issuedAt descending: newer grant of the same shape overrides older.
  if (a.issuedAt !== b.issuedAt) return a.issuedAt < b.issuedAt ? 1 : -1;
  // id ascending as final tie-breaker.
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

function conditionsPass(grant: Grant, request: TrustRequest, options: CheckTrustOptions): boolean {
  for (const condition of grant.conditions ?? []) {
    switch (condition.type) {
      case 'time_window': {
        const now = (options.now ?? new Date()).getTime();
        if (now < new Date(condition.notBefore).getTime()) return false;
        if (now > new Date(condition.notAfter).getTime()) return false;
        break;
      }
      case 'rate_limit': {
        if (!options.countDecisions) return false;
        if (options.countDecisions(grant.id, condition.windowMs) >= condition.max) return false;
        break;
      }
      case 'context_equals': {
        if (request.context?.[condition.key] !== condition.value) return false;
        break;
      }
      case 'context_one_of': {
        const actual = request.context?.[condition.key];
        if (actual === undefined || !condition.values.includes(actual)) return false;
        break;
      }
      case 'requires_mfa': {
        if (request.context?.mfa !== true) return false;
        break;
      }
    }
  }
  return true;
}

const MAX_DELEGATION_DEPTH = 4;

function evaluate(
  request: TrustRequest,
  registry: GrantRegistry,
  options: CheckTrustOptions,
  depth: number,
): TrustDecision {
  const now = options.now ?? new Date();

  if (!registry.subjects.includes(request.subject)) {
    return {
      outcome: 'deny',
      reason: 'unknown_subject',
      decisionId: decisionId(request, 'unknown'),
    };
  }

  // Per docs/TRUST.md §3.3 stage 3: filter expired/revoked grants out before
  // matching, then evaluate surviving candidates in the deterministic order
  // (specificity tier → issuedAt desc → id asc) and take the first match.
  const liveMatches = registry.grants
    .filter((candidate) => !candidate.revokedAt && !isExpired(candidate, now))
    .filter((candidate) => grantMatches(candidate, request))
    .sort(compareGrants);

  const [winner] = liveMatches;
  if (winner) {
    // Stage 4: conditions on the matched grant. A failed condition demotes the
    // decision to deny — it does not fall through to the next candidate.
    if (!conditionsPass(winner, request, options)) {
      return {
        outcome: 'deny',
        reason: 'condition_failed',
        decisionId: decisionId(request, 'condition'),
      };
    }
    if (winner.kind === 'delegation') {
      // §4.3: a delegation only allows what the principal could do themselves.
      if (depth >= MAX_DELEGATION_DEPTH) {
        return {
          outcome: 'deny',
          reason: 'missing_grant',
          decisionId: decisionId(request, 'missing'),
        };
      }
      const principalDecision = evaluate(
        { ...request, subject: winner.onBehalfOf },
        registry,
        options,
        depth + 1,
      );
      if (principalDecision.outcome === 'deny') return principalDecision;
      return {
        outcome: 'allow',
        grantId: winner.id,
        decisionId: decisionId(request, 'allow'),
        expiresAt: winner.expiresAt,
      };
    }
    return {
      outcome: 'allow',
      grantId: winner.id,
      decisionId: decisionId(request, 'allow'),
      expiresAt: winner.expiresAt,
    };
  }

  // No live match. Surface the most specific deny reason by re-checking the
  // unfiltered candidate set: revoked outranks expired outranks missing.
  const anyMatches = registry.grants.filter((candidate) => grantMatches(candidate, request));
  if (anyMatches.some((candidate) => !!candidate.revokedAt)) {
    return { outcome: 'deny', reason: 'revoked_grant', decisionId: decisionId(request, 'revoked') };
  }
  if (anyMatches.some((candidate) => isExpired(candidate, now))) {
    return { outcome: 'deny', reason: 'expired_grant', decisionId: decisionId(request, 'expired') };
  }
  return { outcome: 'deny', reason: 'missing_grant', decisionId: decisionId(request, 'missing') };
}

export function checkTrust(
  value: unknown,
  registry: GrantRegistry,
  nowOrOptions: Date | CheckTrustOptions = new Date(),
): TrustDecision {
  if (!isTrustRequest(value)) {
    return { outcome: 'deny', reason: 'malformed_request', decisionId: 'malformed:deny' };
  }
  const options: CheckTrustOptions =
    nowOrOptions instanceof Date ? { now: nowOrOptions } : nowOrOptions;
  return evaluate(value, registry, options, 0);
}

/** Stable payload signed by the kernel and re-derived during verification. */
export function ephemeralSigningPayload(grant: Omit<EphemeralGrant, 'signature'>): string {
  return [
    grant.id,
    grant.subject,
    grant.action,
    grant.resource,
    grant.rootDecisionId,
    grant.issuedAt,
    grant.expiresAt,
  ].join('|');
}

export interface IssueEphemeralOptions {
  /** Kernel signing function over the canonical payload (e.g. HMAC-SHA256 hex). */
  sign: (payload: string) => string;
  now?: Date;
  /** TTL in ms; clamped to TRUST_EPHEMERAL_TTL_MS (docs/TRUST.md §4.4). */
  ttlMs?: number;
  /** Id generator; defaults to deriving from the root decision id. */
  grantId?: string;
}

/**
 * Mint a kernel-issued EphemeralGrant carrying an allow decision across a
 * process boundary (docs/TRUST.md §5 routing contract, step 3).
 */
export function issueEphemeralGrant(
  request: TrustRequest,
  decision: TrustDecision,
  options: IssueEphemeralOptions,
): EphemeralGrant | null {
  if (decision.outcome !== 'allow') return null;
  const now = options.now ?? new Date();
  const ttl = Math.min(options.ttlMs ?? TRUST_EPHEMERAL_TTL_MS, TRUST_EPHEMERAL_TTL_MS);
  const unsigned: Omit<EphemeralGrant, 'signature'> = {
    kind: 'ephemeral',
    id: options.grantId ?? `eph:${decision.decisionId}`,
    subject: request.subject,
    action: request.action,
    resource: request.resource,
    rootDecisionId: decision.decisionId,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttl).toISOString(),
    issuer: 'kernel',
  };
  return { ...unsigned, signature: options.sign(ephemeralSigningPayload(unsigned)) };
}

export interface VerifyEphemeralOptions {
  /** Verifier over the canonical payload; typically re-signs and compares. */
  verify: (payload: string, signature: string) => boolean;
  now?: Date;
}

/**
 * Verify a presented EphemeralGrant against the kernel signing key (docs/TRUST.md
 * §5, step 4). Returns allow when the grant is live and authentically signed,
 * otherwise deny with `invalid_ephemeral`.
 */
export function verifyEphemeralGrant(
  grant: EphemeralGrant,
  request: TrustRequest,
  options: VerifyEphemeralOptions,
): TrustDecision {
  const now = options.now ?? new Date();
  const deny: TrustDecision = {
    outcome: 'deny',
    reason: 'invalid_ephemeral',
    decisionId: decisionId(request, 'ephemeral'),
  };
  if (grant.kind !== 'ephemeral' || grant.issuer !== 'kernel') return deny;
  if (
    grant.subject !== request.subject ||
    grant.action !== request.action ||
    grant.resource !== request.resource
  ) {
    return deny;
  }
  if (new Date(grant.expiresAt).getTime() <= now.getTime()) return deny;
  const { signature, ...unsigned } = grant;
  if (!options.verify(ephemeralSigningPayload(unsigned), signature)) return deny;
  return {
    outcome: 'allow',
    grantId: grant.id,
    decisionId: decisionId(request, 'allow'),
    expiresAt: grant.expiresAt,
  };
}

export function bootstrapGrantRegistry(): GrantRegistry {
  return {
    subjects: ['app:backend', 'integration:gemini', 'integration:ollama', 'integration:retroarch'],
    grants: [
      {
        kind: 'scope',
        id: 'grant-backend-integrations-read',
        subject: 'app:backend',
        actions: ['read', 'invoke', 'receive'],
        resourcePrefix: 'urn:alpha:integration:',
        issuedAt: '2026-05-18T00:00:00.000Z',
        issuer: 'kernel',
      },
    ],
  };
}
