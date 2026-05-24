/**
 * Reflector Agent
 * 
 * The 6th step of Alpha: reflect.
 * Writes learned patterns to Lessons DB for self-improvement.
 */

import { writeLesson, getPatternConfidence, getPatternConfidences } from '@aether/lessons';
import type { Lesson } from '@aether/lessons';

export interface ReflectInput {
  pattern: string;
  suggestion: string;
  action: string;
  outcome: 'success' | 'failure' | 'noop';
  confidence: number;
  runId?: string;
}

// Write a lesson from a run
export async function reflect(input: ReflectInput) {
  const lesson = writeLesson({
    pattern: input.pattern,
    suggestion: input.suggestion,
    action: input.action,
    outcome: input.outcome,
    confidence: input.confidence,
    runId: input.runId,
  });
  
  return {
    lessonId: lesson.id,
    confidence: input.confidence,
  };
}

// Get confidence for a pattern (for Curator weighting)
export async function checkConfidence(pattern: string) {
  return getPatternConfidence(pattern);
}

// Get all pattern confidences
export async function getLearnedPatterns() {
  return getPatternConfidences();
}

// Health check
export function getReflectorHealth() {
  return {
    status: 'ready',
    lessons: 'append-only',
    queryable: true,
  };
}