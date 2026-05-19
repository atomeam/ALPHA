/**
 * BlastRadiusCap - Per-Cycle Limits for Alpha Execution
 * 
 * Implements blast-radius caps to contain the impact of any single Alpha execution.
 * Part of the Alpha Loop Hardening spec.
 * 
 * @version 1.0.0
 */

import * as fs from 'fs';
import * as path from 'path';

const LOG_DIR = './logs';

// --- Configuration ---

export interface BlastRadiusCaps {
  maxFilesTouchedPerCycle: number;
  maxSurfacesWrittenPerCycle: number;
  maxConcurrentProposals: number;
  maxCyclesPerDay: number;
}

export const DEFAULT_CAPS: BlastRadiusCaps = {
  maxFilesTouchedPerCycle: 5,
  maxSurfacesWrittenPerCycle: 3,
  maxConcurrentProposals: 2,
  maxCyclesPerDay: 20,
};

// --- State Tracking ---

interface CycleState {
  filesTouched: string[];
  surfacesWritten: string[];
  cyclesExecutedToday: number;
  lastCycleDate: string;
}

const CYCLE_STATE_FILE = `${LOG_DIR}/cycle-state.json`;

function loadState(): CycleState {
  const today = new Date().toISOString().split('T')[0];
  
  if (!fs.existsSync(CYCLE_STATE_FILE)) {
    return {
      filesTouched: [],
      surfacesWritten: [],
      cyclesExecutedToday: 0,
      lastCycleDate: today,
    };
  }
  
  const state: CycleState = JSON.parse(fs.readFileSync(CYCLE_STATE_FILE, 'utf-8'));
  
  // Reset daily counter if new day
  if (state.lastCycleDate !== today) {
    state.cyclesExecutedToday = 0;
    state.lastCycleDate = today;
    state.filesTouched = [];
    state.surfacesWritten = [];
  }
  
  return state;
}

function saveState(state: CycleState): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
  fs.writeFileSync(CYCLE_STATE_FILE, JSON.stringify(state, null, 2));
}

// --- Core Functions ---

export interface CapCheckResult {
  allowed: boolean;
  reason: string;
  currentLoad: {
    filesTouched: number;
    surfacesWritten: number;
    cyclesExecutedToday: number;
  };
}

/**
 * Check if a proposed execution exceeds blast-radius caps
 * 
 * @param filesToTouch - Files that would be modified
 * @param surfacesToWrite - Surfaces that would be written to
 * @param caps - Optional custom caps (defaults to DEFAULT_CAPS)
 * @returns CapCheckResult with allow/deny and reason
 */
export function checkBlastRadius(
  filesToTouch: string[],
  surfacesToWrite: string[],
  caps: BlastRadiusCaps = DEFAULT_CAPS
): CapCheckResult {
  const state = loadState();
  
  const filesAfterTouch = state.filesTouched.length + filesToTouch.length;
  const surfacesAfterWrite = state.surfacesWritten.length + surfacesToWrite.length;
  
  // Check each cap
  if (filesAfterTouch > caps.maxFilesTouchedPerCycle) {
    return {
      allowed: false,
      reason: `FILES_CAP_EXCEEDED: Would touch ${filesAfterTouch} files, max is ${caps.maxFilesTouchedPerCycle}`,
      currentLoad: {
        filesTouched: state.filesTouched.length,
        surfacesWritten: state.surfacesWritten.length,
        cyclesExecutedToday: state.cyclesExecutedToday,
      },
    };
  }
  
  if (surfacesAfterWrite > caps.maxSurfacesWrittenPerCycle) {
    return {
      allowed: false,
      reason: `SURFACES_CAP_EXCEEDED: Would write ${surfacesAfterWrite} surfaces, max is ${caps.maxSurfacesWrittenPerCycle}`,
      currentLoad: {
        filesTouched: state.filesTouched.length,
        surfacesWritten: state.surfacesWritten.length,
        cyclesExecutedToday: state.cyclesExecutedToday,
      },
    };
  }
  
  if (state.cyclesExecutedToday >= caps.maxCyclesPerDay) {
    return {
      allowed: false,
      reason: `DAILY_CYCLE_LIMIT: ${state.cyclesExecutedToday} cycles already executed today, max is ${caps.maxCyclesPerDay}`,
      currentLoad: {
        filesTouched: state.filesTouched.length,
        surfacesWritten: state.surfacesWritten.length,
        cyclesExecutedToday: state.cyclesExecutedToday,
      },
    };
  }
  
  return {
    allowed: true,
    reason: 'Within blast-radius caps',
    currentLoad: {
      filesTouched: state.filesTouched.length,
      surfacesWritten: state.surfacesWritten.length,
      cyclesExecutedToday: state.cyclesExecutedToday,
    },
  };
}

/**
 * Record a completed cycle (call after execution)
 * 
 * @param filesTouched - Files that were modified
 * @param surfacesWritten - Surfaces that were written to
 */
export function recordCycle(
  filesTouched: string[],
  surfacesWritten: string[]
): void {
  const state = loadState();
  
  // Add new files/surfaces to state
  for (const file of filesTouched) {
    if (!state.filesTouched.includes(file)) {
      state.filesTouched.push(file);
    }
  }
  
  for (const surface of surfacesWritten) {
    if (!state.surfacesWritten.includes(surface)) {
      state.surfacesWritten.push(surface);
    }
  }
  
  state.cyclesExecutedToday++;
  
  saveState(state);
}

/**
 * Reset cycle state (for testing or manual reset)
 */
export function resetCycleState(): void {
  const today = new Date().toISOString().split('T')[0];
  const state: CycleState = {
    filesTouched: [],
    surfacesWritten: [],
    cyclesExecutedToday: 0,
    lastCycleDate: today,
  };
  saveState(state);
  console.log('[BlastRadius] Cycle state reset');
}

/**
 * Get current cap status
 */
export function getCapStatus(): CapCheckResult {
  const state = loadState();
  return {
    allowed: true,
    reason: 'Status query',
    currentLoad: {
      filesTouched: state.filesTouched.length,
      surfacesWritten: state.surfacesWritten.length,
      cyclesExecutedToday: state.cyclesExecutedToday,
    },
  };
}

// --- CLI Entry ---

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const command = args[0];
  
  console.log('\n⚡ BlastRadius Cap CLI');
  console.log('='.repeat(40));
  
  if (command === 'status') {
    const status = getCapStatus();
    console.log('\nCurrent Load:');
    console.log(`  Files touched: ${status.currentLoad.filesTouched} / ${DEFAULT_CAPS.maxFilesTouchedPerCycle}`);
    console.log(`  Surfaces written: ${status.currentLoad.surfacesWritten} / ${DEFAULT_CAPS.maxSurfacesWrittenPerCycle}`);
    console.log(`  Cycles today: ${status.currentLoad.cyclesExecutedToday} / ${DEFAULT_CAPS.maxCyclesPerDay}`);
  } else if (command === 'reset') {
    resetCycleState();
  } else if (command === 'check') {
    const files = args.slice(1);
    const result = checkBlastRadius(files, files);
    if (result.allowed) {
      console.log(`\n✅ ${result.reason}`);
    } else {
      console.log(`\n❌ ${result.reason}`);
    }
  } else {
    console.log('\nCommands:');
    console.log('  status          - Show current cap status');
    console.log('  reset           - Reset cycle state');
    console.log('  check <files>  - Check if files would exceed caps');
  }
}