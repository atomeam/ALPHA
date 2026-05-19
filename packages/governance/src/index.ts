/**
 * @aether/governance - Agentic Observability & Governance
 * 
 * Phase 1: Audit Middleware + Decision Logging
 * Phase 2: Judge Agent for offline evaluation
 * Phase 3: Guardrails (circuit breaker, policy injection)
 * 
 * Usage:
 *   const audit = new AuditMiddleware();
 *   await audit.capture({ agent: 'executor', action: 'file_write', ... });
 */

import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';

const LOG_DIR = './logs';
const DECISIONS_LOG = `${LOG_DIR}/agent-decisions.jsonl`;

// --- Core Schemas ---

// Agent intent capture
export const AgentIntentSchema = z.object({
  agentId: z.string(),
  agentType: z.enum(['executor', 'evaluator', 'curator', 'council', 'custom']),
  systemPromptVersion: z.string().optional(),
  thoughtProcess: z.string(), // Why the agent made this decision
  confidenceScore: z.number().min(0).max(1), // 0-1 confidence
  requestedAction: z.object({
    tool: z.string(),
    input: z.record(z.any()),
  }),
  timestamp: z.number(),
});

export type AgentIntent = z.infer<typeof AgentIntentSchema>;

// Outcome capture (what actually happened)
export const AgentOutcomeSchema = z.object({
  intentId: z.string(),
  status: z.enum(['success', 'failure', 'partial', 'timeout']),
  output: z.record(z.any()).optional(),
  error: z.string().optional(),
  latencyMs: z.number(),
  timestamp: z.number(),
});

export type AgentOutcome = z.infer<typeof AgentOutcomeSchema>;

// Complete decision record (intent + outcome)
export const DecisionRecordSchema = z.object({
  id: z.string(),
  intent: AgentIntentSchema,
  outcome: AgentOutcomeSchema.optional(),
  score: z.number().min(0).max(1).optional(), // Judge-assigned
  flagged: z.boolean().default(false),
  flaggedReason: z.string().optional(),
});

export type DecisionRecord = z.infer<typeof AgentOutcomeSchema>;

// --- Audit Middleware ---

export class AuditMiddleware {
  private pendingIntents: Map<string, AgentIntent> = new Map();

