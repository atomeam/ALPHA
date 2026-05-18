import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createServer } from '../src/server.ts';
import type { GeminiCaller } from '../src/gemini.ts';
import { createLogger } from '@alpha/logger';

function silentLogger() {
  return createLogger({ service: 'test', sink: () => {} });
}

describe('GET /api/health', () => {
  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL;
    delete process.env.ATOMARCADE_NOTION_LOG_DB_ID;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns service status with prompts list', async () => {
    const app = createServer({
      logger: silentLogger(),
      startedAt: '2026-05-14T12:00:00Z',
    });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('backend');
    expect(res.body.started_at).toBe('2026-05-14T12:00:00Z');
    expect(res.body.gemini.configured).toBe(false);
    expect(res.body.bridge.configured).toBe(false);
    expect(Array.isArray(res.body.prompts)).toBe(true);
    expect(res.body.prompts).toContain('curator');
    expect(res.body.prompts).toContain('applier');
  });

  it('reflects GEMINI_API_KEY and bridge configuration flags', async () => {
    process.env.GEMINI_API_KEY = 'fake-key';
    process.env.GEMINI_MODEL = 'gemini-2.5-flash';
    process.env.ATOMARCADE_NOTION_LOG_DB_ID = 'db-1';
    const app = createServer({ logger: silentLogger(), geminiCaller: null });
    const res = await request(app).get('/api/health');
    expect(res.body.gemini.configured).toBe(true);
    expect(res.body.gemini.model).toBe('gemini-2.5-flash');
    expect(res.body.bridge.configured).toBe(true);
  });
});

describe('POST /api/prompt/:name', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GEMINI_API_KEY;
  });

  it('returns 404 on unknown prompt name', async () => {
    const app = createServer({ logger: silentLogger(), geminiCaller: null });
    const res = await request(app).post('/api/prompt/nonexistent').send({ input: 'hi' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('unknown prompt');
    expect(res.body.name).toBe('nonexistent');
  });

  it('returns 503 when Gemini is not configured', async () => {
    const app = createServer({ logger: silentLogger(), geminiCaller: null });
    const res = await request(app).post('/api/prompt/curator').send({ input: 'hi' });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/GEMINI_API_KEY/);
  });

  it('dispatches to the injected Gemini caller for known prompts', async () => {
    const generate = vi.fn(async (_prompt: string, input: string) => ({
      model: 'gemini-2.5-flash',
      output: `echo:${input}`,
    }));
    const caller: GeminiCaller = { generate };
    const app = createServer({ logger: silentLogger(), geminiCaller: caller });
    const res = await request(app).post('/api/prompt/curator').send({ input: 'inputs_hash=abc' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('curator');
    expect(res.body.output).toBe('echo:inputs_hash=abc');
    expect(generate).toHaveBeenCalledTimes(1);
    const [, calledInput] = generate.mock.calls[0]!;
    expect(calledInput).toBe('inputs_hash=abc');
  });

  it('returns 500 when the Gemini caller throws', async () => {
    const caller: GeminiCaller = {
      generate: vi.fn(async () => {
        throw new Error('upstream rejected');
      }),
    };
    const app = createServer({ logger: silentLogger(), geminiCaller: caller });
    const res = await request(app).post('/api/prompt/curator').send({ input: 'x' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('gemini call failed');
    expect(res.body.detail).toMatch(/upstream rejected/);
  });

  it('stringifies non-string input bodies', async () => {
    const generate = vi.fn(async (_prompt: string, input: string) => ({
      model: 'm',
      output: input,
    }));
    const caller: GeminiCaller = { generate };
    const app = createServer({ logger: silentLogger(), geminiCaller: caller });
    const res = await request(app)
      .post('/api/prompt/curator')
      .send({ input: { proposal_id: 'P-1' } });
    expect(res.status).toBe(200);
    expect(res.body.output).toBe(JSON.stringify({ proposal_id: 'P-1' }));
  });
});
