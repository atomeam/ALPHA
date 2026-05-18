/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * HomeBase server. Runs alongside the Vite client.
 * - GET  /api/health           — service + bridge status, real version + git sha + building info
 * - GET  /api/logs             — recent activity from homebase-logs.jsonl
 * - POST /api/prompt/:name     — dispatches one of the 6 Alpha prompts to Gemini, server-side only
 * - POST /api/run/:script      — execute HomeBase scripts (observer, evaluator, proposer, etc.)
 * - POST /api/run/alpha-loop   — execute full Alpha loop (Observer → Evaluator → Proposer)
 *
 * The GEMINI_API_KEY never reaches the client bundle.
 */
import 'dotenv/config';
import express from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { runAlphaLoop } from './src/alpha/orchestrator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const STARTED_AT = new Date().toISOString();
const VERSION = '0.1.0';

// Health history ring buffer (in-memory)
const HEALTH_HISTORY_MAX = 50;
const healthHistory = [];
let lastHealthOk = null; // Track status transitions for alerting

// Health history persistence (optional JSONL file)
const HEALTH_HISTORY_PATH = process.env.HOMEBASE_HEALTH_HISTORY_PATH || 'C:\\AtomArcade\\health-history.jsonl';

function addHealthSnapshot(snapshot) {
  const entry = {
    timestamp: snapshot.timestamp || new Date().toISOString(),
    ok: snapshot.ok,
    version: snapshot.version,
    checks: snapshot.checks,
  };
  
  // Check for status transition (alerting)
  if (lastHealthOk !== null && lastHealthOk !== snapshot.ok) {
    entry.statusTransition = {
      from: lastHealthOk,
      to: snapshot.ok,
      at: entry.timestamp,
    };
  }
  lastHealthOk = snapshot.ok;
  
  // Add to ring buffer
  healthHistory.push(entry);
  if (healthHistory.length > HEALTH_HISTORY_MAX) {
    healthHistory.shift();
  }
  
  // Persist to JSONL (sync, fire-and-forget)
  try {
    if (HEALTH_HISTORY_PATH) {
      const fs = require('node:fs');
      const line = JSON.stringify(entry) + '\n';
      fs.appendFileSync(HEALTH_HISTORY_PATH, line);
    }
  } catch {
    // Ignore persistence errors silently
  }
  
  return entry;
}

function getFlappingStatus() {
  const recent = healthHistory.slice(-10);
  if (recent.length < 3) return null;
  
  const failures = recent.filter(h => !h.ok).length;
  if (failures >= 3) return 'flapping';
  
  const firstFail = recent.find(h => !h.ok);
  const lastSuccess = [...recent].reverse().find(h => h.ok);
  
  return {
    firstFailureAt: firstFail?.timestamp || null,
    lastSuccessAt: lastSuccess?.timestamp || null,
    recentFailures: failures,
    totalInWindow: recent.length,
  };
}

// Incident tracking for Notion write-back
let lastIncidentWritten = null; // timestamp of last incident
let lastIncidentSignature = null; // deduplication signature
let lastNotionPageId = null; // Page ID of last created incident

// Map of open incidents by signature (for recovery resolution)
const openIncidents = new Map(); // signature -> { pageId, openedAt, title }

// All incidents for correlation analysis (including resolved)
const allIncidents = []; // { homebaseSha, bridgeVersion, status, openedAt, resolvedAt, duration }

// Current versions (for correlation)
const currentVersions = {
  homebaseSha: GIT_SHA,
  bridgeVersion: null, // set after first bridge health fetch
};

function getSignature(data, isFlapping) {
  return JSON.stringify({
    ok: data.ok,
    isFlapping,
    failedChecks: Object.entries(data.checks || {})
      .filter(([_, v]) => !v.ok)
      .map(([k]) => k)
      .sort(),
  });
}