  /**
   * Capture an agent's intent before execution
   * Returns an intentId to correlate with outcome later
   */
  async capture(intent: Omit<AgentIntent, 'timestamp'>): Promise<string> {
    const intentId = `intent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    const fullIntent: AgentIntent = {
      ...intent,
      timestamp: Date.now(),
    };
    
    this.pendingIntents.set(intentId, fullIntent);
    this.logToFile({ id: intentId, intent: fullIntent });
    
    return intentId;
  }

  /**
   * Record the outcome of an intent
   */
  async recordOutcome(
    intentId: string,
    outcome: Omit<AgentOutcome, 'intentId' | 'timestamp'>
  ): Promise<void> {
    const intent = this.pendingIntents.get(intentId);
    if (!intent) {
      console.warn(`⚠️  Intent not found: ${intentId}`);
      return;
    }

    const fullOutcome: AgentOutcome = {
      ...outcome,
      intentId,
      timestamp: Date.now(),
    };

    // Update record (append outcome to existing intent)
    this.appendOutcomeToFile(intentId, fullOutcome);
    this.pendingIntents.delete(intentId);
  }

  /**
   * Wrap a function to auto-capture intent + outcome
   */
  async audit<T>(
    agentId: string,
    agentType: AgentIntent['agentType'],
    thoughtProcess: string,
    confidenceScore: number,
    tool: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const intentId = await this.capture({
      agentId,
      agentType,
      thoughtProcess,
      confidenceScore,
      requestedAction: { tool, input: {} },
    });

    const startMs = Date.now();
    let status: AgentOutcome['status'] = 'success';
    let output: any;
    let error: string | undefined;

    try {
      output = await fn();
    } catch (e: any) {
      status = 'failure';
      error = e.message;
    } finally {
      await this.recordOutcome(intentId, {
        status,
        output,
        error,
        latencyMs: Date.now() - startMs,
      });
    }

    return output;
  }

  /**
   * Log to file (append mode)
   */
  private logToFile(record: { id: string; intent: AgentIntent }): void {
    ensureDir();
    fs.appendFileSync(DECISIONS_LOG, JSON.stringify(record) + '\n');
  }

  private appendOutcomeToFile(intentId: string, outcome: AgentOutcome): void {
    // Read all, find intent, add outcome, rewrite
    // For simplicity, just append outcome with intentId link
    ensureDir();
    fs.appendFileSync(DECISIONS_LOG, JSON.stringify({ intentId, outcome }) + '\n');
  }
}

// --- Judge Agent (Phase 2) ---

interface JudgeResult {
  intentId: string;
  score: number;
  flagged: boolean;
  flaggedReason?: string;
}

export class JudgeAgent {
  /**
   * Evaluate an intent-outcome pair
   * Returns a confidence score (0-1)
   */
  evaluate(intent: AgentIntent, outcome?: AgentOutcome): JudgeResult {
    let score = intent.confidenceScore;
    let flagged = false;
    let flaggedReason: string | undefined;

    // Factor 1: Confidence score weight
    const confidenceWeight = 0.4;
    score *= confidenceWeight;

    // Factor 2: Success/failure
    if (outcome) {
      if (outcome.status === 'success') {
        score += 0.3;
      } else if (outcome.status === 'failure') {
        score += 0.1; // Low score for failures
        flagged = true;
        flaggedReason = `Agent reported failure: ${outcome.error}`;
      } else if (outcome.status === 'timeout') {
        score += 0.15;
        flagged = outcome.latencyMs > 10000; // Flag >10s latency
        flaggedReason = flagged ? 'Timeout >10s' : undefined;
      }
    }

    // Factor 3: Latency too high
    if (outcome && outcome.latencyMs > 30000) {
      score -= 0.1;
      flagged = true;
      flaggedReason = 'Severe latency (>30s)';
    }

    // Factor 4: Low initial confidence
    if (intent.confidenceScore < 0.5) {
      flagged = true;
      flaggedReason = 'Low starting confidence (<0.5)';
    }

    return {
      intentId: intent.agentId,
      score: Math.max(0, Math.min(1, score)),
      flagged,
      flaggedReason,
    };
  }

  /**
   * Batch evaluate all pending decisions
   */
  async evaluateAll(): Promise<JudgeResult[]> {
    const records = loadDecisions();
    const results: JudgeResult[] = [];

    // Simple: evaluate each intent (in reality would pair with outcomes)
    for (const record of records) {
      if (record.intent) {
        const result = this.evaluate(record.intent, record.outcome);
        results.push(result);
      }
    }

    return results;
  }
}

// --- Policy Guardrails (Phase 3) ---

export const PolicySchema = z.object({
  version: z.string(),
  rules: z.array(z.object({
    id: z.string(),
    condition: z.string(), // e.g., "confidence < 0.5"
    action: z.enum(['block', 'warn', 'escalate']),
    severity: z.enum(['low', 'medium', 'high']),
  })),
});

export type Policy = z.infer<typeof PolicySchema>;

const defaultPolicy: Policy = {
  version: '1.0.0',
  rules: [
    {
      id: 'low_confidence',
      condition: 'confidence < 0.5',
      action: 'warn',
      severity: 'medium',
    },
    {
      id: 'high_latency',
      condition: 'latency > 30000',
      action: 'block',
      severity: 'high',
    },
    {
      id: 'repeated_failure',
      condition: 'failures > 5 in 1 hour',
      action: 'escalate',
      severity: 'high',
    },
  ],
};

export class PolicyGuard {
  private policy: Policy = defaultPolicy;

  constructor(policy?: Partial<Policy>) {
    this.policy = { ...defaultPolicy, ...policy };
  }

  /**
   * Check if an action should be blocked
   */
  check(intent: AgentIntent): { allowed: boolean; action?: string; reason?: string } {
    // Check confidence threshold
    if (intent.confidenceScore < 0.5) {
      const rule = this.policy.rules.find(r => r.id === 'low_confidence');
      return {
        allowed: rule?.action !== 'block',
        action: rule?.action,
        reason: `Confidence ${intent.confidenceScore} < 0.5`,
      };
    }

    return { allowed: true };
  }

  getPolicy(): Policy {
    return this.policy;
  }
}

// --- Helpers ---

function ensureDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function loadDecisions(): Array<{ id: string; intent?: AgentIntent; outcome?: AgentOutcome }> {
  if (!fs.existsSync(DECISIONS_LOG)) {
    return [];
  }

  const lines = fs.readFileSync(DECISIONS_LOG, 'utf-8').split('\n').filter(Boolean);
  return lines.map(line => JSON.parse(line));
}