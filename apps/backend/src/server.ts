import 'dotenv/config';

import { GoogleGenAI } from '@google/genai';
import {
  ALPHA_CONFIG,
  evaluateProposal,
  runApplier,
  type ApplierHooks,
  type Proposal,
} from '@alpha/alpha-core';
import { createLogger } from '@alpha/logger';
import { handleMcpRequest } from '@alpha/mcp-core';
import { findProvider } from '@alpha/nexus-core';
import { bootstrapGrantRegistry, checkTrust } from '@alpha/permissions';
import express, { type Request, type Response } from 'express';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PROMPTS, isPromptName } from './prompts';
import { parseLessons, parseMetrics, parseNeighborhood, parseProposal } from './proposal-parse';
import { createStackSnapshot } from './stack';

const __dirname = dirname(fileURLToPath(import.meta.url));
const logger = createLogger('alpha-backend');
const startedAt = new Date().toISOString();
const version = '0.1.0';

function unknownToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

function readGitSha(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.GIT_SHA || env.K_REVISION || env.GITHUB_SHA;
  if (fromEnv) return fromEnv.slice(0, 7);

  const gitRoot = findGitRoot(process.cwd()) || findGitRoot(__dirname);
  if (!gitRoot) return 'unknown';

  try {
    const headPath = join(gitRoot, '.git', 'HEAD');
    const head = readFileSync(headPath, 'utf8').trim();

    if (head.startsWith('ref: ')) {
      const refPath = join(gitRoot, '.git', head.slice(5).trim());
      if (existsSync(refPath)) return readFileSync(refPath, 'utf8').trim().slice(0, 7);
    }

    return head.slice(0, 7);
  } catch {
    return 'unknown';
  }
}

function buildingInfo(env: NodeJS.ProcessEnv) {
  return {
    label: env.HOMEBASE_BUILDING_LABEL || 'ALPHA stack connection',
    branch: env.HOMEBASE_BUILDING_BRANCH || 'devin/connect-available-stack',
    base: env.HOMEBASE_BUILDING_BASE || 'main',
    pr_number: Number(env.HOMEBASE_BUILDING_PR || 0),
    pr_url: env.HOMEBASE_BUILDING_PR_URL || 'https://github.com/atomeam/ALPHA',
    repo_url: 'https://github.com/atomeam/ALPHA',
  };
}

function promptInput(body: unknown): string {
  if (isRecord(body) && typeof body.input === 'string') {
    return body.input;
  }

  if (isRecord(body) && body.input !== undefined) {
    return JSON.stringify(body.input);
  }

  return JSON.stringify(body ?? {});
}

function createShadowHooks(): ApplierHooks {
  return {
    snapshot: async () => 'shadow-snapshot',
    dryRun: async (proposal: Proposal) => ({ predictedDelta: proposal.expected_effect.magnitude }),
    applyLive: async () => {},
    applyShadow: async () => {},
    restoreSnapshot: async () => {},
    measureActual: async (proposal: Proposal) => proposal.expected_effect.magnitude,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createApp(env: NodeJS.ProcessEnv = process.env): express.Express {
  const app = express();
  const registry = bootstrapGrantRegistry();

  app.use(express.json({ limit: '1mb' }));
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    next();
  });

  app.options('*', (_req, res) => res.sendStatus(204));

  app.get('/api/health', (_req: Request, res: Response) => {
    const stack = createStackSnapshot(env);

    res.json({
      status: 'ok',
      service: 'alpha-backend',
      version,
      git_sha: readGitSha(env),
      started_at: startedAt,
      bridge: {
        configured: Boolean(env.NOTION_LOG_DB_ID || env.ATOMARCADE_NOTION_LOG_DB_ID),
        port: stack.ports.bridge,
      },
      gemini: {
        configured: Boolean(env.GEMINI_API_KEY),
        model: env.GEMINI_MODEL || 'gemini-2.5-flash',
      },
      stack: {
        repos: stack.sourceRepos.length,
        providers: stack.providers.length,
        configuredProviders: stack.providers.filter((provider) => provider.status === 'configured')
          .length,
      },
      alpha: {
        phase: 1,
        trust: 'explicit-request',
        config: ALPHA_CONFIG,
      },
      building: buildingInfo(env),
      prompts: Object.keys(PROMPTS),
    });
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
    logger.event('trust-decision', {
      outcome: decision.outcome,
      decisionId: decision.decisionId,
    });
    res.status(decision.outcome === 'allow' ? 200 : 403).json(decision);
  });

  app.post('/api/mcp/rpc', (req, res) => {
    res.json(handleMcpRequest(req.body));
  });

  app.post('/api/prompt/:name', async (req: Request, res: Response) => {
    const name = req.params.name ?? '';

    if (!isPromptName(name)) {
      res.status(404).json({ error: 'unknown prompt', name });
      return;
    }

    if (!env.GEMINI_API_KEY) {
      res.status(503).json({ error: 'GEMINI_API_KEY not configured' });
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
      const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
      const response = await ai.models.generateContent({
        model,
        contents: `${PROMPTS[name]}\n\n---\nInput:\n${promptInput(req.body as unknown)}`,
      });

      res.json({ name, model, output: response.text ?? '' });
    } catch (error) {
      logger.error('gemini-call-failed', { detail: unknownToMessage(error) });
      res.status(500).json({ error: 'gemini call failed', detail: unknownToMessage(error) });
    }
  });

  app.post('/api/alpha/evaluate', (req: Request, res: Response) => {
    const body = req.body as unknown;
    const proposal = parseProposal(body);

    if (!proposal) {
      res.status(400).json({ error: 'invalid proposal' });
      return;
    }

    const decision = evaluateProposal(proposal, {
      lessons: parseLessons(body),
      neighborhood: parseNeighborhood(body, proposal.inputs_hash),
      amplitudeMetricsAvailable: new Set(parseMetrics(body, proposal)),
      now: new Date(),
    });

    res.json({ decision });
  });

  app.post('/api/alpha/shadow-apply', async (req: Request, res: Response) => {
    const proposal = parseProposal(req.body as unknown);

    if (!proposal) {
      res.status(400).json({ error: 'invalid proposal' });
      return;
    }

    const result = await runApplier(proposal, {
      neighborhood: {
        inputs_hash: proposal.inputs_hash,
        current_cooldown_hours: ALPHA_CONFIG.cooldown.baseHours,
        consecutive_halts_24h: 0,
        seen_before: false,
      },
      hooks: createShadowHooks(),
      now: new Date(),
    });

    res.json({ result });
  });

  return app;
}

const currentModulePath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';

if (currentModulePath === invokedPath) {
  const port = Number(process.env.PORT || 8080);
  const app = createApp();

  app.listen(port, '0.0.0.0', () => {
    logger.event('server-started', { port, version, gitSha: readGitSha() });
  });
}