function shouldWriteIncident(currentData, isFlapping) {
  // Rate limit: at most 1 incident per unique failure signature per 30 minutes
  const signature = getSignature(currentData, isFlapping);
  
  // If same signature, don't write again within 30 min
  if (signature === lastIncidentSignature && lastIncidentWritten) {
    const timeSinceLast = Date.now() - new Date(lastIncidentWritten).getTime();
    if (timeSinceLast < 30 * 60 * 1000) {
      return { should: false, reason: 'rate-limited' };
    }
  }
  
  return { should: true, signature };
}

async function writeIncidentToNotion(incident) {
  try {
    const { Client } = await import('@notionhq/client');
    const notion = new Client({ apiKey: process.env.NOTION_API_KEY });
    const dbId = process.env.ATOMARCADE_NOTION_LOG_DB_ID;
    
    if (!dbId) {
      console.log('[incident] No ATOMARCADE_NOTION_LOG_DB_ID, skipping');
      return { written: false, reason: 'no-db' };
    }
    
    // Build detail with version info inline
    const versionInfo = `HomeBaseSHA=${incident.homebaseSha || 'unknown'} BridgeVersion=${incident.bridgeVersion || 'unknown'} BridgeURL=${incident.bridgeBaseUrl || 'n/a'}`;
    const fullDetail = `${versionInfo} | ${incident.detail}`;
    
    const page = await notion.pages.create({
      parent: { database_id: dbId },
      properties: {
        'Kind': { select: { name: 'Incident' } },
        'Timestamp': { rich_text: [{ text: { content: incident.timestamp } }] },
        'Status': { select: { name: incident.ok ? 'Resolved' : 'Open' } },
        'Detail': { rich_text: [{ text: { content: fullDetail } }] },
        'Source': { rich_text: [{ text: { content: 'HomeBase Telemetry' } }] },
      },
    });
    
    console.log(`[incident] Written to Notion: ${incident.title} (HB:${incident.homebaseSha} BR:${incident.bridgeVersion})`);
    return { written: true, pageId: page.id };
  } catch (err) {
    console.error('[incident] Notion write failed:', err.message);
    return { written: false, error: err.message };
  }
}

async function resolveIncidentInNotion(signature) {
  try {
    const entry = openIncidents.get(signature);
    if (!entry) {
      console.log('[incident] No open incident to resolve for signature');
      return { resolved: false, reason: 'not-found' };
    }
    
    const { Client } = await import('@notionhq/client');
    const notion = new Client({ apiKey: process.env.NOTION_API_KEY });
    
    const resolveTime = new Date().toISOString();
    
    // Calculate duration
    let duration = 'unknown';
    try {
      const opened = new Date(entry.openedAt).getTime();
      const resolved = new Date(resolveTime).getTime();
      const diffMs = resolved - opened;
      const diffMins = Math.round(diffMs / 60000);
      duration = diffMins < 1 ? '<1 min' : `${diffMins} min`;
    } catch {
      // ignore
    }
    
    // Build version info for resolve
    const resolveInfo = `Resolved at ${resolveTime} (Duration: ${duration} HomeBaseSHA=${GIT_SHA})`;
    
    await notion.pages.update({
      page_id: entry.pageId,
      properties: {
        'Status': { select: { name: 'Resolved' } },
        'Detail': { rich_text: [{ text: { content: `${entry.detail || ''} | ${resolveInfo}` } }] },
      },
    });
    
    console.log(`[incident] Resolved incident: ${entry.pageId} (${duration})`);
    openIncidents.delete(signature);
    
    // Mark in correlation tracker
    for (const inc of allIncidents) {
      if (inc.status === 'Open' && inc.openedAt === entry.openedAt) {
        inc.status = 'Resolved';
        inc.resolvedAt = resolveTime;
        inc.duration = duration;
        break;
      }
    }
    
    return { resolved: true, duration };
  } catch (err) {
    console.error('[incident] Resolve failed:', err.message);
    return { resolved: false, error: err.message };
  }
}

