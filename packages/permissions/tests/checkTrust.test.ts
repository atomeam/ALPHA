import { describe, expect, it } from 'vitest';
import {
  checkTrust,
  type DirectGrant,
  type GrantRegistry,
  type ScopeGrant,
  type TrustRequest,
} from '../src/index';

const subjects = ['app:backend' as const];

function request(overrides: Partial<TrustRequest> = {}): TrustRequest {
  return {
    subject: 'app:backend',
    action: 'invoke',
    resource: 'urn:alpha:integration:gemini',
    requestId: 'req-1',
    ...overrides,
  };
}

function directGrant(overrides: Partial<DirectGrant> = {}): DirectGrant {
  return {
    kind: 'direct',
    id: 'grant-direct',
    subject: 'app:backend',
    action: 'invoke',
    resource: 'urn:alpha:integration:gemini',
    issuedAt: '2026-01-01T00:00:00.000Z',
    issuer: 'kernel',
    ...overrides,
  };
}

function scopeGrant(overrides: Partial<ScopeGrant> = {}): ScopeGrant {
  return {
    kind: 'scope',
    id: 'grant-scope',
    subject: 'app:backend',
    actions: ['invoke'],
    resourcePrefix: 'urn:alpha:integration:',
    issuedAt: '2026-01-01T00:00:00.000Z',
    issuer: 'kernel',
    ...overrides,
  };
}

