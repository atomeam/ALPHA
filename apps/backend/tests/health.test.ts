import { describe, expect, it, afterEach } from 'vitest';
import http from 'node:http';
import { createApp } from '../src/server.js';

let server: http.Server | undefined;

afterEach(() => {
  if (server) {
    server.close();
    server = undefined;
  }
});

function startServer(): Promise<number> {
  const app = createApp();
  return new Promise((resolve, reject) => {
    server = app.listen(0, () => {
      const addr = server!.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('could not get server address'));
        return;
      }
      resolve(addr.port);
    });
  });
}

function request(
  port: number,
  method: string,
  path: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const url = `http://127.0.0.1:${port}${path}`;
    const req = http.request(url, { method }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => {
        data += chunk.toString();
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          body: JSON.parse(data) as Record<string, unknown>,
        });
      });
    });
    req.on('error', (err: Error) => reject(err));
    req.end();
  });
}

describe('GET /api/health', () => {
  it('returns status ok with expected fields', async () => {
    const port = await startServer();
    const { status, body } = await request(port, 'GET', '/api/health');
    expect(status).toBe(200);
    expect(body['status']).toBe('ok');
    expect(body['service']).toBe('alpha-backend');
    expect(body['version']).toBeDefined();
    expect(body['git_sha']).toBeDefined();
    expect(body['started_at']).toBeDefined();
    expect(body['prompts']).toBeInstanceOf(Array);
    expect(body['building']).toBeDefined();
  });
});

describe('POST /api/prompt/:name', () => {
  it('returns 404 for unknown prompt', async () => {
    const port = await startServer();
    const { status, body } = await request(port, 'POST', '/api/prompt/unknown');
    expect(status).toBe(404);
    expect(body['error']).toBe('unknown prompt');
  });

  it('returns 503 when GEMINI_API_KEY is not set', async () => {
    delete process.env['GEMINI_API_KEY'];
    const port = await startServer();
    const { status, body } = await request(port, 'POST', '/api/prompt/observer');
    expect(status).toBe(503);
    expect(body['error']).toBe('GEMINI_API_KEY not configured');
  });
});
