import { describe, expect, it } from 'vitest';
import {
  bootstrapGrantRegistry,
  checkTrust,
  type Grant,
  type GrantRegistry,
  type TrustRequest,
} from '../src/index.js';

const NOW = new Date('2026-05-18T12:00:00.000Z');
const PAST = '2026-05-01T00:00:00.000Z';
const FUTURE = '2027-01-01T00:00:00.000Z';

function req(overrides: Partial<TrustRequest> = {}): TrustRequest {
  return {
    subject: 'app:backend',
    action: 'invoke',
    resource: 'urn:alpha:integration:gemini',
    requestId: 'req-test-1',
    ...overrides,
  };
}

function registry(grants: Grant[]): GrantRegistry {
  return {
    subjects: ['app:backend', 'integration:gemini'],
    grants,
  };
}

describe('checkTrust', () => {
  it('denies malformed_request when the input is not a TrustRequest', () => {
    const decision = checkTrust({ subject: 1 }, registry([]), NOW);
    expect(decision).toEqual({
      outcome: 'deny',
      reason: 'malformed_request',
      decisionId: 'malformed:deny',
    });
  });

  it('denies unknown_subject when the subject is not in the registry', () => {
    const decision = checkTrust(req({ subject: 'app:unknown' }), registry([]), NOW);
    expect(decision.outcome).toBe('deny');
    if (decision.outcome === 'deny') {
      expect(decision.reason).toBe('unknown_subject');
    }
  });

  it('denies missing_grant when no grant matches subject/action/resource', () => {
    const decision = checkTrust(req(), registry([]), NOW);
    expect(decision.outcome).toBe('deny');
    if (decision.outcome === 'deny') {
      expect(decision.reason).toBe('missing_grant');
    }
  });

  it('allows when a single active direct grant matches', () => {
    const decision = checkTrust(
      req(),
      registry([
        {
          kind: 'direct',
          id: 'g-1',
          subject: 'app:backend',
          action: 'invoke',
          resource: 'urn:alpha:integration:gemini',
          issuedAt: PAST,
          issuer: 'kernel',
        },
      ]),
      NOW,
    );
    expect(decision.outcome).toBe('allow');
    if (decision.outcome === 'allow') {
      expect(decision.grantId).toBe('g-1');
    }
  });

  it('allows when a scope grant covers the resource and action', () => {
    const decision = checkTrust(
      req(),
      registry([
        {
          kind: 'scope',
          id: 'g-scope',
          subject: 'app:backend',
          actions: ['invoke', 'read'],
          resourcePrefix: 'urn:alpha:integration:',
          issuedAt: PAST,
          issuer: 'kernel',
        },
      ]),
      NOW,
    );
    expect(decision.outcome).toBe('allow');
    if (decision.outcome === 'allow') {
      expect(decision.grantId).toBe('g-scope');
    }
  });

  it('allows when a revoked grant matches first but a later active grant matches too', () => {
    const decision = checkTrust(
      req(),
      registry([
        {
          kind: 'direct',
          id: 'g-revoked',
          subject: 'app:backend',
          action: 'invoke',
          resource: 'urn:alpha:integration:gemini',
          issuedAt: PAST,
          revokedAt: PAST,
          issuer: 'kernel',
        },
        {
          kind: 'direct',
          id: 'g-active',
          subject: 'app:backend',
          action: 'invoke',
          resource: 'urn:alpha:integration:gemini',
          issuedAt: PAST,
          issuer: 'kernel',
        },
      ]),
      NOW,
    );
    expect(decision.outcome).toBe('allow');
    if (decision.outcome === 'allow') {
      expect(decision.grantId).toBe('g-active');
    }
  });

  it('allows when an expired grant matches first but a later active grant matches too', () => {
    const decision = checkTrust(
      req(),
      registry([
        {
          kind: 'direct',
          id: 'g-expired',
          subject: 'app:backend',
          action: 'invoke',
          resource: 'urn:alpha:integration:gemini',
          issuedAt: PAST,
          expiresAt: PAST,
          issuer: 'kernel',
        },
        {
          kind: 'scope',
          id: 'g-active-scope',
          subject: 'app:backend',
          actions: ['invoke'],
          resourcePrefix: 'urn:alpha:integration:',
          issuedAt: PAST,
          expiresAt: FUTURE,
          issuer: 'kernel',
        },
      ]),
      NOW,
    );
    expect(decision.outcome).toBe('allow');
    if (decision.outcome === 'allow') {
      expect(decision.grantId).toBe('g-active-scope');
      expect(decision.expiresAt).toBe(FUTURE);
    }
  });

  it('denies revoked_grant only when every matching grant is revoked', () => {
    const decision = checkTrust(
      req(),
      registry([
        {
          kind: 'direct',
          id: 'g-revoked-1',
          subject: 'app:backend',
          action: 'invoke',
          resource: 'urn:alpha:integration:gemini',
          issuedAt: PAST,
          revokedAt: PAST,
          issuer: 'kernel',
        },
        {
          kind: 'direct',
          id: 'g-revoked-2',
          subject: 'app:backend',
          action: 'invoke',
          resource: 'urn:alpha:integration:gemini',
          issuedAt: PAST,
          revokedAt: PAST,
          issuer: 'kernel',
        },
      ]),
      NOW,
    );
    expect(decision.outcome).toBe('deny');
    if (decision.outcome === 'deny') {
      expect(decision.reason).toBe('revoked_grant');
    }
  });

  it('denies expired_grant when every matching grant is expired (no revoked rivals)', () => {
    const decision = checkTrust(
      req(),
      registry([
        {
          kind: 'direct',
          id: 'g-expired-1',
          subject: 'app:backend',
          action: 'invoke',
          resource: 'urn:alpha:integration:gemini',
          issuedAt: PAST,
          expiresAt: PAST,
          issuer: 'kernel',
        },
      ]),
      NOW,
    );
    expect(decision.outcome).toBe('deny');
    if (decision.outcome === 'deny') {
      expect(decision.reason).toBe('expired_grant');
    }
  });

  it('prefers expired_grant over revoked_grant when both kinds match and none are active', () => {
    const decision = checkTrust(
      req(),
      registry([
        {
          kind: 'direct',
          id: 'g-revoked',
          subject: 'app:backend',
          action: 'invoke',
          resource: 'urn:alpha:integration:gemini',
          issuedAt: PAST,
          revokedAt: PAST,
          issuer: 'kernel',
        },
        {
          kind: 'direct',
          id: 'g-expired',
          subject: 'app:backend',
          action: 'invoke',
          resource: 'urn:alpha:integration:gemini',
          issuedAt: PAST,
          expiresAt: PAST,
          issuer: 'kernel',
        },
      ]),
      NOW,
    );
    expect(decision.outcome).toBe('deny');
    if (decision.outcome === 'deny') {
      expect(decision.reason).toBe('expired_grant');
    }
  });

  it('treats an expiry exactly equal to now as expired', () => {
    const decision = checkTrust(
      req(),
      registry([
        {
          kind: 'direct',
          id: 'g-boundary',
          subject: 'app:backend',
          action: 'invoke',
          resource: 'urn:alpha:integration:gemini',
          issuedAt: PAST,
          expiresAt: NOW.toISOString(),
          issuer: 'kernel',
        },
      ]),
      NOW,
    );
    expect(decision.outcome).toBe('deny');
    if (decision.outcome === 'deny') {
      expect(decision.reason).toBe('expired_grant');
    }
  });
});

describe('bootstrapGrantRegistry', () => {
  it('allows app:backend to invoke any integration via the bootstrap scope', () => {
    const decision = checkTrust(
      req({ resource: 'urn:alpha:integration:ollama' }),
      bootstrapGrantRegistry(),
      NOW,
    );
    expect(decision.outcome).toBe('allow');
  });

  it('still denies subjects that have no grant in the bootstrap registry', () => {
    const decision = checkTrust(
      req({
        subject: 'integration:gemini',
        action: 'write',
        resource: 'urn:alpha:integration:gemini',
      }),
      bootstrapGrantRegistry(),
      NOW,
    );
    expect(decision.outcome).toBe('deny');
    if (decision.outcome === 'deny') {
      expect(decision.reason).toBe('missing_grant');
    }
  });
});
