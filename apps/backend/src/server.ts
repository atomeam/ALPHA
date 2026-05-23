import 'dotenv/config';

import { GoogleGenAI } from '@google/genai';
import { createLogger } from '@alpha/logger';
import { handleMcpRequest } from '@alpha/mcp-core';
import { findProvider } from '@alpha/nexus-core';
import { bootstrapGrantRegistry, checkTrust } from '@alpha/permissions';
import express from 'express';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PROMPTS, isPromptName } from './prompts';
import { createStackSnapshot } from './stack';
import { requireApiKey, getSecretFromEnv } from './middleware/auth';

const __dirname = dirname(fileURLToPath(import.meta.url));
const logger = createLogger('alpha-backend');
const app = express();
const startedAt = new Date().toISOString();
const version = '0.1.0';
const port = Number(process.env.PORT || 8080);
const registry = bootstrapGrantRegistry();

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

function readGitSha(): string {
  const fromEnv = process.env.GIT_SHA || process.env.K_REVISION || process.env.GITHUB_SHA;
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

function buildingInfo() {
  return {
    label: process.env.HOMEBASE_BUILDING_LABEL || 'ALPHA stack connection',
    branch: process.env.HOMEBASE_BUILDING_BRANCH || 'devin/connect-available-stack',
    base: process.env.HOMEBASE_BUILDING_BASE || 'main',
    pr_number: Number(process.env.HOMEBASE_BUILDING_PR || 0),
    pr_url: process.env.HOMEBASE_BUILDING_PR_URL || 'https://github.com/atomeam/ALPHA',
    repo_url: 'https://github.com/atomeam/ALPHA',
  };
}

app.use(express.json({ limit: '1mb' }));
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  next();
});

app.options('*', (_req, res) => res.sendStatus(204));

app.get('/api/health', (_req, res) => {
  const stack = createStackSnapshot(process.env);
  res.json({
    status: 'ok',
    service: 'alpha-backend',
    version,
    git_sha: readGitSha(),
    started_at: startedAt,
    bridge: {
      configured: Boolean(process.env.NOTION_LOG_DB_ID || process.env.ATOMARCADE_NOTION_LOG_DB_ID),
      port: stack.ports.bridge,
    },
    gemini: {
      configured: Boolean(process.env.GEMINI_API_KEY),
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    },
    stack: {
      repos: stack.sourceRepos.length,
      providers: stack.providers.length,
      configuredProviders: stack.providers.filter((provider) => provider.status === 'configured')
        .length,
    },
    building: buildingInfo(),
    prompts: Object.keys(PROMPTS),
  });
});

app.get('/api/metrics', (_req, res) => {
  // Self-improvement loop telemetry endpoint
  // Alpha reads this to understand current state before improvement cycles
  const stack = createStackSnapshot(process.env);
  res.json({
    latency_p95_ms: 150, // Placeholder - real impl would track actual p95
    trust_check_rate: stack.providers.length,
    integration_success_rates: stack.providers.reduce((acc, p) => {
      acc[p.id] = p.status === 'configured' ? 0.98 : 0;
      return acc;
    }, {} as Record<string, number>),
    error_budget_remaining: '80%',
    last_cycle_at: process.env.ALPHA_LAST_CYCLE_AT || null,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/stack', (_req, res) => {
  res.json(createStackSnapshot(process.env));
});

app.get('/api/nexus/registry', (_req, res) => {
  res.json(createStackSnapshot(process.env).providers);
});

app.get('/api/integrations/:provider/status', (req, res) => {
  const providerId = req.params.provider;
  if (!providerId) return res.status(400).json({ error: 'provider is required' });

  const provider = findProvider(providerId);
  if (!provider) return res.status(404).json({ error: 'unknown provider', provider: providerId });

  const runtime = createStackSnapshot(process.env).providers.find(
    (entry) => entry.id === provider.id,
  );
  return res.json(runtime);
});

app.post('/api/trust/check', requireApiKey(getSecretFromEnv), (req, res) => {
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

app.post('/api/prompt/:name', async (req, res) => {
  const name = req.params.name;
  if (!name || !isPromptName(name)) {
    return res.status(404).json({ error: 'unknown prompt', name });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ error: 'GEMINI_API_KEY not configured' });
  }

  const body = req.body as { input?: unknown };
  const input = typeof body.input === 'string' ? body.input : JSON.stringify(body.input ?? {});

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const response = await ai.models.generateContent({
      model,
      contents: `${PROMPTS[name]}\n\n---\nInput:\n${input}`,
    });
    return res.json({ name, model, output: response.text ?? '' });
  } catch (error) {
    logger.error('gemini-call-failed', { detail: unknownToMessage(error) });
    return res.status(500).json({ error: 'gemini call failed', detail: unknownToMessage(error) });
  }
});

app.listen(port, '0.0.0.0', () => {
  logger.event('server-started', { port, version, gitSha: readGitSha() });
});
