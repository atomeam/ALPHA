import 'dotenv/config';

import { ALPHA_PROMPTS } from '@alpha/alpha-core';
import { GoogleGenAI } from '@google/genai';
import express from 'express';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const STARTED_AT = new Date().toISOString();
const VERSION = '0.1.0';

function readGitSha(): string {
  const fromEnv = process.env.GIT_SHA || process.env.K_REVISION || process.env.GITHUB_SHA;
  if (fromEnv) return fromEnv.slice(0, 7);

  const candidates = [
    join(process.cwd(), '.git'),
    join(__dirname, '..', '..', '..', '.git'),
    join(__dirname, '..', '..', '..', '..', '.git'),
  ];

  for (const gitDir of candidates) {
    try {
      const headPath = join(gitDir, 'HEAD');
      if (!existsSync(headPath)) continue;

      const head = readFileSync(headPath, 'utf8').trim();
      if (head.startsWith('ref: ')) {
        const refPath = join(gitDir, head.slice(5).trim());
        if (existsSync(refPath)) {
          return readFileSync(refPath, 'utf8').trim().slice(0, 7);
        }
      }
      return head.slice(0, 7);
    } catch {
      continue;
    }
  }

  return 'unknown';
}

const GIT_SHA = readGitSha();

const BUILDING = {
  label: process.env.HOMEBASE_BUILDING_LABEL || 'Phase 1 — backend cutover',
  branch: process.env.HOMEBASE_BUILDING_BRANCH || 'alpha',
  base: process.env.HOMEBASE_BUILDING_BASE || 'main',
  pr_number: Number(process.env.HOMEBASE_BUILDING_PR || 1),
  pr_url: process.env.HOMEBASE_BUILDING_PR_URL || 'https://github.com/atomeam/ALPHA/pull/1',
  repo_url: 'https://github.com/atomeam/ALPHA',
};

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'alpha-backend',
    version: VERSION,
    git_sha: GIT_SHA,
    started_at: STARTED_AT,
    bridge: { configured: Boolean(process.env.ATOMARCADE_NOTION_LOG_DB_ID) },
    gemini: {
      configured: Boolean(process.env.GEMINI_API_KEY),
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    },
    building: BUILDING,
    prompts: Object.keys(ALPHA_PROMPTS),
  });
});

app.post('/api/prompt/:name', async (req, res) => {
  const name = req.params.name;
  if (!name) {
    return res.status(400).json({ error: 'missing prompt name' });
  }

  const prompt = ALPHA_PROMPTS[name];
  if (!prompt) {
    return res.status(404).json({ error: 'unknown prompt', name });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ error: 'GEMINI_API_KEY not configured' });
  }

  const input =
    typeof req.body?.input === 'string' ? req.body.input : JSON.stringify(req.body?.input ?? {});

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const result = await ai.models.generateContent({
      model,
      contents: `${prompt}\n\n---\nInput:\n${input}`,
    });

    return res.json({ name, model, output: result.text ?? '' });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: 'gemini call failed', detail });
  }
});

if (process.env.SERVE_STATIC === 'true') {
  const distDir = join(__dirname, '..', 'dist');
  if (existsSync(distDir)) {
    app.use(express.static(distDir));
  }
}

app.listen(PORT, () => {
  console.log(
    `[alpha-backend] listening on :${PORT} sha=${GIT_SHA} v=${VERSION} building=${BUILDING.branch}→${BUILDING.base} PR#${BUILDING.pr_number}`,
  );
});
