/**
 * Evaluator Loop
 * 
 * Watches the ledger for patterns and suggests fixes.
 * Runs on an interval, analyzing recent actions.
 */

import { readRecords } from '@aether/logger';
import type { ProposalRecord } from '@aether/logger';

interface EvalResult {
  pattern: string;
  suggestion: string;
  priority: 'high' | 'medium' | 'low';
}

// Common error patterns and fixes
const PATTERNS: Array<{ pattern: RegExp; suggestion: string; priority: 'high' | 'medium' | 'low' }> = [
  {
    pattern: /npm error/,
    suggestion: 'Check package.json dependencies and lockfile',
    priority: 'high'
  },
  {
    pattern: /E404.*@aether/,
    suggestion: 'Use file: dependencies instead of npm registry',
    priority: 'high'
  },
  {
    pattern: /command not found/,
    suggestion: 'Add dependency to devDependencies',
    priority: 'medium'
  },
  {
    pattern: /module not found/i,
    suggestion: 'Check imports and package.json exports',
    priority: 'medium'
  },
  {
    pattern: /422/i,
    suggestion: 'Check Curator allow-list or input validation',
    priority: 'low'
  }
];

// Analyze recent records for patterns
export async function evaluateLedger(since: number = 3600000): Promise<EvalResult[]> {
  const records = await readRecords(since);
  const results: EvalResult[] = [];
  
  for (const record of records) {
    // Skip successful records
    if (record.status === 'success') continue;
    
    const combined = `${record.error || record.result || ''}`.toLowerCase();
    
    for (const { pattern, suggestion, priority } of PATTERNS) {
      if (pattern.test(combined)) {
        results.push({
          pattern: pattern.source,
          suggestion,
          priority
        });
        break;
      }
    }
  }
  
  // Remove duplicates, sort by priority
  const unique = results.filter((v, i, a) => a.findIndex(t => t.pattern === v.pattern) === i);
  const order = { high: 0, medium: 1, low: 2 };
  unique.sort((a, b) => order[a.priority] - order[b.priority]);
  
  return unique;
}

// Get system health
export function getEvaluatorHealth() {
  return {
    status: 'running',
    patternCount: PATTERNS.length,
    watching: true
  };
}