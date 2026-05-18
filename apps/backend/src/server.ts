// Alpha backend — Node/Express on :8080.
// Ported from HomeBase server.js → TypeScript.

import express, { type Express } from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createLogger } from '@alpha/logger';
import { healthRoute } from './routes/health.js';
import { promptRoute, PROMPT_NAMES } from './routes/prompt.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env['PORT'] || 8080);
const STARTED_AT = new Date().toISOString();
const VERSION = '0.1.0';

const log = createLogger('backend');

function readGitSha(): string {
  const fromEnv = process.env['GIT_SHA'] || process.env['K_REVISION'] || process.env['GITHUB_SHA'];
  if (fromEnv) return String(fromEnv).slice(0, 7);
  try {
    const headPath = join(__dirname, '..', '..', '..', '.git', 'HEAD');
    if (!existsSync(headPath)) return 'unknown';
    const head = readFileSync(headPath, 'utf8').trim();
    if (head.startsWith('ref: ')) {
      const refPath = join(__dirname, '..', '..', '..', '.git', head.slice(5).trim());
      if (existsSync(refPath)) return readFileSync(refPath, 'utf8').trim().slice(0, 7);
    }
    return head.slice(0, 7);
  } catch {
    return 'unknown';
  }
}

const GIT_SHA = readGitSha();

const BUILDING = {
  label: process.env['HOMEBASE_BUILDING_LABEL'] || 'Phase 1 — backend + alpha-core cutover',
  branch: process.env['HOMEBASE_BUILDING_BRANCH'] || 'main',
  base: process.env['HOMEBASE_BUILDING_BASE'] || 'main',
  pr_number: Number(process.env['HOMEBASE_BUILDING_PR'] || 0),
  pr_url: process.env['HOMEBASE_BUILDING_PR_URL'] || 'https://github.com/atomeam/ALPHA',
  repo_url: 'https://github.com/atomeam/ALPHA',
};

export function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', healthRoute({ VERSION, GIT_SHA, STARTED_AT, BUILDING, PROMPT_NAMES }));
  app.post('/api/prompt/:name', promptRoute());

  return app;
}

if (process.env['NODE_ENV'] !== 'test') {
  const app = createApp();
  app.listen(PORT, () => {
    log.info('server-start', {
      port: PORT,
      sha: GIT_SHA,
      version: VERSION,
      building: `${BUILDING.branch}→${BUILDING.base}`,
    });
  });
}
