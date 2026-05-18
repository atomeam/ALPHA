import 'dotenv/config';

import { GoogleGenAI } from '@google/genai';
import { ALPHA_CONFIG } from '@alpha/alpha-core';
import express from 'express';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PROMPTS, isPromptName } from './prompts';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(moduleDir, '../../..');
const defaultPort = 8080;
const startedAt = new Date().toISOString();
const version = '0.1.0';

interface CreateAppOptions {
  env?: NodeJS.ProcessEnv;
}

interface PromptRequestBody {
  input?: unknown;
}

interface BuildingMetadata {
  label: string;
  branch: string;
  base: string;
  pr_number: number;
  pr_url: string;
  repo_url: string;
}

interface HealthPayload {
  status: 'ok';
  service: 'homebase';
  version: string;
  git_sha: string;
  started_at: string;
  bridge: { configured: boolean };
  gemini: { configured: boolean; model: string };
  building: BuildingMetadata;
  alpha: { amplitude_schema_version: string };
  prompts: string[];
}

export function readGitSha(root = repoRoot, env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.GIT_SHA || env.K_REVISION || env.GITHUB_SHA;
  if (fromEnv) {
    return String(fromEnv).slice(0, 7);
  }

  try {
    const headPath = join(root, '.git', 'HEAD');
    if (!existsSync(headPath)) {
      return 'unknown';
    }

    const head = readFileSync(headPath, 'utf8').trim();
    if (head.startsWith('ref: ')) {
      const refPath = join(root, '.git', head.slice(5).trim());
      if (existsSync(refPath)) {
        return readFileSync(refPath, 'utf8').trim().slice(0, 7);
      }
    }

    return head.slice(0, 7);
  } catch {
    return 'unknown';
  }
}

function buildingMetadata(env: NodeJS.ProcessEnv): BuildingMetadata {
  return {
    label: env.HOMEBASE_BUILDING_LABEL || 'Tier 1 — server + health + tests',
    branch: env.HOMEBASE_BUILDING_BRANCH || 'alpha',
    base: env.HOMEBASE_BUILDING_BASE || 'main',
    pr_number: Number(env.HOMEBASE_BUILDING_PR || 1),
    pr_url: env.HOMEBASE_BUILDING_PR_URL || 'https://github.com/atomeam/HomeBase-/pull/1',
    repo_url: 'https://github.com/atomeam/HomeBase-',
  };
}

function coercePromptInput(body: PromptRequestBody): string {
  const input = body.input;
  return typeof input === 'string' ? input : (JSON.stringify(input ?? {}) ?? '{}');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function healthPayload(env: NodeJS.ProcessEnv = process.env): HealthPayload {
  return {
    status: 'ok',
    service: 'homebase',
    version,
    git_sha: readGitSha(repoRoot, env),
    started_at: startedAt,
    bridge: { configured: Boolean(env.ATOMARCADE_NOTION_LOG_DB_ID) },
    gemini: {
      configured: Boolean(env.GEMINI_API_KEY),
      model: env.GEMINI_MODEL || 'gemini-2.5-flash',
    },
    building: buildingMetadata(env),
    alpha: { amplitude_schema_version: ALPHA_CONFIG.amplitudeSchemaVersion },
    prompts: Object.keys(PROMPTS),
  };
}

export function createApp(options: CreateAppOptions = {}): express.Express {
  const env = options.env ?? process.env;
  const app = express();

  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json(healthPayload(env));
  });

  app.post<{ name: string }, unknown, PromptRequestBody>('/api/prompt/:name', async (req, res) => {
    const { name } = req.params;
    if (!isPromptName(name)) {
      return res.status(404).json({ error: 'unknown prompt', name });
    }

    if (!env.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'GEMINI_API_KEY not configured' });
    }

    try {
      const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
      const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
      const result = await ai.models.generateContent({
        model,
        contents: `${PROMPTS[name]}\n\n---\nInput:\n${coercePromptInput(req.body)}`,
      });
      return res.json({ name, model, output: result.text ?? '' });
    } catch (error) {
      return res.status(500).json({ error: 'gemini call failed', detail: errorMessage(error) });
    }
  });

  if (env.SERVE_STATIC === 'true') {
    const distDir = env.FRONTEND_DIST_DIR || join(repoRoot, 'apps/frontend/dist');
    if (existsSync(distDir)) {
      app.use(express.static(distDir));
    }
  }

  return app;
}

export function startServer(
  port = Number(process.env.PORT || defaultPort),
): ReturnType<express.Express['listen']> {
  const app = createApp();
  return app.listen(port, () => {
    const payload = healthPayload();
    console.log(
      `[homebase] listening on :${port} sha=${payload.git_sha} v=${payload.version} ` +
        `building=${payload.building.branch}→${payload.building.base} ` +
        `PR#${payload.building.pr_number}`,
    );
  });
}

function isDirectRun(metaUrl: string): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint && resolve(entrypoint) === fileURLToPath(metaUrl));
}

if (isDirectRun(import.meta.url)) {
  startServer();
}
