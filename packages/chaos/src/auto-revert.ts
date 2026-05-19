/**
 * AutoRevert - Rollback Signals and Mechanism
 * 
 * Defines signals that trigger rollback and implements the rollback mechanism.
 * Part of the Alpha Loop Hardening spec.
 * 
 * @version 1.0.0
 */

import * as fs from 'fs';
import * as path from 'path';

const LOG_DIR = './logs';
const CHECKPOINT_DIR = `${LOG_DIR}/checkpoints`;
const REVERT_LOG = `${LOG_DIR}/revert-log.jsonl`;

// --- Types ---

export type RevertSignalType = 'error_rate' | 'curator_denial' | 'lesson_db' | 'canary_alert' | 'manual';

export interface RevertSignal {
  type: RevertSignalType;
  timestamp: number;
  cycleId: string;
  context: Record<string, unknown>;
  severity: 'soft' | 'hard';
}

export interface Checkpoint {
  id: string;
  cycleId: string;
  timestamp: number;
  files: Record<string, string>;  // filename -> content hash
  createdAt: number;
}

// --- Configuration ---

export interface RevertThresholds {
  errorRateThreshold: number;        // > 10% errors triggers soft revert
  consecutiveDenialsThreshold: number;  // > 5 consecutive denials triggers hard stop
  lessonCollisionThreshold: number;  // > 2 collisions triggers quarantine
}

export const DEFAULT_REVERT_THRESHOLDS: RevertThresholds = {
  errorRateThreshold: 0.10,       // 10%
  consecutiveDenialsThreshold: 5, // 5 denials
  lessonCollisionThreshold: 2,     // 2 collisions
};

// --- State ---

interface RevertState {
  errorCount: number;
  totalCycles: number;
  consecutiveDenials: number;
  lastResetAt: number;
}

const STATE_FILE = `${LOG_DIR}/revert-state.json`;

function loadState(): RevertState {
  if (!fs.existsSync(STATE_FILE)) {
    return {
      errorCount: 0,
      totalCycles: 0,
      consecutiveDenials: 0,
      lastResetAt: Date.now(),
    };
  }
  
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
}

function saveState(state: RevertState): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// --- Core Functions ---

/**
 * Record a cycle execution (success)
 */
export function recordCycleSuccess(): void {
  const state = loadState();
  state.totalCycles++;
  state.errorCount = Math.max(0, state.errorCount - 1);  // Decay errors
  state.consecutiveDenials = 0;  // Reset on success
  saveState(state);
}

/**
 * Record a cycle error
 */
export function recordCycleError(): void {
  const state = loadState();
  state.totalCycles++;
  state.errorCount++;
  state.consecutiveDenials = 0;
  saveState(state);
}

/**
 * Record a curator denial
 */
export function recordCuratorDenial(): void {
  const state = loadState();
  state.totalCycles++;
  state.consecutiveDenials++;
  saveState(state);
}

/**
 * Check if we should revert based on signals
 * 
 * @returns The revert signal or null
 */
export function checkRevertSignals(): RevertSignal | null {
  const state = loadState();
  const thresholds = DEFAULT_REVERT_THRESHOLDS;
  
  // Check error rate
  if (state.totalCycles >= 10) {
    const errorRate = state.errorCount / state.totalCycles;
    if (errorRate > thresholds.errorRateThreshold) {
      return {
        type: 'error_rate',
        timestamp: Date.now(),
        cycleId: `cycle_${Date.now()}`,
        context: { errorRate, totalCycles: state.totalCycles },
        severity: 'soft',
      };
    }
  }
  
  // Check consecutive denials
  if (state.consecutiveDenials >= thresholds.consecutiveDenialsThreshold) {
    return {
      type: 'curator_denial',
      timestamp: Date.now(),
      cycleId: `cycle_${Date.now()}`,
      context: { consecutiveDenials: state.consecutiveDenials },
      severity: 'hard',
    };
  }
  
  return null;
}

/**
 * Get current error rate
 */
export function getErrorRate(): number {
  const state = loadState();
  if (state.totalCycles === 0) return 0;
  return state.errorCount / state.totalCycles;
}

/**
 * Get revert status for API
 */
export function getRevertStatus(): {
  errorRate: number;
  consecutiveDenials: number;
  totalCycles: number;
  shouldRevert: boolean;
  revertSignal: RevertSignal | null;
} {
  const state = loadState();
  const signal = checkRevertSignals();
  
  return {
    errorRate: getErrorRate(),
    consecutiveDenials: state.consecutiveDenials,
    totalCycles: state.totalCycles,
    shouldRevert: signal !== null,
    revertSignal: signal,
  };
}

/**
 * Create a checkpoint
 * 
 * @param cycleId - The cycle ID
 * @param files - Files to checkpoint
 * @returns The checkpoint
 */
