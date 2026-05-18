// Alpha bridge — lightweight HTTP relay on :8090.
// Phase 6 replaces this with the full PowerShell bridge + webhook receiver.

import express, { type Express } from 'express';
import { createLogger } from '@alpha/logger';

const PORT = Number(process.env['BRIDGE_PORT'] || 8090);
const BACKEND_ORIGIN = process.env['BACKEND_ORIGIN'] || 'http://localhost:8080';
const log = createLogger('bridge');

export function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'alpha-bridge',
      upstream: BACKEND_ORIGIN,
      started_at: STARTED_AT,
    });
  });

  // Relay: POST /relay/prompt/:name → backend POST /api/prompt/:name
  app.post('/relay/prompt/:name', async (req, res) => {
    try {
      const name = req.params['name'];
      if (!name) {
        res.status(400).json({ error: 'missing prompt name' });
        return;
      }
      const url = `${BACKEND_ORIGIN}/api/prompt/${encodeURIComponent(name)}`;
      const upstream = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } catch (err) {
      res.status(502).json({
        error: 'bridge relay failed',
        detail: (err as Error).message,
      });
    }
  });

  // Relay: GET /relay/health → backend GET /api/health
  app.get('/relay/health', async (_req, res) => {
    try {
      const upstream = await fetch(`${BACKEND_ORIGIN}/api/health`);
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } catch (err) {
      res.status(502).json({
        error: 'bridge relay failed',
        detail: (err as Error).message,
      });
    }
  });

  return app;
}

const STARTED_AT = new Date().toISOString();

if (process.env['NODE_ENV'] !== 'test') {
  const app = createApp();
  app.listen(PORT, () => {
    log.event('bridge-start', {
      port: PORT,
      upstream: BACKEND_ORIGIN,
    });
  });
}
