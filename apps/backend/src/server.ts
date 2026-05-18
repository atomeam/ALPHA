/**
 * Alpha backend — Express on :8080.
 * - GET  /api/health           service + bridge status, version, git sha, building info
 * - POST /api/prompt/:name     dispatches one of the Alpha prompts to Gemini server-side
 *
 * GEMINI_API_KEY never reaches the client bundle.
 * No background pollers. Periodic activity is allowed only for: /api/health pings, webhook
 * receivers, and user-clicked actions (see docs/TRUST.md).
 */
import 'dotenv/config';
import express, { type Express, type Request, type Response } from 'express';
import { dirname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createLogger, type Logger } from '@alpha/logger';

import { readBuildingInfo } from './building.ts';
import { createGeminiCaller, type GeminiCaller } from './gemini.ts';
import { readGitSha } from './git-sha.ts';
import { PROMPTS } from './prompts.ts';

const VERSION = '0.1.0';

export interface BackendDeps {
  /** Resolved at startup; injectable for tests. */
  geminiCaller?: GeminiCaller | null;
  /** Override the logger sink (e.g. silent in tests). */
  logger?: Logger;
  /** Override repo root for git sha resolution. */
  repoRoot?: string;
  /** Override server start time (for deterministic /api/health output in tests). */
  startedAt?: string;
}

export function createServer(deps: BackendDeps = {}): Express {
  const logger = deps.logger ?? createLogger({ service: 'backend' });
  const repoRoot = deps.repoRoot ?? defaultRepoRoot();
  const gitSha = readGitSha(repoRoot);
  const startedAt = deps.startedAt ?? new Date().toISOString();
  const building = readBuildingInfo();

  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
  const geminiCaller =
    deps.geminiCaller !== undefined
      ? deps.geminiCaller
      : apiKey
        ? createGeminiCaller(apiKey, model)
        : null;

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'backend',
      version: VERSION,
      git_sha: gitSha,
      started_at: startedAt,
      bridge: { configured: Boolean(process.env.ATOMARCADE_NOTION_LOG_DB_ID) },
      gemini: {
        configured: Boolean(apiKey),
        model,
      },
      building,
      prompts: Object.keys(PROMPTS),
    });
  });

  app.post('/api/prompt/:name', async (req: Request, res: Response) => {
    const name = req.params.name ?? '';
    const prompt = name ? PROMPTS[name] : undefined;
    if (!prompt) {
      res.status(404).json({ error: 'unknown prompt', name });
      return;
    }
    if (!geminiCaller) {
      res.status(503).json({ error: 'GEMINI_API_KEY not configured' });
      return;
    }
    const body = req.body as { input?: unknown } | undefined;
    const input = typeof body?.input === 'string' ? body.input : JSON.stringify(body?.input ?? {});

    try {
      const result = await geminiCaller.generate(prompt, input);
      logger.info('prompt-dispatched', { name, model: result.model });
      res.json({ name, model: result.model, output: result.output });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('prompt-failed', { name, message });
      res.status(500).json({ error: 'gemini call failed', detail: message });
    }
  });

  if (process.env.SERVE_STATIC === 'true') {
    const distDir = resolve(repoRoot, 'apps', 'frontend', 'dist');
    if (existsSync(distDir)) {
      app.use(express.static(distDir));
    }
  }

  return app;
}

function defaultRepoRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', '..');
}

/** Boots the server when run directly. Skipped when imported (tests). */
function main(): void {
  const port = Number(process.env.PORT ?? 8080);
  const app = createServer();
  app.listen(port, () => {
    const sha = readGitSha(defaultRepoRoot());
    console.log(`[backend] listening on :${port} sha=${sha} v${VERSION}`);
  });
  // Keep TS happy when the module also exports.
  void join;
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectRun) {
  main();
}
