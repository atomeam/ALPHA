import { afterEach, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { createApp } from '../src/server';

let server: Server | undefined;

function listen(env: NodeJS.ProcessEnv = {}): string {
  const app = createApp({ env: { ...process.env, ...env } });
  server = app.listen(0);
  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Expected server to listen on a TCP port.');
  }

  return `http://127.0.0.1:${(address as AddressInfo).port}`;
}

afterEach(async () => {
  if (!server) {
    return;
  }

  await new Promise<void>((resolvePromise, reject) => {
    server?.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolvePromise();
    });
  });
  server = undefined;
});

describe('backend HTTP surface', () => {
  it('serves HomeBase health metadata', async () => {
    const baseUrl = listen({ GEMINI_API_KEY: '', GIT_SHA: 'abcdef123456' });
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('homebase');
    expect(body.git_sha).toBe('abcdef1');
    expect(body.gemini.configured).toBe(false);
    expect(body.alpha.amplitude_schema_version).toBe('v1');
    expect(body.prompts).toContain('observer');
  });

  it('rejects unknown prompt names', async () => {
    const baseUrl = listen({ GEMINI_API_KEY: '' });
    const response = await fetch(`${baseUrl}/api/prompt/not-real`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: 'hello' }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('unknown prompt');
  });

  it('keeps Gemini credentials server-side', async () => {
    const baseUrl = listen({ GEMINI_API_KEY: '' });
    const response = await fetch(`${baseUrl}/api/prompt/observer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: 'hello' }),
    });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe('GEMINI_API_KEY not configured');
  });
});
