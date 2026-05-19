/**
 * Curator Audit Log
 * 
 * Append-only decision log for Curator.
 * Makes policy enforcement observable.
 */

import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Audit record schema
export const AuditRecordSchema = z.object({
  decisionId: z.string(),
  runId: z.string().optional(),
  timestamp: z.string(),
  actor: z.enum(['executor', 'evaluator', 'reflector', 'human', 'system']),
  tool: z.string(),
  args: z.record(z.unknown()).optional(),
  decision: z.enum(['approve', 'deny', 'escalate']),
  rule: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string().optional(),
});

export type AuditRecord = z.infer<typeof AuditRecordSchema>;

// Path to audit log
const AUDIT_PATH = path.resolve(process.cwd(), '../../logs/curator-audit.jsonl');

// Ensure directory
function ensureDir() {
  const dir = path.dirname(AUDIT_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Write an audit record
export function logDecision(input: Omit<AuditRecord, 'decisionId' | 'timestamp'>) {
  ensureDir();
  
  const record: AuditRecord = {
    decisionId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...input,
  };
  
  const line = JSON.stringify(record) + '\n';
  fs.appendFileSync(AUDIT_PATH, line);
  
  return record;
}

// Read recent decisions
export function getDecisions(options?: {
  since?: number;  // ms ago
  tool?: string;
  decision?: 'approve' | 'deny' | 'escalate';
  limit?: number;
}): Promise<AuditRecord[]> {
  const { since, tool, decision, limit = 100 } = options || {};
  
  if (!fs.existsSync(AUDIT_PATH)) {
    return Promise.resolve([]);
  }
  
  const content = fs.readFileSync(AUDIT_PATH, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);
  
  let records = lines.map(line => AuditRecordSchema.parse(JSON.parse(line)));
  
  // Filter by time
  if (since) {
    const cutoff = Date.now() - since;
    records = records.filter(r => new Date(r.timestamp).getTime() >= cutoff);
  }
  
  // Filter by tool
  if (tool) {
    records = records.filter(r => r.tool === tool);
  }
  
  // Filter by decision
  if (decision) {
    records = records.filter(r => r.decision === decision);
  }
  
  return records.slice(-limit);
}

// Get denial rate for a tool
export async function getDenialRate(tool: string): Promise<number> {
  const records = await getDecisions({ tool, limit: 100 });
  
  if (records.length === 0) {
    return 0;
  }
  
  const denials = records.filter(r => r.decision === 'deny').length;
  return denials / records.length;
}

// Get decision stats
export async function getStats(): Promise<{
  total: number;
  approved: number;
  denied: number;
  escalated: number;
  denial_rate: number;
}> {
  if (!fs.existsSync(AUDIT_PATH)) {
    return { total: 0, approved: 0, denied: 0, escalated: 0, denial_rate: 0 };
  }
  
  const content = fs.readFileSync(AUDIT_PATH, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);
  
  const records = lines.map(line => AuditRecordSchema.parse(JSON.parse(line)));
  
  const approved = records.filter(r => r.decision === 'approve').length;
  const denied = records.filter(r => r.decision === 'deny').length;
  const escalated = records.filter(r => r.decision === 'escalate').length;
  
  return {
    total: records.length,
    approved,
    denied,
    escalated,
    denial_rate: records.length > 0 ? denied / records.length : 0,
  };
}