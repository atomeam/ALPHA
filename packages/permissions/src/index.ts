export type SubjectId = `user:${string}` | `app:${string}` | `integration:${string}` | 'kernel';
export type Action = 'read' | 'write' | 'invoke' | 'receive' | 'sync';
export type ResourceUrn = `urn:alpha:${string}`;
export type DenyReason =
  | 'malformed_request'
  | 'unknown_subject'
  | 'missing_grant'
  | 'expired_grant'
  | 'revoked_grant'
  | 'condition_failed';

export interface TrustRequest {
  subject: SubjectId;
  action: Action;
  resource: ResourceUrn;
  context?: Record<string, string | number | boolean | null>;
  requestId: string;
}

export interface DirectGrant {
  kind: 'direct';
  id: string;
  subject: SubjectId;
  action: Action;
  resource: ResourceUrn;
  issuedAt: string;
  expiresAt?: string;
  revokedAt?: string;
  issuer: SubjectId;
}

export interface ScopeGrant {
  kind: 'scope';
  id: string;
  subject: SubjectId;
  actions: Action[];
  resourcePrefix: ResourceUrn;
  issuedAt: string;
  expiresAt?: string;
  revokedAt?: string;
  issuer: SubjectId;
}

export type Grant = DirectGrant | ScopeGrant;

export type TrustDecision =
  | { outcome: 'allow'; grantId: string; decisionId: string; expiresAt?: string }
  | { outcome: 'deny'; reason: DenyReason; decisionId: string };

export interface GrantRegistry {
  subjects: SubjectId[];
  grants: Grant[];
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
 * DelegationGrant is not yet present in the implementation; once added it
 * becomes tier 2 with the same prefix-length ordering as ScopeGrant.
 */
function specificity(grant: Grant): [number, number] {
  if (grant.kind === 'direct') return [0, 0];
  return [1, -grant.resourcePrefix.length];
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

export function checkTrust(
  value: unknown,
  registry: GrantRegistry,
  now: Date = new Date(),
): TrustDecision {
  if (!isTrustRequest(value)) {
    return { outcome: 'deny', reason: 'malformed_request', decisionId: 'malformed:deny' };
  }

  if (!registry.subjects.includes(value.subject)) {
    return { outcome: 'deny', reason: 'unknown_subject', decisionId: decisionId(value, 'unknown') };
  }

  // Per docs/TRUST.md §3.3 stage 3: filter expired/revoked grants out before
  // matching, then evaluate surviving candidates in the deterministic order
  // (specificity tier → issuedAt desc → id asc) and take the first match.
  const liveMatches = registry.grants
    .filter((candidate) => !candidate.revokedAt && !isExpired(candidate, now))
    .filter((candidate) => grantMatches(candidate, value))
    .sort(compareGrants);

  const [winner] = liveMatches;
  if (winner) {
    return {
      outcome: 'allow',
      grantId: winner.id,
      decisionId: decisionId(value, 'allow'),
      expiresAt: winner.expiresAt,
    };
  }

  // No live match. Surface the most specific deny reason by re-checking the
  // unfiltered candidate set: revoked outranks expired outranks missing.
  const anyMatches = registry.grants.filter((candidate) => grantMatches(candidate, value));
  if (anyMatches.some((candidate) => !!candidate.revokedAt)) {
    return { outcome: 'deny', reason: 'revoked_grant', decisionId: decisionId(value, 'revoked') };
  }
  if (anyMatches.some((candidate) => isExpired(candidate, now))) {
    return { outcome: 'deny', reason: 'expired_grant', decisionId: decisionId(value, 'expired') };
  }
  return { outcome: 'deny', reason: 'missing_grant', decisionId: decisionId(value, 'missing') };
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