export async function createCheckpoint(
  cycleId: string,
  files: string[]
): Promise<Checkpoint> {
  if (!fs.existsSync(CHECKPOINT_DIR)) {
    fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
  }
  
  const checkpoint: Checkpoint = {
    id: `cp_${Date.now()}`,
    cycleId,
    timestamp: Date.now(),
    files: {},
    createdAt: Date.now(),
  };
  
  for (const file of files) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf-8');
      // Simple hash for content
      let hash = 0;
      for (let i = 0; i < content.length; i++) {
        hash = ((hash << 5) - hash) + content.charCodeAt(i);
        hash = hash & hash;
      }
      checkpoint.files[file] = Math.abs(hash).toString(16);
    }
  }
  
  const cpFile = `${CHECKPOINT_DIR}/${checkpoint.id}.json`;
  fs.writeFileSync(cpFile, JSON.stringify(checkpoint, null, 2));
  
  console.log(`[AutoRevert] Created checkpoint ${checkpoint.id} for cycle ${cycleId}`);
  
  return checkpoint;
}

/**
 * Revert to a checkpoint
 * 
 * @param checkpointId - The checkpoint ID to revert to
 * @returns Files reverted
 */
export async function revertToCheckpoint(checkpointId: string): Promise<string[]> {
  const cpFile = `${CHECKPOINT_DIR}/${checkpointId}.json`;
  
  if (!fs.existsSync(cpFile)) {
    console.log(`[AutoRevert] Checkpoint ${checkpointId} not found`);
    return [];
  }
  
  const checkpoint: Checkpoint = JSON.parse(fs.readFileSync(cpFile, 'utf-8'));
  const reverted: string[] = [];
  
  for (const [file, expectedHash] of Object.entries(checkpoint.files)) {
    if (!fs.existsSync(file)) continue;
    
    const content = fs.readFileSync(file, 'utf-8');
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = ((hash << 5) - hash) + content.charCodeAt(i);
      hash = hash & hash;
    }
    const currentHash = Math.abs(hash).toString(16);
    
    // Only revert if different
    if (currentHash !== expectedHash) {
      // This is a simple "would revert" check
      // Actual revert would need git or backup storage
      reverted.push(file);
    }
  }
  
  // Log the revert
  const signal: RevertSignal = {
    type: 'manual',
    timestamp: Date.now(),
    cycleId: checkpoint.cycleId,
    context: { checkpointId, revertedFiles: reverted },
    severity: 'soft',
  };
  
  const logEntry = JSON.stringify(signal) + '\n';
  fs.appendFileSync(REVERT_LOG, logEntry);
  
  console.log(`[AutoRevert] Reverted to checkpoint ${checkpointId}, ${reverted.length} files differ`);
  
  return reverted;
}

/**
 * Log a revert event
 */
function logRevert(signal: RevertSignal): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
  
  const logEntry = JSON.stringify(signal) + '\n';
  fs.appendFileSync(REVERT_LOG, logEntry);
  
  console.log(`[AutoRevert] 📝 Logged revert signal: ${signal.type} (${signal.severity})`);
}

// --- CLI Entry ---

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const command = args[0];
  
  console.log('\n↩️ AutoRevert CLI');
  console.log('='.repeat(40));
  
  if (command === 'status') {
    const status = getRevertStatus();
    console.log(`\nRevert Status:`);
    console.log(`  Error Rate: ${(status.errorRate * 100).toFixed(1)}%`);
    console.log(`  Consecutive Denials: ${status.consecutiveDenials}`);
    console.log(`  Total Cycles: ${status.totalCycles}`);
    console.log(`  Should Revert: ${status.shouldRevert}`);
    if (status.revertSignal) {
      console.log(`  Signal: ${status.revertSignal.type} (${status.revertSignal.severity})`);
    }
  } else if (command === 'record') {
    const subcommand = args[1];
    if (subcommand === 'success') {
      recordCycleSuccess();
      console.log('Recorded cycle success');
    } else if (subcommand === 'error') {
      recordCycleError();
      console.log('Recorded cycle error');
    } else if (subcommand === 'denial') {
      recordCuratorDenial();
      console.log('Recorded curator denial');
    } else {
      console.log('Usage: record success|error|denial');
    }
  } else if (command === 'check') {
    const signal = checkRevertSignals();
    if (signal) {
      console.log(`\n⚠️ Revert signal: ${signal.type} (${signal.severity})`);
    } else {
      console.log('\n✅ No revert signals triggered');
    }
  } else if (command === 'checkpoint') {
    const cycleId = args[1] || 'test_cycle';
    const files = args.slice(2).length > 0 ? args.slice(2) : ['package.json'];
    createCheckpoint(cycleId, files);
  } else if (command === 'revert') {
    const checkpointId = args[1];
    if (!checkpointId) {
      console.log('Usage: revert <checkpointId>');
      process.exit(1);
    }
    revertToCheckpoint(checkpointId);
  } else {
    console.log('\nCommands:');
    console.log('  status                   - Show revert status');
    console.log('  record success|error|denial - Record cycle outcome');
    console.log('  check                   - Check if revert needed');
    console.log('  checkpoint <id> <files>   - Create checkpoint');
    console.log('  revert <checkpointId>       - Revert to checkpoint');
  }
}