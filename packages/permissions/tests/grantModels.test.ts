import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  checkTrust,
  ephemeralSigningPayload,
  issueEphemeralGrant,
  verifyEphemeralGrant,
  TRUST_EPHEMERAL_TTL_MS,
  type DelegationGrant,
  type EphemeralGrant,
  type GrantRegistry,
  type ScopeGrant,
  type SubjectId,
  type TrustRequest,
} from '../src/index';

const subjects: SubjectId[] = ['app:backend', 'integration:linear', 'user:42'];

function request(overrides: Partial<TrustRequest> = {}): TrustRequest {
  return {
    subject: 'app:backend',
    action: 'invoke',
    resource: 'urn:alpha:integration:gemini',
    requestId: 'req-1',
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

function delegationGrant(overrides: Partial<DelegationGrant> = {}): DelegationGrant {
  return {
    kind: 'delegation',
    id: 'grant-delegation',
    delegate: 'integration:linear',
    onBehalfOf: 'app:backend',
    actions: ['invoke'],
    resourcePrefix: 'urn:alpha:integration:',
    issuedAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2027-01-01T00:00:00.000Z',
    issuer: 'kernel',
    ...overrides,
  };
}

const NOW = new Date('2026-06-01T00:00:00.000Z');

describe('conditions (docs/TRUST.md §4.5, pipeline stage 4)', () => {
  it('allows when a time_window condition covers now', () => {
    const registry: GrantRegistry = {
      subjects,
      grants: [
        scopeGrant({
          conditions: [
            {
              type: 'time_window',
              notBefore: '2026-05-01T00:00:00.000Z',
              notAfter: '2026-07-01T00:00:00.000Z',
            },
          ],
        }),
      ],
    };
    expect(checkTrust(request(), registry, { now: NOW }).outcome).toBe('allow');
  });

  it('denies with condition_failed when outside the time_window', () => {
    const registry: GrantRegistry = {
      subjects,
      grants: [
        scopeGrant({
          conditions: [
            {
              type: 'time_window',
              notBefore: '2026-07-01T00:00:00.000Z',
              notAfter: '2026-08-01T00:00:00.000Z',
            },
          ],
        }),
      ],
    };
    const decision = checkTrust(request(), registry, { now: NOW });
    expect(decision.outcome).toBe('deny');
    if (decision.outcome === 'deny') expect(decision.reason).toBe('condition_failed');
  });

  it('enforces context_equals against the request context', () => {
    const registry: GrantRegistry = {
      subjects,
      grants: [scopeGrant({ conditions: [{ type: 'context_equals', key: 'env', value: 'prod' }] })],
    };
    expect(checkTrust(request({ context: { env: 'prod' } }), registry, { now: NOW }).outcome).toBe(
      'allow',
    );
    const denied = checkTrust(request({ context: { env: 'dev' } }), registry, { now: NOW });
    expect(denied.outcome).toBe('deny');
    if (denied.outcome === 'deny') expect(denied.reason).toBe('condition_failed');
  });

  it('enforces context_one_of membership', () => {
    const registry: GrantRegistry = {
      subjects,
      grants: [
        scopeGrant({
          conditions: [{ type: 'context_one_of', key: 'region', values: ['us', 'eu'] }],
        }),
      ],
    };
    expect(checkTrust(request({ context: { region: 'eu' } }), registry, { now: NOW }).outcome).toBe(
      'allow',
    );
    expect(
      checkTrust(request({ context: { region: 'apac' } }), registry, { now: NOW }).outcome,
    ).toBe('deny');
  });

  it('requires_mfa demands context.mfa === true', () => {
    const registry: GrantRegistry = {
      subjects,
      grants: [scopeGrant({ conditions: [{ type: 'requires_mfa' }] })],
    };
    expect(checkTrust(request({ context: { mfa: true } }), registry, { now: NOW }).outcome).toBe(
      'allow',
    );
    expect(checkTrust(request(), registry, { now: NOW }).outcome).toBe('deny');
  });

  it('rate_limit allows under the cap and denies at the cap', () => {
    const registry: GrantRegistry = {
      subjects,
      grants: [scopeGrant({ conditions: [{ type: 'rate_limit', max: 2, windowMs: 60_000 }] })],
    };
    expect(checkTrust(request(), registry, { now: NOW, countDecisions: () => 1 }).outcome).toBe(
      'allow',
    );
    const denied = checkTrust(request(), registry, { now: NOW, countDecisions: () => 2 });
    expect(denied.outcome).toBe('deny');
    if (denied.outcome === 'deny') expect(denied.reason).toBe('condition_failed');
  });

  it('rate_limit fails closed when no counter is provided', () => {
    const registry: GrantRegistry = {
      subjects,
      grants: [scopeGrant({ conditions: [{ type: 'rate_limit', max: 2, windowMs: 60_000 }] })],
    };
    const denied = checkTrust(request(), registry, { now: NOW });
    expect(denied.outcome).toBe('deny');
    if (denied.outcome === 'deny') expect(denied.reason).toBe('condition_failed');
  });
});

describe('DelegationGrant (docs/TRUST.md §4.3)', () => {
  it('allows the delegate when the principal could act themselves', () => {
    const registry: GrantRegistry = {
      subjects,
      grants: [scopeGrant(), delegationGrant()],
    };
    const decision = checkTrust(request({ subject: 'integration:linear' }), registry, {
      now: NOW,
    });
    expect(decision.outcome).toBe('allow');
    if (decision.outcome === 'allow') expect(decision.grantId).toBe('grant-delegation');
  });

  it('denies the delegate when the principal lacks the underlying grant', () => {
    const registry: GrantRegistry = {
      subjects,
      grants: [delegationGrant()],
    };
    const decision = checkTrust(request({ subject: 'integration:linear' }), registry, {
      now: NOW,
    });
    expect(decision.outcome).toBe('deny');
    if (decision.outcome === 'deny') expect(decision.reason).toBe('missing_grant');
  });

  it('cannot expand authority beyond the principal action set', () => {
    const registry: GrantRegistry = {
      subjects,
      grants: [scopeGrant({ actions: ['read'] }), delegationGrant({ actions: ['invoke'] })],
    };
    const decision = checkTrust(request({ subject: 'integration:linear' }), registry, {
      now: NOW,
    });
    expect(decision.outcome).toBe('deny');
  });

  it('ranks below direct and scope grants in the specificity ordering', () => {
    const registry: GrantRegistry = {
      subjects,
      grants: [
        delegationGrant({ delegate: 'app:backend', onBehalfOf: 'user:42' }),
        scopeGrant({ id: 'grant-scope-own' }),
      ],
    };
    const decision = checkTrust(request(), registry, { now: NOW });
    expect(decision.outcome).toBe('allow');
    if (decision.outcome === 'allow') expect(decision.grantId).toBe('grant-scope-own');
  });

  it('does not recurse infinitely on circular delegations', () => {
    const registry: GrantRegistry = {
      subjects,
      grants: [
        delegationGrant({ id: 'd1', delegate: 'integration:linear', onBehalfOf: 'user:42' }),
        delegationGrant({ id: 'd2', delegate: 'user:42', onBehalfOf: 'integration:linear' }),
      ],
    };
    const decision = checkTrust(request({ subject: 'integration:linear' }), registry, {
      now: NOW,
    });
    expect(decision.outcome).toBe('deny');
  });
});

describe('EphemeralGrant (docs/TRUST.md §4.4 + §5)', () => {
  const KEY = 'test-signing-key';
  const sign = (payload: string) => createHmac('sha256', KEY).update(payload).digest('hex');
  const verify = (payload: string, signature: string) => sign(payload) === signature;

  function issued(): { grant: EphemeralGrant; req: TrustRequest } {
    const req = request();
    const registry: GrantRegistry = { subjects, grants: [scopeGrant()] };
    const decision = checkTrust(req, registry, { now: NOW });
    const grant = issueEphemeralGrant(req, decision, { sign, now: NOW });
    if (!grant) throw new Error('expected grant');
    return { grant, req };
  }

  it('mints a signed grant from an allow decision and round-trips verification', () => {
    const { grant, req } = issued();
    expect(grant.issuer).toBe('kernel');
    expect(grant.rootDecisionId).toBe('req-1:allow');
    const verdict = verifyEphemeralGrant(grant, req, { verify, now: NOW });
    expect(verdict.outcome).toBe('allow');
  });

  it('refuses to mint from a deny decision', () => {
    const req = request();
    const denied = checkTrust(req, { subjects, grants: [] }, { now: NOW });
    expect(issueEphemeralGrant(req, denied, { sign, now: NOW })).toBeNull();
  });

  it('clamps the TTL to TRUST_EPHEMERAL_TTL_MS', () => {
    const { grant } = issued();
    expect(new Date(grant.expiresAt).getTime() - NOW.getTime()).toBeLessThanOrEqual(
      TRUST_EPHEMERAL_TTL_MS,
    );
    const req = request();
    const registry: GrantRegistry = { subjects, grants: [scopeGrant()] };
    const decision = checkTrust(req, registry, { now: NOW });
    const longLived = issueEphemeralGrant(req, decision, { sign, now: NOW, ttlMs: 10_000_000 });
    expect(longLived).not.toBeNull();
    if (longLived) {
      expect(new Date(longLived.expiresAt).getTime() - NOW.getTime()).toBe(TRUST_EPHEMERAL_TTL_MS);
    }
  });

  it('denies with invalid_ephemeral when expired', () => {
    const { grant, req } = issued();
    const later = new Date(NOW.getTime() + TRUST_EPHEMERAL_TTL_MS + 1);
    const verdict = verifyEphemeralGrant(grant, req, { verify, now: later });
    expect(verdict.outcome).toBe('deny');
    if (verdict.outcome === 'deny') expect(verdict.reason).toBe('invalid_ephemeral');
  });

  it('denies with invalid_ephemeral when the signature does not match', () => {
    const { grant, req } = issued();
    const tampered = { ...grant, resource: 'urn:alpha:integration:ollama' as const };
    const verdict = verifyEphemeralGrant(tampered, request(), { verify, now: NOW });
    expect(verdict.outcome).toBe('deny');
    const reqMismatch = verifyEphemeralGrant(
      grant,
      { ...req, action: 'write' },
      {
        verify,
        now: NOW,
      },
    );
    expect(reqMismatch.outcome).toBe('deny');
  });

  it('produces a stable canonical signing payload', () => {
    const { grant } = issued();
    const { signature: _signature, ...unsigned } = grant;
    expect(sign(ephemeralSigningPayload(unsigned))).toBe(grant.signature);
  });
});
