import { describe, expect, it } from 'vitest';

import { checkTrust, type GrantRegistry, type TrustRequest } from '../src/index';

const request: TrustRequest = {
  subject: 'app:backend',
  action: 'read',
  resource: 'urn:alpha:integration:gemini',
  requestId: 'trust-test',
};

describe('checkTrust', () => {
  it('allows a valid replacement when an earlier matching grant is revoked', () => {
    const registry: GrantRegistry = {
      subjects: ['app:backend'],
      grants: [
        {
          kind: 'direct',
          id: 'revoked-grant',
          subject: 'app:backend',
          action: 'read',
          resource: 'urn:alpha:integration:gemini',
          issuedAt: '2026-05-18T00:00:00.000Z',
          revokedAt: '2026-05-18T00:30:00.000Z',
          issuer: 'kernel',
        },
        {
          kind: 'direct',
          id: 'replacement-grant',
          subject: 'app:backend',
          action: 'read',
          resource: 'urn:alpha:integration:gemini',
          issuedAt: '2026-05-18T01:00:00.000Z',
          issuer: 'kernel',
        },
      ],
    };

    expect(checkTrust(request, registry, new Date('2026-05-18T02:00:00.000Z'))).toEqual({
      outcome: 'allow',
      grantId: 'replacement-grant',
      decisionId: 'trust-test:allow',
      expiresAt: undefined,
    });
  });

  it('allows a valid replacement when an earlier matching grant is expired', () => {
    const registry: GrantRegistry = {
      subjects: ['app:backend'],
      grants: [
        {
          kind: 'direct',
          id: 'expired-grant',
          subject: 'app:backend',
          action: 'read',
          resource: 'urn:alpha:integration:gemini',
          issuedAt: '2026-05-18T00:00:00.000Z',
          expiresAt: '2026-05-18T01:00:00.000Z',
          issuer: 'kernel',
        },
        {
          kind: 'direct',
          id: 'replacement-grant',
          subject: 'app:backend',
          action: 'read',
          resource: 'urn:alpha:integration:gemini',
          issuedAt: '2026-05-18T01:00:00.000Z',
          issuer: 'kernel',
        },
      ],
    };

    expect(checkTrust(request, registry, new Date('2026-05-18T02:00:00.000Z'))).toMatchObject({
      outcome: 'allow',
      grantId: 'replacement-grant',
    });
  });

  it('denies with stale grant reason when no active grant is available', () => {
    const registry: GrantRegistry = {
      subjects: ['app:backend'],
      grants: [
        {
          kind: 'direct',
          id: 'revoked-grant',
          subject: 'app:backend',
          action: 'read',
          resource: 'urn:alpha:integration:gemini',
          issuedAt: '2026-05-18T00:00:00.000Z',
          revokedAt: '2026-05-18T00:30:00.000Z',
          issuer: 'kernel',
        },
      ],
    };

    expect(checkTrust(request, registry, new Date('2026-05-18T02:00:00.000Z'))).toEqual({
      outcome: 'deny',
      reason: 'revoked_grant',
      decisionId: 'trust-test:revoked',
    });
  });
});
