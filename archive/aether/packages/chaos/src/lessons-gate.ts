/**
 * LessonsGate - Collision Check for Proposal Validation
 * 
 * Validates proposals against Lessons DB to prevent redundancy.
 * Part of the ALPHA Gate workflow (§4.5).
 */

import * as fs from 'fs';
import * as path from 'path';

const LOG_DIR = './logs';
const LESSONS_LOG = `${LOG_DIR}/lessons.jsonl`;

// --- Types ---

export interface Proposal {
  id: string;
  title: string;
  type: string;
  inputs_hash_neighborhood?: string;
  filesOrPagesTouched?: string[];
}

export interface LessonsGateResult {
  passed: boolean;
  reason: 'NONE' | 'CUR_DO_NOT_REPEAT' | 'APP_LESSON_COLLISION';
  similarityScore?: number;
  matchedLessons?: string[];
}

// --- Core Logic ---

/**
 * Validates a Proposal against the Lessons DB.
 * 
 * @param proposal - The proposal to validate
 * @param stage - 'CURATOR' (initial check) or 'SHADOW_APPLY' (pre-write check)
 * @returns LessonsGateResult with pass/fail and reason
 */
export async function checkLessonsGate(
  proposal: Proposal,
  stage: 'CURATOR' | 'SHADOW_APPLY' = 'CURATOR'
): Promise<LessonsGateResult> {
  // Extract hash neighborhood from proposal
  const hashNeighborhood = proposal.inputs_hash_neighborhood || 
    generateHashNeighborhood(proposal.filesOrPagesTouched || []);
  
  // Check for collisions
  const matches = await queryLessonsDB(hashNeighborhood);
  
  if (matches.length > 0) {
    return {
      passed: false,
      reason: stage === 'CURATOR' ? 'CUR_DO_NOT_REPEAT' : 'APP_LESSON_COLLISION',
      matchedLessons: matches.map(m => m.id),
    };
  }
  
  return { passed: true, reason: 'NONE' };
}

// --- Helpers ---

function generateHashNeighborhood(filesOrPagesTouched: string[]): string {
  // Generate prefix hash from affected files
  if (!filesOrPagesTouched.length) return 'unknown';
  
  const combined = filesOrPagesTouched.join(':');
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).substring(0, 6);
}

async function queryLessonsDB(hashNeighborhood: string): Promise<Lesson[]> {
  if (!fs.existsSync(LESSONS_LOG)) return [];
  
  const lines = fs.readFileSync(LESSONS_LOG, 'utf-8').split('\n').filter(Boolean);
  const lessons = lines.map(line => JSON.parse(line));
  
  // Match prefix or exact
  return lessons.filter(lesson => 
    lesson['Hash neighborhood']?.startsWith(hashNeighborhood.substring(0, 3)) ||
    lesson['Inputs hash neighborhood']?.startsWith(hashNeighborhood.substring(0, 3))
  );
}

interface Lesson {
  id: string;
  'Hash neighborhood'?: string;
  'Inputs hash neighborhood'?: string;
  outcome?: string;
  filesAffected?: string[];
  timestamp: number;
}

// --- Export for CLI ---

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('\n🛡️ LessonsGate CLI');
  console.log('='.repeat(40));
  console.log('\nCommands:');
  console.log('  check <proposal-id>   - Check proposal against Lessons DB');
  console.log('  list               - List all lessons');
  console.log('\nExample:');
  console.log('  node packages/chaos/src/lessons-gate.ts check prop_001');
}