async function handleHealthTransition(bridgeData, flappingStatus) {
  const isFlapping = flappingStatus === 'flapping';
  const signature = getSignature(bridgeData, isFlapping);
  
  // Recovery: ok flips false → true AND we have an open incident
  const isRecovery = lastHealthOk === false && bridgeData.ok === true;
  
  if (isRecovery) {
    // Try to resolve the matching incident
    if (process.env.NOTION_INCIDENT_LOG_ENABLED === 'true') {
      const result = await resolveIncidentInNotion(signature);
      if (result.resolved) {
        // Clear tracking
        lastIncidentSignature = null;
        lastIncidentWritten = null;
        lastNotionPageId = null;
      }
    }
    return;
  }
  
  // New failure: ok flips true → false, or flapping starts
  const isTransitionToBad = lastHealthOk === true && bridgeData.ok === false;
  const isFlappingStart = !lastIncidentSignature && isFlapping;
  
  if (!isTransitionToBad && !isFlappingStart) return;
  
  // Check guard
  if (process.env.NOTION_INCIDENT_LOG_ENABLED !== 'true') {
    console.log('[incident] NOTION_INCIDENT_LOG_ENABLED not true, skipping write');
    return;
  }
  
  const { should, reason } = shouldWriteIncident(bridgeData, isFlapping);
  if (!should) {
    console.log(`[incident] Skipping: ${reason}`);
    return;
  }
  
  // Build incident payload
  const failedChecks = Object.entries(bridgeData.checks || {})
    .filter(([_, v]) => !v.ok)
    .map(([k, v]) => `${k}: ${v.detail} (${v.latencyMs}ms)`);
  
  // Extract bridge version from response
  const bridgeVersion = bridgeData.version || bridgeData.gitSha || 'unknown';
  
  const incident = {
    timestamp: new Date().toISOString(),
    title: isFlapping ? 'WARNING: Connection Flapping' : 'CRITICAL: System Outage',
    detail: failedChecks.length > 0 ? failedChecks.join('; ') : 'Overall health check failed',
    ok: bridgeData.ok,
    source: 'bridge-health',
    bridgeBaseUrl: process.env.BRIDGE_BASE_URL,
    homebaseSha: GIT_SHA,
    bridgeVersion: bridgeVersion,
    telemetry: {
      isFlapping,
      historyLength: healthHistory.length,
    },
  };
  
  // Write to Notion
  const result = await writeIncidentToNotion(incident);
  
  if (result.written) {
    lastIncidentWritten = incident.timestamp;
    lastIncidentSignature = signature;
    lastNotionPageId = result.pageId;
    
    // Track open incident for resolution
    openIncidents.set(signature, {
      pageId: result.pageId,
      openedAt: incident.timestamp,
      title: incident.title,
      detail: incident.detail,
    });
    
    // Track for correlation
    allIncidents.push({
      homebaseSha: incident.homebaseSha || 'unknown',
      bridgeVersion: incident.bridgeVersion || 'unknown',
      status: 'Open',
      openedAt: incident.timestamp,
      resolvedAt: null,
      duration: null,
    });
  }
}

// Path to homebase-logs.jsonl on Victus
const HOMEBASE_LOGS_PATH = process.env.HOMEBASE_LOGS_PATH || 'C:\\AtomArcade\\atomarcade-bridge\\homebase-logs.jsonl';

function readGitSha() {
  const fromEnv =
    process.env.GIT_SHA || process.env.K_REVISION || process.env.GITHUB_SHA;
  if (fromEnv) return String(fromEnv).slice(0, 7);
  try {
    const headPath = join(__dirname, '.git', 'HEAD');
    if (!existsSync(headPath)) return 'unknown';
    const head = readFileSync(headPath, 'utf8').trim();
    if (head.startsWith('ref: ')) {
      const refPath = join(__dirname, '.git', head.slice(5).trim());
      if (existsSync(refPath))
        return readFileSync(refPath, 'utf8').trim().slice(0, 7);
    }
    return head.slice(0, 7);
  } catch {
    return 'unknown';
  }
}
const GIT_SHA = readGitSha();

