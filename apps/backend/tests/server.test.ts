import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server';

const proposal = {
  id: 'P-test',
  title: 'tweak routing threshold',
  inputs_hash: 'hash-a',
  change_summary: 'lower routing threshold by 10%',
  files_or_pages_touched: ['packages/alpha-core/src/config.ts'],
  expected_effect: {
    metric: 'routing.success_rate',
    direction: 'increase',
    magnitude: 0.05,
    tolerance: 0.02,
  },
  rollback_steps: ['restore previous threshold value'],
  risk_class: 'low',
  requires: ['Curator'],
  citations: [{ kind: 'lesson', id: 'L-000' }],
  classification: 'config-change',
  idempotent: true,
};

describe('alpha backend', () => {
  it('reports health and Phase 1 metadata', async () => {
    const response = await request(createApp({ GIT_SHA: 'abcdef123456' })).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'alpha-backend',
      git_sha: 'abcdef1',
      alpha: { phase: 1, trust: 'explicit-request' },
    });
  });

  it('returns 404 for unknown prompts', async () => {
    const response = await request(createApp()).post('/api/prompt/not-real').send({ input: 'x' });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: 'unknown prompt', name: 'not-real' });
  });

  it('keeps Gemini prompts server-side without a configured key', async () => {
    const response = await request(createApp()).post('/api/prompt/observer').send({ input: 'x' });

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ error: 'GEMINI_API_KEY not configured' });
  });

  it('evaluates proposals through Curator', async () => {
    const response = await request(createApp()).post('/api/alpha/evaluate').send({ proposal });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ decision: { approved: true } });
  });

  it('runs Applier in shadow mode only', async () => {
    const response = await request(createApp()).post('/api/alpha/shadow-apply').send({ proposal });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ result: { status: 'shadowed' } });
  });
});
