/**
 * Lesson Compactor
 * 
 * Nightly merge / deduplicate lessons.
 * Contradiction detection.
 */

import fs from 'fs';
import path from 'path';

// Lesson entry (from @aether/lessons)
interface Lesson {
  id: string;
  pattern: string;
  suggestion: string;
  action: string;
  outcome: 'success' | 'failure' | 'noop';
  confidence: number;
  source: string;
  timestamp: string;
}

const LESSONS_PATH = path.resolve(process.cwd(), '../../logs/lessons.jsonl');
const COMPACTED_PATH = path.resolve(process.cwd(), '../../logs/lessons-compacted.jsonl');

export interface CompactionResult {
  original: number;
  compacted: number;
  removed: number;
  contradictions: string[];
}

// Compact lessons
export function compact(): CompactionResult {
  if (!fs.existsSync(LESSONS_PATH)) {
    return { original: 0, compacted: 0, removed: 0, contradictions: [] };
  }
  
  const content = fs.readFileSync(LESSONS_PATH, 'utf-8');
  const lessons = content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as Lesson);
  
  // Group by pattern
  const byPattern = new Map<string, Lesson[]>();
  for (const lesson of lessons) {
    const existing = byPattern.get(lesson.pattern) || [];
    existing.push(lesson);
    byPattern.set(lesson.pattern, existing);
  }
  
  const contradictions: string[] = [];
  const compacted: Lesson[] = [];
  
  // For each pattern, keep highest confidence or merge
  for (const [pattern, patternLessons] of byPattern) {
    // Sort by confidence descending
    patternLessons.sort((a, b) => b.confidence - a.confidence);
    
    // Check for contradictions (same pattern, opposite outcomes)
    const outcomes = new Set(patternLessons.map(l => l.outcome));
    if (outcomes.has('success') && outcomes.has('failure')) {
      contradictions.push(pattern);
    }
    
    // Keep highest confidence, merge outcomes
    const best = { ...patternLessons[0] };
    const successCount = patternLessons.filter(l => l.outcome === 'success').length;
    const failCount = patternLessons.filter(l => l.outcome === 'failure').length;
    
    // Update confidence based on aggregate
    if (successCount + failCount > 1) {
      best.confidence = successCount / (successCount + failCount);
    }
    
    best.id = crypto.randomUUID(); // New ID for merged
    compacted.push(best);
  }
  
  // Write compacted
  const compactedContent = compacted.map(l => JSON.stringify(l)).join('\n') + '\n';
  fs.writeFileSync(COMPACTED_PATH, compactedContent);
  
  return {
    original: lessons.length,
    compacted: compacted.length,
    removed: lessons.length - compacted.length,
    contradictions,
  };
}

// Get contradictions
export function getContradictions(): string[] {
  if (!fs.existsSync(LESSONS_PATH)) return [];
  
  const content = fs.readFileSync(LESSONS_PATH, 'utf-8');
  const lessons = content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as Lesson);
  
  const byPattern = new Map<string, Set<string>>();
  for (const lesson of lessons) {
    const outcomes = byPattern.get(lesson.pattern) || new Set();
    outcomes.add(lesson.outcome);
    byPattern.set(lesson.pattern, outcomes);
  }
  
  const contradictions: string[] = [];
  for (const [pattern, outcomes] of byPattern) {
    if (outcomes.has('success') && outcomes.has('failure')) {
      contradictions.push(pattern);
    }
  }
  
  return contradictions;
}

// Prune old lessons
export function prune(daysToKeep = 30): number {
  if (!fs.existsSync(LESSONS_PATH)) return 0;
  
  const content = fs.readFileSync(LESSONS_PATH, 'utf-8');
  const lessons = content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as Lesson);
  
  const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
  const filtered = lessons.filter(l => new Date(l.timestamp).getTime() > cutoff);
  
  const newContent = filtered.map(l => JSON.stringify(l)).join('\n') + '\n';
  fs.writeFileSync(LESSONS_PATH, newContent);
  
  return lessons.length - filtered.length;
}

import crypto from 'crypto';