// "Building" block. Set HOMEBASE_BUILDING_* envs in deploy to retarget the banner.
const BUILDING = {
  label: process.env.HOMEBASE_BUILDING_LABEL || 'Tier 1 — server + health + tests',
  branch: process.env.HOMEBASE_BUILDING_BRANCH || 'alpha',
  base: process.env.HOMEBASE_BUILDING_BASE || 'main',
  pr_number: Number(process.env.HOMEBASE_BUILDING_PR || 1),
  pr_url: process.env.HOMEBASE_BUILDING_PR_URL || 'https://github.com/atomeam/HomeBase-/pull/1',
  repo_url: 'https://github.com/atomeam/HomeBase-',
};

// The 6 Alpha prompts + 2 utility prompts. Server-side only.
const PROMPTS = {
  observer: `You are Alpha's Observer. Read the last 24h of:
- Nucleus Routing Log v0
- Atomind Bridge Logs
- Any new rows in Lessons DB

Output exactly:
1) Top 5 routing anomalies (id, signature, frequency).
2) Top 3 silent successes worth promoting into Lessons.
3) Any signature that matches an existing Lesson's inputs_hash neighborhood.

No prose. Bullets only. Reason code per item (OBS_*).`,
  evaluator: `You are Alpha's Evaluator. For each Observer item:
- Classify: no-op | propose-config-change | propose-lesson | propose-runbook-prune
- Predict effect (1 sentence) and rollback (1 sentence).
- Cite the Lesson, runbook, or Decision log entry that justifies the call.

If no citation exists, classify as no-op (EVL_NO_CITATION) and list the missing evidence.
Default-deny anything you cannot cite.`,
  proposer: `You are Alpha's Proposer. Take one Evaluator output classified as a propose-*.
Produce a Proposal record using the canonical fields in ALPHA.md.
If risk_class is high, stop and explain what would lower it (PRP_HIGH_RISK_STOP).`,
  curator: `You are Curator. Default-deny.
Approve only if ALL hold:
1) inputs_hash not tagged do-not-repeat.
2) Citations resolve.
3) Rollback is operator-free reversible.
4) expected_effect is measurable in Amplitude v1.
5) risk_class is low, OR Operator co-sign attached.

On denial emit CUR_<single_missing_condition>. No retries this pass.`,
  applier: `You are Alpha's Applier. You have an approved Proposal.
1) Snapshot affected state (file hashes, page revisions, config values).
2) Run change in dry-run; diff to Nucleus Routing Log v0.
3) If dry-run diff matches expected_effect within tolerance, apply.
4) On any deviation: halt, write the snapshot back, emit APPLY_HALT_<short>.

Never apply without a snapshot. Never silence a deviation.

Before step 1, verify ALL of:
- Blast radius is within cap (3 files OR 3 pages OR 1 schema). Else halt APP_BLAST_CAP.
- No prior apply on this inputs_hash neighborhood within the active cooldown. Else halt APP_COOLDOWN.
- If files_or_pages_touched > 1, plan canary: smallest target first, full set deferred 1 cycle.
- If risk_class = medium, require Operator co-sign field present.
- If neighborhood is new, run as shadow apply; do not touch live targets.`,
  reflector: `You are Alpha's Reflector. Applier just finished.
Compare predicted vs. actual effect using Amplitude events.
Write one Lesson row:

- id: L-<next>
- signature: inputs_hash
- outcome: success | partial | failure
- delta: predicted vs. actual, numeric where possible
- generalization: one sentence usable as a future denial reason
- tag: keep | do-not-repeat | needs-operator

If outcome is failure, also propose the smallest config change that would
have prevented it (no execution, just text). Emit RFL_*.`,
  repeatCheck: `Given this inputs_hash and short description, return:
- nearest 3 Lessons by signature similarity
- whether any are tagged do-not-repeat
- a single sentence: "safe to proceed" or "blocked because <Lesson id>".`,
  councilSecondOpinion: `You are not Alpha. Read this Proposal and Curator denial.
In ≤150 words: is the denial correct, over-cautious, or wrong?
Cite the specific Curator Policy v0 clause you are leaning on.
End with one of: UPHOLD | RELAX | OVERRIDE_REQUIRES_OPERATOR.`,
};

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'homebase',
    version: VERSION,
    git_sha: GIT_SHA,
    started_at: STARTED_AT,
    bridge: { configured: Boolean(process.env.ATOMARCADE_NOTION_LOG_DB_ID) },
    gemini: {
      configured: Boolean(process.env.GEMINI_API_KEY),
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    },
    building: BUILDING,
    prompts: Object.keys(PROMPTS),
  });
});

