import { GoogleGenAI } from '@google/genai';
import {
  ALPHA_CONFIG,
  evaluateProposal,
  runApplier,
  type ApplierHooks,
  type Proposal,
} from '@alpha/alpha-core';
import express, { type Request, type Response } from 'express';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBuildingInfo } from './building';
import { readGitSha } from './git-sha';
import { isPromptName, PROMPTS } from './prompts';
import { parseLessons, parseMetrics, parseNeighborhood, parseProposal } from './proposal-parse';

const VERSION = '0.1.0';
const STARTED_AT = new Date().toISOString();

export function createApp(env: NodeJS.ProcessEnv = process.env): express.Express {
  const app = express();

  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'alpha-backend',
      version: VERSION,
      git_sha: readGitSha(env),
      started_at: STARTED_AT,
      ports: { backend: 8080, frontend: 5173, bridge: 8090 },
      bridge: { configured: Boolean(env.ATOMARCADE_NOTION_LOG_DB_ID) },
      gemini: {
        configured: Boolean(env.GEMINI_API_KEY),
        model: env.GEMINI_MODEL ?? 'gemini-2.5-flash',
      },
      alpha: {
        phase: 1,
        trust: 'explicit-request',
        config: ALPHA_CONFIG,
      },
      building: readBuildingInfo(env),
      prompts: Object.keys(PROMPTS),
    });
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
      const model = env.GEMINI_MODEL ?? 'gemini-2.5-flash';
      const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model,
        contents: `${PROMPTS[name]}\n\n---\nInput:\n${promptInput(req.body as unknown)}`,
      });

      res.json({ name, model, output: response.text ?? '' });
    } catch (error) {
      res.status(500).json({ error: 'gemini call failed', detail: errorMessage(error) });
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const currentModulePath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';

if (currentModulePath === invokedPath) {
  const port = Number(process.env.PORT ?? 8080);
  const app = createApp();

  app.listen(port, () => {
    console.log(`[alpha-backend] listening on :${port} sha=${readGitSha()} v${VERSION}`);
  });
}
