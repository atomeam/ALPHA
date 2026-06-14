/**
 * Context Truncation
 * 
 * Automatically strip intermediate tool outputs from active sessions.
 * Keeps token usage tight and prevents attention drift.
 */

import { z } from 'zod';

// Truncation options
export interface TruncateOptions {
  maxToolOutputLength: number;
  keepFirstN: number;
  keepLastN: number;
  compressRepeated: boolean;
}

export const DEFAULT_TRUNCATE_OPTIONS: TruncateOptions = {
  maxToolOutputLength: 2000,
  keepFirstN: 3,
  keepLastN: 3,
  compressRepeated: true,
};

// Session context
export interface ToolExecution {
  tool: string;
  args: Record<string, unknown>;
  output?: string;
  status: 'pending' | 'running' | 'success' | 'failure';
  timestamp: number;
}

// Session state
export interface SessionContext {
  id: string;
  steps: ToolExecution[];
  truncatedCount: number;
  tokensSaved: number;
}

// Truncate a single tool output
export function truncateToolOutput(output: string, maxLength: number = 2000): string {
  if (output.length <= maxLength) return output;
  
  // Keep first and last chunks
  const headLength = Math.floor(maxLength / 2);
  const tailLength = maxLength - headLength - 50; // account for "..." 
  
  const head = output.slice(0, headLength);
  const tail = output.slice(-tailLength);
  
  return `${head}\n\n... [truncated ${output.length - maxLength} chars] ...\n\n${tail}`;
}

// Compress repeated tool outputs
export function compressRepeatedOutputs(steps: ToolExecution[]): ToolExecution[] {
  const unique: ToolExecution[] = [];
  const seen = new Map<string, number>();
  
  for (const step of steps) {
    const key = `${step.tool}:${JSON.stringify(step.args)}`;
    
    if (seen.has(key)) {
      // Update existing to mark repeated
      const idx = seen.get(key)!;
      if (unique[idx].status === 'success') {
        unique[idx].status = 'success'; // Already counted
      }
    } else {
      seen.set(key, unique.length);
      unique.push(step);
    }
  }
  
  return unique;
}

// Main truncation function
export function truncateContext(
  steps: ToolExecution[],
  options: Partial<TruncateOptions> = {}
): { truncatedSteps: ToolExecution[]; stats: { truncatedCount: number; tokensSaved: number } } {
  const opts = { ...DEFAULT_TRUNCATE_OPTIONS, ...options };
  
  let truncatedSteps = [...steps];
  let truncatedCount = 0;
  let originalLength = 0;
  let newLength = 0;
  
  // 1. Truncate tool outputs
  for (const step of truncatedSteps) {
    if (step.output) {
      originalLength += step.output.length;
      step.output = truncateToolOutput(step.output, opts.maxToolOutputLength);
      newLength += step.output.length;
      if (step.output.length < originalLength) truncatedCount++;
    }
  }
  
  // 2. Compress repeated outputs if enabled
  if (opts.compressRepeated) {
    truncatedSteps = compressRepeatedOutputs(truncatedSteps);
  }
  
  // 3. Keep first/last N if too many steps
  if (truncatedSteps.length > opts.keepFirstN + opts.keepLastN) {
    const head = truncatedSteps.slice(0, opts.keepFirstN);
    const tail = truncatedSteps.slice(-opts.keepLastN);
    truncatedSteps = [...head, { tool: '...', args: {}, output: `... [${truncatedSteps.length - opts.keepFirstN - opts.keepLastN} steps truncated]`, status: 'pending', timestamp: Date.now() }, ...tail];
    truncatedCount += truncatedSteps.length - head.length - tail.length;
  }
  
  // Estimate tokens saved (rough: 1 token ≈ 4 chars)
  const tokensSaved = Math.floor((originalLength - newLength) / 4);
  
  return {
    truncatedSteps,
    stats: {
      truncatedCount,
      tokensSaved,
    },
  };
}

// Quick check if context needs truncation
export function needsTruncation(steps: ToolExecution[], maxSteps = 20, maxOutput = 5000): boolean {
  if (steps.length > maxSteps) return true;
  
  for (const step of steps) {
    if (step.output && step.output.length > maxOutput) return true;
  }
  
  return false;
}