// Proxy endpoint: fetch bridge health from AtomArcade Bridge
// Uses BRIDGE_BASE_URL (defaults to http://localhost:8080)
app.get('/api/bridge/health', async (_req, res) => {
  const bridgeUrl = process.env.BRIDGE_BASE_URL;
  
  // Gracefully handle missing BRIDGE_BASE_URL
  if (!bridgeUrl) {
    return res.json({
      ok: false,
      detail: 'BRIDGE_BASE_URL not set',
      timestamp: new Date().toISOString(),
    });
  }
  
  try {
    // Short timeout fetch (3 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch(`${bridgeUrl}/api/health`, {
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    let data;
    if (response.ok) {
      data = await response.json();
    } else {
      data = {
        ok: false,
        detail: `Bridge HTTP ${response.status}`,
        timestamp: new Date().toISOString(),
      };
    }
    
    // Store in history and get telemetry
    addHealthSnapshot(data);
    const flapping = getFlappingStatus();
    
    // Handle incident detection (non-blocking)
    handleHealthTransition(data, flapping).catch(err => 
      console.error('[incident] Handler error:', err.message)
    );
    
    // Attach telemetry metadata to response
    const telemetry = {
      historyLength: healthHistory.length,
      isFlapping: flapping === 'flapping',
      firstFailureTime: flapping?.firstFailureAt || null,
      lastSuccessTime: flapping?.lastSuccessAt || null,
    };
    
    return res.json({
      ...data,
      telemetry,
    });
  } catch (error) {
    // Catch network errors, timeouts, etc.
    const errorData = {
      ok: false,
      detail: error instanceof Error ? error.message : 'Bridge unreachable',
      timestamp: new Date().toISOString(),
    };
    
    // Still record the failure
    addHealthSnapshot(errorData);
    const flapping = getFlappingStatus();
    
    // Handle incident detection (non-blocking)
    handleHealthTransition(errorData, flapping).catch(err => 
      console.error('[incident] Handler error:', err.message)
    );
    
    return res.json({
      ...errorData,
      telemetry: {
        historyLength: healthHistory.length,
        isFlapping: flapping === 'flapping',
        firstFailureTime: flapping?.firstFailureAt || null,
        lastSuccessTime: flapping?.lastSuccessAt || null,
      },
    });
  }
});

// Endpoint to get health history
app.get('/api/bridge/health/history', (_req, res) => {
  res.json({
    history: healthHistory,
    flapping: getFlappingStatus(),
  });
});

// Deploy Correlation: group incidents by (HomeBaseSHA, BridgeSHA)
app.get('/api/bridge/incidents/correlation', (_req, res) => {
  // Group incidents by version pair
  const groups = new Map();
  
  for (const inc of allIncidents) {
    const key = `${inc.homebaseSha || 'unknown'}|${inc.bridgeVersion || 'unknown'}`;
    if (!groups.has(key)) {
      groups.set(key, {
        homeBaseSha: inc.homebaseSha || 'unknown',
        bridgeSha: inc.bridgeVersion || 'unknown',
        count: 0,
        openCount: 0,
        flappingCount: 0,
        lastSeen: null,
        durations: [],
      });
    }
    const g = groups.get(key);
    g.count++;
    if (inc.status === 'Open') g.openCount++;
    if (inc.status === 'Resolved' && inc.resolvedAt) {
      g.durations.push({ openedAt: inc.openedAt, resolvedAt: inc.resolvedAt });
    }
    if (!g.lastSeen || inc.openedAt > g.lastSeen) {
      g.lastSeen = inc.openedAt;
    }
  }
  
  // Calculate avg duration
  const rows = Array.from(groups.values()).map(g => {
    let avgDuration = 'N/A';
    if (g.durations.length > 0) {
      let totalMins = 0;
      for (const d of g.durations) {
        try {
          totalMins += (new Date(d.resolvedAt).getTime() - new Date(d.openedAt).getTime()) / 60000;
        } catch {}
      }
      avgDuration = `${Math.round(totalMins / g.durations.length)} min`;
    }
    return {
      homeBaseSha: g.homeBaseSha,
      bridgeSha: g.bridgeSha,
      count: g.count,
      openCount: g.openCount,
      flappingCount: g.flappingCount,
      lastSeen: g.lastSeen,
      avgDuration,
    };
  });
  
  // Sort by lastSeen desc
  rows.sort((a, b) => (b.lastSeen || '').localeCompare(a.lastSeen || ''));
  
  res.json({
    rows,
    generatedAt: new Date().toISOString(),
  });
});