describe('checkTrust — deterministic match ordering (docs/TRUST.md §3.3)', () => {
  it('returns allow when a single live grant matches', () => {
    const registry: GrantRegistry = { subjects, grants: [scopeGrant()] };
    const decision = checkTrust(request(), registry);
    expect(decision.outcome).toBe('allow');
    if (decision.outcome === 'allow') expect(decision.grantId).toBe('grant-scope');
  });

  it('skips an expired grant and allows the request when a live grant also matches', () => {
    // The original bug: an expired grant appearing before a valid one would
    // produce expired_grant. The spec — and now the implementation — say the
    // expired grant must be filtered out before matching.
    const registry: GrantRegistry = {
      subjects,
      grants: [
        scopeGrant({ id: 'grant-expired', expiresAt: '2026-01-02T00:00:00.000Z' }),
        scopeGrant({ id: 'grant-live', issuedAt: '2026-03-01T00:00:00.000Z' }),
      ],
    };
    const decision = checkTrust(request(), registry, new Date('2026-04-01T00:00:00.000Z'));
    expect(decision.outcome).toBe('allow');
    if (decision.outcome === 'allow') expect(decision.grantId).toBe('grant-live');
  });

  it('skips a revoked grant and allows the request when a live grant also matches', () => {
    const registry: GrantRegistry = {
      subjects,
      grants: [
        scopeGrant({ id: 'grant-revoked', revokedAt: '2026-02-01T00:00:00.000Z' }),
        scopeGrant({ id: 'grant-live' }),
      ],
    };
    const decision = checkTrust(request(), registry, new Date('2026-04-01T00:00:00.000Z'));
    expect(decision.outcome).toBe('allow');
    if (decision.outcome === 'allow') expect(decision.grantId).toBe('grant-live');
  });

  it('prefers a DirectGrant over a ScopeGrant when both match', () => {
    const registry: GrantRegistry = {
      subjects,
      grants: [
        scopeGrant({ id: 'grant-scope-broad', resourcePrefix: 'urn:alpha:' }),
        directGrant({ id: 'grant-direct-exact' }),
      ],
    };
    const decision = checkTrust(request(), registry, new Date('2026-04-01T00:00:00.000Z'));
    expect(decision.outcome).toBe('allow');
    if (decision.outcome === 'allow') expect(decision.grantId).toBe('grant-direct-exact');
  });

  it('within ScopeGrants, prefers the longest matching resourcePrefix', () => {
    const registry: GrantRegistry = {
      subjects,
      grants: [
        scopeGrant({ id: 'grant-broad', resourcePrefix: 'urn:alpha:' }),
        scopeGrant({ id: 'grant-narrow', resourcePrefix: 'urn:alpha:integration:' }),
      ],
    };
    const decision = checkTrust(request(), registry, new Date('2026-04-01T00:00:00.000Z'));
    expect(decision.outcome).toBe('allow');
    if (decision.outcome === 'allow') expect(decision.grantId).toBe('grant-narrow');
  });

  it('within the same specificity tier, newer issuedAt wins', () => {
    const registry: GrantRegistry = {
      subjects,
      grants: [
        scopeGrant({ id: 'grant-old', issuedAt: '2026-01-01T00:00:00.000Z' }),
        scopeGrant({ id: 'grant-new', issuedAt: '2026-03-01T00:00:00.000Z' }),
      ],
    };
    const decision = checkTrust(request(), registry, new Date('2026-04-01T00:00:00.000Z'));
    expect(decision.outcome).toBe('allow');
    if (decision.outcome === 'allow') expect(decision.grantId).toBe('grant-new');
  });

  it('within identical specificity and issuedAt, smaller id wins (final tie-breaker)', () => {
    const registry: GrantRegistry = {
      subjects,
      grants: [scopeGrant({ id: 'grant-b' }), scopeGrant({ id: 'grant-a' })],
    };
    const decision = checkTrust(request(), registry, new Date('2026-04-01T00:00:00.000Z'));
    expect(decision.outcome).toBe('allow');
    if (decision.outcome === 'allow') expect(decision.grantId).toBe('grant-a');
  });

  it('returns expired_grant when the only matching grants are expired', () => {
    const registry: GrantRegistry = {
      subjects,
      grants: [scopeGrant({ id: 'grant-expired', expiresAt: '2026-01-02T00:00:00.000Z' })],
    };
    const decision = checkTrust(request(), registry, new Date('2026-04-01T00:00:00.000Z'));
    expect(decision.outcome).toBe('deny');
    if (decision.outcome === 'deny') expect(decision.reason).toBe('expired_grant');
  });

  it('returns revoked_grant when the only matching grants are revoked', () => {
    const registry: GrantRegistry = {
      subjects,
      grants: [scopeGrant({ id: 'grant-revoked', revokedAt: '2026-02-01T00:00:00.000Z' })],
    };
    const decision = checkTrust(request(), registry, new Date('2026-04-01T00:00:00.000Z'));
    expect(decision.outcome).toBe('deny');
    if (decision.outcome === 'deny') expect(decision.reason).toBe('revoked_grant');
  });

  it('prefers revoked_grant over expired_grant when both states are present', () => {
    const registry: GrantRegistry = {
      subjects,
      grants: [
        scopeGrant({ id: 'grant-expired', expiresAt: '2026-01-02T00:00:00.000Z' }),
        scopeGrant({ id: 'grant-revoked', revokedAt: '2026-02-01T00:00:00.000Z' }),
      ],
    };
    const decision = checkTrust(request(), registry, new Date('2026-04-01T00:00:00.000Z'));
    expect(decision.outcome).toBe('deny');
    if (decision.outcome === 'deny') expect(decision.reason).toBe('revoked_grant');
  });

  it('returns missing_grant when no grant covers the request', () => {
    const registry: GrantRegistry = { subjects, grants: [] };
    const decision = checkTrust(request(), registry);
    expect(decision.outcome).toBe('deny');
    if (decision.outcome === 'deny') expect(decision.reason).toBe('missing_grant');
  });

  it('returns malformed_request when the request shape is invalid', () => {
    const registry: GrantRegistry = { subjects, grants: [] };
    const decision = checkTrust({ not: 'a-request' }, registry);
    expect(decision.outcome).toBe('deny');
    if (decision.outcome === 'deny') expect(decision.reason).toBe('malformed_request');
  });

  it('returns unknown_subject when the subject is not registered', () => {
    const registry: GrantRegistry = { subjects, grants: [scopeGrant()] };
    const decision = checkTrust(
      request({ subject: 'app:unknown' as TrustRequest['subject'] }),
      registry,
    );
    expect(decision.outcome).toBe('deny');
    if (decision.outcome === 'deny') expect(decision.reason).toBe('unknown_subject');
  });
});
