// POST /api/prompt/:name — dispatches one of the Alpha prompts.
// Gemini integration is grant-gated in Phase 4; for now it requires GEMINI_API_KEY env.

import type { RequestHandler } from 'express';
import { createLogger } from '@alpha/logger';

const log = createLogger('prompt');

// The 6 Alpha prompts + 2 utility prompts. Server-side only.
const PROMPTS: Record<string, string> = {
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

export const PROMPT_NAMES = Object.keys(PROMPTS);

export function promptRoute(): RequestHandler {
  return async (req, res) => {
    const name = req.params['name'];
    if (!name) {
      res.status(400).json({ error: 'missing prompt name' });
      return;
    }
    const prompt = PROMPTS[name];
    if (!prompt) {
      res.status(404).json({ error: 'unknown prompt', name });
      return;
    }

    const apiKey = process.env['GEMINI_API_KEY'];
    if (!apiKey) {
      res.status(503).json({ error: 'GEMINI_API_KEY not configured' });
      return;
    }

    const input =
      typeof req.body?.input === 'string' ? req.body.input : JSON.stringify(req.body?.input ?? {});

    try {
      // Dynamic import — @google/genai is only loaded when actually calling Gemini.
      // This avoids a hard dependency at startup for environments without the SDK.
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });
      const model = process.env['GEMINI_MODEL'] || 'gemini-2.5-flash';
      const r = await ai.models.generateContent({
        model,
        contents: `${prompt}\n\n---\nInput:\n${input}`,
      });
      log.info('prompt-success', { name, model });
      res.json({ name, model, output: r.text ?? '' });
    } catch (err) {
      log.error('prompt-failed', {
        name,
        error: (err as Error).message || String(err),
      });
      res.status(500).json({
        error: 'gemini call failed',
        detail: (err as Error).message || String(err),
      });
    }
  };
}