// Read homebase-logs.jsonl from Victus and return recent entries
app.get('/api/logs', (_req, res) => {
  try {
    if (!existsSync(HOMEBASE_LOGS_PATH)) {
      return res.json({ entries: [], error: 'Log file not found', path: HOMEBASE_LOGS_PATH });
    }
    
    const content = readFileSync(HOMEBASE_LOGS_PATH, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());
    
    // Parse JSONL and get last 50 entries
    const entries = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        entries.push(entry);
      } catch {
        // Skip malformed lines
      }
    }
    
    const recent = entries.slice(-50).reverse(); // Last 50, newest first
    
    res.json({
      entries: recent,
      total: entries.length,
      path: HOMEBASE_LOGS_PATH,
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to read logs',
      detail: err?.message || String(err),
      path: HOMEBASE_LOGS_PATH,
    });
  }
});

app.post('/api/prompt/:name', async (req, res) => {
  const name = req.params.name;
  const prompt = PROMPTS[name];
  if (!prompt) {
    return res.status(404).json({ error: 'unknown prompt', name });
  }
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ error: 'GEMINI_API_KEY not configured' });
  }
  const input =
    typeof req.body?.input === 'string'
      ? req.body.input
      : JSON.stringify(req.body?.input ?? {});
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const r = await ai.models.generateContent({
      model,
      contents: `${prompt}\n\n---\nInput:\n${input}`,
    });
    res.json({ name, model, output: r.text ?? '' });
  } catch (err) {
    res
      .status(500)
      .json({ error: 'gemini call failed', detail: err?.message || String(err) });
  }
});

// Run a HomeBase script
app.post('/api/run/:script', async (req, res) => {
  const script = req.params.script;
  
  // Alpha loop (special case)
  if (script === 'alpha-loop') {
    try {
      const result = await runAlphaLoop();
      return res.json({
        script,
        status: result.status,
        loopId: result.loopId,
        timestamp: result.timestamp,
        message: result.status === 'success' 
          ? `Loop completed: Observer → Evaluator → Proposer`
          : result.error,
      });
    } catch (err) {
      return res.status(500).json({
        script,
        status: 'error',
        error: err.message || String(err),
      });
    }
  }

  // Individual scripts (placeholder)
  const validScripts = ['observer', 'evaluator', 'proposer', 'curator', 'applier', 'reflector'];
  
  if (!validScripts.includes(script)) {
    return res.status(400).json({ error: 'unknown script', script });
  }
  
  try {
    res.json({
      script,
      status: 'running',
      message: `${script} script initiated`,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      error: 'script execution failed',
      detail: err?.message || String(err),
    });
  }
});

if (process.env.SERVE_STATIC === 'true') {
  const distDir = join(__dirname, 'dist');
  if (existsSync(distDir)) {
    app.use(express.static(distDir));
  }
}

app.listen(PORT, () => {
  console.log(`[homebase] listening on :${PORT} sha=${GIT_SHA} v${VERSION} building=${BUILDING.branch}→${BUILDING.base} PR#${BUILDING.pr_number}`);
  console.log(`[homebase] reading logs from: ${HOMEBASE_LOGS_PATH}`);
  console.log(`[homebase] Gemini configured: ${Boolean(process.env.GEMINI_API_KEY)}`);
});
