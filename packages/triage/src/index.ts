/**
 * Triage Queue
 * 
 * Human review queue for escalated items.
 * SLA tracking and assignment.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Triage item
export interface TriageItem {
  id: string;
  type: 'escalation' | 'review' | 'approval';
  tool?: string;
  args: Record<string, unknown>;
  reason: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'in_review' | 'approved' | 'rejected' | 'expired';
  assignedTo?: string;
  sla: number; // ms until SLA breach
  createdAt: number;
  resolvedAt?: number;
  resolvedBy?: string;
  notes?: string;
}

const TRIAGE_PATH = path.resolve(process.cwd(), '../../logs/triage.jsonl');

function ensureDir() {
  const dir = path.dirname(TRIAGE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Add to triage
export function addToTriage(item: Omit<TriageItem, 'id' | 'createdAt' | 'status'>): TriageItem {
  ensureDir();
  
  const triageItem: TriageItem = {
    ...item,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    status: 'pending',
  };
  
  fs.appendFileSync(TRIAGE_PATH, JSON.stringify(triageItem) + '\n');
  return triageItem;
}

// Get pending items
export function getPending(priority?: TriageItem['priority'], limit = 50): TriageItem[] {
  if (!fs.existsSync(TRIAGE_PATH)) return [];
  
  const content = fs.readFileSync(TRIAGE_PATH, 'utf-8');
  const items = content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as TriageItem);
  
  let filtered = items.filter(i => i.status === 'pending');
  
  if (priority) {
    filtered = filtered.filter(i => i.priority === priority);
  }
  
  // Sort by priority + SLA
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  filtered.sort((a, b) => {
    const pa = priorityOrder[a.priority];
    const pb = priorityOrder[b.priority];
    if (pa !== pb) return pa - pb;
    return a.sla - b.sla;
  });
  
  return filtered.slice(0, limit);
}

// Assign item
export function assignItem(id: string, assignee: string): TriageItem | null {
  if (!fs.existsSync(TRIAGE_PATH)) return null;
  
  const content = fs.readFileSync(TRIAGE_PATH, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);
  
  let found = false;
  const newLines = lines.map(line => {
    const item = JSON.parse(line) as TriageItem;
    if (item.id === id) {
      found = true;
      item.assignedTo = assignee;
      item.status = 'in_review';
    }
    return JSON.stringify(item);
  });
  
  if (found) {
    fs.writeFileSync(TRIAGE_PATH, newLines.join('\n') + '\n');
  }
  
  return found ? { id, status: 'in_review', assignedTo: assignee } as TriageItem : null;
}

// Resolve item
export function resolveItem(id: string, status: 'approved' | 'rejected', resolvedBy: string, notes?: string): TriageItem | null {
  if (!fs.existsSync(TRIAGE_PATH)) return null;
  
  const content = fs.readFileSync(TRIAGE_PATH, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);
  
  let found = false;
  const newLines = lines.map(line => {
    const item = JSON.parse(line) as TriageItem;
    if (item.id === id) {
      found = true;
      item.status = status;
      item.resolvedAt = Date.now();
      item.resolvedBy = resolvedBy;
      item.notes = notes;
    }
    return JSON.stringify(item);
  });
  
  if (found) {
    fs.writeFileSync(TRIAGE_PATH, newLines.join('\n') + '\n');
  }
  
  return found ? { id, status, resolvedBy, notes } as TriageItem : null;
}

// Get stats
export function getStats(): { pending: number; in_review: number; resolved: number; sla_breached: number } {
  if (!fs.existsSync(TRIAGE_PATH)) {
    return { pending: 0, in_review: 0, resolved: 0, sla_breached: 0 };
  }
  
  const content = fs.readFileSync(TRIAGE_PATH, 'utf-8');
  const items = content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as TriageItem);
  const now = Date.now();
  
  return {
    pending: items.filter(i => i.status === 'pending').length,
    in_review: items.filter(i => i.status === 'in_review').length,
    resolved: items.filter(i => i.status === 'approved' || i.status === 'rejected').length,
    sla_breached: items.filter(i => i.status === 'pending' && now > i.sla).length,
  };
}