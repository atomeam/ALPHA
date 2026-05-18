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

function grantExpired(grant: Grant, now: Date): boolean {
  return Boolean(grant.expiresAt && new Date(grant.expiresAt).getTime() <= now.getTime());
}

function grantActive(grant: Grant, now: Date): boolean {
  return !grant.revokedAt && !grantExpired(grant, now);
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

  const matchingGrants = registry.grants.filter((candidate) => grantMatches(candidate, value));
  const grant = matchingGrants.find((candidate) => grantActive(candidate, now));
  if (!grant) {
    const unavailableGrant = matchingGrants[0];
    if (!unavailableGrant) {
      return { outcome: 'deny', reason: 'missing_grant', decisionId: decisionId(value, 'missing') };
    }
    if (unavailableGrant.revokedAt) {
      return { outcome: 'deny', reason: 'revoked_grant', decisionId: decisionId(value, 'revoked') };
    }
    if (grantExpired(unavailableGrant, now)) {
      return { outcome: 'deny', reason: 'expired_grant', decisionId: decisionId(value, 'expired') };
    }
    return {
      outcome: 'deny',
      reason: 'condition_failed',
      decisionId: decisionId(value, 'condition'),
    };
  }

  return {
    outcome: 'allow',
    grantId: grant.id,
    decisionId: decisionId(value, 'allow'),
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
