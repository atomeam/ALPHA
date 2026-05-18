import 'dotenv/config';

import { GoogleGenAI } from '@google/genai';
import { ALPHA_CONFIG } from '@alpha/alpha-core';
import { createLogger, type Logger } from '@alpha/logger';
import { handleMcpRequest, listMcpTools } from '@alpha/mcp-core';
import { findProvider } from '@alpha/nexus-core';
import { bootstrapGrantRegistry, checkTrust, type GrantRegistry } from '@alpha/permissions';
import express from 'express';
import { existsSync, readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PROMPTS, isPromptName } from './prompts';
import { createStackSnapshot, type StackSnapshot } from './stack';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(moduleDir, '../../..');
const startedAt = new Date().toISOString();
const version = '0.1.0';
const shaPattern = /^[0-9a-f]{7,40}$/i;

interface CreateAppOptions {
  env?: NodeJS.ProcessEnv;
  logger?: Logger;
  registry?: GrantRegistry;
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
  service: 'alpha-backend';
  version: string;
  git_sha: string;
  started_at: string;
  bridge: { configured: boolean; port: number };
  gemini: { configured: boolean; model: string };
  stack: { repos: number; providers: number; configuredProviders: number };
  building: BuildingMetadata;
  alpha: { amplitude_schema_version: string };
  prompts: string[];
}

function unknownToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function shortSha(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed && shaPattern.test(trimmed) ? trimmed.slice(0, 7) : 'unknown';
}

function findGitRoot(start: string): string | undefined {
  let current = start;
  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(join(current, '.git', 'HEAD'))) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
  return undefined;
}

export function readGitSha(root = repoRoot, env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = shortSha(env.GIT_SHA || env.K_REVISION || env.GITHUB_SHA);
  if (fromEnv !== 'unknown') return fromEnv;

  const gitRoot = findGitRoot(root) || findGitRoot(process.cwd()) || findGitRoot(moduleDir);
  if (!gitRoot) return 'unknown';

  try {
    const head = readFileSync(join(gitRoot, '.git', 'HEAD'), 'utf8').trim();
    if (head.startsWith('ref: ')) {
      const refPath = join(gitRoot, '.git', head.slice(5).trim());
      return existsSync(refPath) ? shortSha(readFileSync(refPath, 'utf8')) : 'unknown';
    }
    return shortSha(head);
  } catch {
    return 'unknown';
  }
}

function buildingInfo(env: NodeJS.ProcessEnv): BuildingMetadata {
  return {
    label: env.HOMEBASE_BUILDING_LABEL || 'ALPHA stack connection',
    branch: env.HOMEBASE_BUILDING_BRANCH || 'devin/connect-available-stack',
    base: env.HOMEBASE_BUILDING_BASE || 'main',
    pr_number: Number(env.HOMEBASE_BUILDING_PR || 0),
    pr_url: env.HOMEBASE_BUILDING_PR_URL || 'https://github.com/atomeam/ALPHA',
    repo_url: 'https://github.com/atomeam/ALPHA',
  };
}

function stackSummary(stack: StackSnapshot): HealthPayload['stack'] {
  return {
    repos: stack.sourceRepos.length,
    providers: stack.providers.length,
    configuredProviders: stack.providers.filter((provider) => provider.status === 'configured')
      .length,
  };
}

export function healthPayload(env: NodeJS.ProcessEnv = process.env): HealthPayload {
  const stack = createStackSnapshot(env);
  return {
    status: 'ok',
    service: 'alpha-backend',
    version,
    git_sha: readGitSha(repoRoot, env),
    started_at: startedAt,
    bridge: { configured: Boolean(env.NOTION_LOG_DB_ID), port: stack.ports.bridge },
    gemini: {
      configured: Boolean(env.GEMINI_API_KEY),
      model: env.GEMINI_MODEL || 'gemini-2.5-flash',
    },
    stack: stackSummary(stack),
    building: buildingInfo(env),
    alpha: { amplitude_schema_version: ALPHA_CONFIG.amplitudeSchemaVersion },
    prompts: Object.keys(PROMPTS),
  };
}

function coercePromptInput(body: { input?: unknown }): string {
  const input = body.input;
  return typeof input === 'string' ? input : (JSON.stringify(input ?? {}) ?? '{}');
}

export function createApp(options: CreateAppOptions = {}): express.Express {
  const env = options.env ?? process.env;
  const processLogger = options.logger ?? createLogger('alpha-backend');
  const registry = options.registry ?? bootstrapGrantRegistry();
  const app = express();

  app.use(express.json({ limit: '1mb' }));
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    next();
  });

  app.options('*', (_req, res) => res.sendStatus(204));

  app.get('/api/health', (_req, res) => {
    res.json(healthPayload(env));
  });

  app.get('/api/stack', (_req, res) => {
    res.json(createStackSnapshot(env));
  });

  app.get('/api/nexus/registry', (_req, res) => {
    res.json(createStackSnapshot(env).providers);
  });

  app.get('/api/integrations/:provider/status', (req, res) => {
    const providerId = req.params.provider;
    if (!providerId) return res.status(400).json({ error: 'provider is required' });

    const provider = findProvider(providerId);
    if (!provider) return res.status(404).json({ error: 'unknown provider', provider: providerId });

    const runtime = createStackSnapshot(env).providers.find((entry) => entry.id === provider.id);
    return res.json(runtime);
  });

  app.post('/api/trust/check', (req, res) => {
    const decision = checkTrust(req.body, registry);
    processLogger.event('trust-decision', {
      outcome: decision.outcome,
      decisionId: decision.decisionId,
    });
    res.status(decision.outcome === 'allow' ? 200 : 403).json(decision);
  });

  app.get('/api/mcp/tools', (_req, res) => {
    res.json({ tools: listMcpTools() });
  });

  app.post('/api/mcp/rpc', (req, res) => {
    res.json(handleMcpRequest(req.body));
  });

  app.post('/api/prompt/:name', async (req, res) => {
    const name = req.params.name;
    if (!name || !isPromptName(name)) {
      return res.status(404).json({ error: 'unknown prompt', name });
    }

    if (!env.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'GEMINI_API_KEY not configured' });
    }

    try {
      const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
      const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
      const response = await ai.models.generateContent({
        model,
        contents: `${PROMPTS[name]}\n\n---\nInput:\n${coercePromptInput(req.body)}`,
      });
      return res.json({ name, model, output: response.text ?? '' });
    } catch (error) {
      processLogger.error('gemini-call-failed', { detail: unknownToMessage(error) });
      return res.status(500).json({ error: 'gemini call failed' });
    }
  });

  if (env.SERVE_STATIC === 'true') {
    const distDir = env.FRONTEND_DIST_DIR
      ? resolve(repoRoot, env.FRONTEND_DIST_DIR)
      : join(repoRoot, 'apps/frontend/dist');
    const indexPath = join(distDir, 'index.html');
    if (existsSync(indexPath)) {
      app.use(express.static(distDir));
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api/')) {
          next();
          return;
        }
        res.sendFile(indexPath);
      });
    }
  }

  return app;
}

export function startServer(env: NodeJS.ProcessEnv = process.env): Server {
  const port = Number(env.PORT || 8080);
  const logger = createLogger('alpha-backend');
  const server = createApp({ env, logger }).listen(port, '0.0.0.0', () => {
    logger.event('server-started', { port, version, gitSha: readGitSha(repoRoot, env) });
  });
  return server;
}

const executedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (executedPath === fileURLToPath(import.meta.url)) {
  startServer();
}
