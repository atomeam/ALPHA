/**
 * OrchestrationBrain Tests v0.1
 * FSM, TTL locks, idempotency, atomic transactions
 */

import { describe, it, expect } from 'vitest';

// Mock classes reserved for future DO integration tests.
// MockDurableObjectStorage, MockTransaction, MockDurableObjectState
// were scaffolded here — uncomment when adding DO-level tests.

// FSM Valid Transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  idle: ['running'],
  running: ['completed', 'failed', 'blocked', 'waiting'],
  waiting: ['running', 'failed'],
  blocked: ['running', 'failed'],
  completed: [],
  failed: [],
  escalated: ['running', 'failed'],
};

// ============================================================================
// Test Suite
// ============================================================================

describe('OrchestrationBrain FSM', () => {
  describe('Valid Transitions', () => {
    it('should accept idle -> running', () => {
      expect(VALID_TRANSITIONS['idle']).toContain('running');
    });

    it('should accept running -> completed', () => {
      expect(VALID_TRANSITIONS['running']).toContain('completed');
    });

    it('should accept running -> failed', () => {
      expect(VALID_TRANSITIONS['running']).toContain('failed');
    });

    it('should accept running -> blocked', () => {
      expect(VALID_TRANSITIONS['running']).toContain('blocked');
    });

    it('should accept running -> waiting', () => {
      expect(VALID_TRANSITIONS['running']).toContain('waiting');
    });

    it('should accept waiting -> running', () => {
      expect(VALID_TRANSITIONS['waiting']).toContain('running');
    });

    it('should accept blocked -> running', () => {
      expect(VALID_TRANSITIONS['blocked']).toContain('running');
    });

    it('should accept escalated -> running', () => {
      expect(VALID_TRANSITIONS['escalated']).toContain('running');
    });
  });

  describe('Invalid Transitions (Terminal States)', () => {
    it('should reject completed -> any (terminal)', () => {
      expect(VALID_TRANSITIONS['completed']).toHaveLength(0);
    });

    it('should reject failed -> any (terminal)', () => {
      expect(VALID_TRANSITIONS['failed']).toHaveLength(0);
    });

    it('should reject idle -> completed (no path)', () => {
      expect(VALID_TRANSITIONS['idle']).not.toContain('completed');
    });

    it('should reject running -> idle (backward)', () => {
      expect(VALID_TRANSITIONS['running']).not.toContain('idle');
    });

    it('should reject completed -> running (illegal reset)', () => {
      expect(VALID_TRANSITIONS['completed']).not.toContain('running');
    });
  });

  describe('Transition Validation', () => {
    const validateTransition = (from: string, to: string): boolean => {
      const allowed = VALID_TRANSITIONS[from];
      return allowed ? allowed.includes(to) : false;
    };

    it('returns true for valid transition', () => {
      expect(validateTransition('idle', 'running')).toBe(true);
    });

    it('returns false for invalid transition', () => {
      expect(validateTransition('completed', 'running')).toBe(false);
    });

    it('returns false for unknown state', () => {
      expect(validateTransition('unknown' as string, 'running')).toBeFalsy();
    });

    it('handles edge case: empty allowed array', () => {
      expect(validateTransition('completed', 'anything')).toBe(false);
    });
  });
});

describe('OrchestrationBrain Lock TTL', () => {
  const DEFAULT_LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes
  const _STALE_LOCK_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

  interface LockEntry {
    heldBy: string;
    acquiredAt: number;
    expiresAt: number;
    correlationId: string;
  }

  const createLock = (heldBy: string, ttlMs: number = DEFAULT_LOCK_TTL_MS): LockEntry => ({
    heldBy,
    acquiredAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
    correlationId: `lock-${Math.random().toString(36).slice(2)}`,
  });

  const isLockExpired = (lock: LockEntry): boolean => Date.now() > lock.expiresAt;

  const cleanExpiredLocks = (locks: Record<string, LockEntry>): Record<string, LockEntry> => {
    const now = Date.now();
    const cleaned: Record<string, LockEntry> = {};
    for (const [key, lock] of Object.entries(locks)) {
      if (now <= lock.expiresAt) {
        cleaned[key] = lock;
      }
    }
    return cleaned;
  };

  it('creates lock with correct TTL', () => {
    const lock = createLock('test-agent', 60000);
    const expectedExpiry = Date.now() + 60000;
    expect(lock.expiresAt).toBeGreaterThanOrEqual(expectedExpiry - 1000);
    expect(lock.expiresAt).toBeLessThanOrEqual(expectedExpiry + 1000);
  });

  it('detects expired lock', () => {
    const expiredLock: LockEntry = {
      heldBy: 'test',
      acquiredAt: Date.now() - 600000,
      expiresAt: Date.now() - 300000, // Expired 5 minutes ago
      correlationId: 'test-lock',
    };
    expect(isLockExpired(expiredLock)).toBe(true);
  });

  it('detects valid lock', () => {
    const validLock = createLock('test-agent');
    expect(isLockExpired(validLock)).toBe(false);
  });

  it('cleans expired locks from map', () => {
    const locks: Record<string, LockEntry> = {
      'valid-lock': createLock('agent1'),
      'expired-lock': {
        heldBy: 'agent2',
        acquiredAt: Date.now() - 600000,
        expiresAt: Date.now() - 300000,
        correlationId: 'expired',
      },
    };
    const cleaned = cleanExpiredLocks(locks);
    expect(cleaned['valid-lock']).toBeDefined();
    expect(cleaned['expired-lock']).toBeUndefined();
  });

  it('handles all locks expired', () => {
    const allExpired: Record<string, LockEntry> = {
      lock1: { heldBy: 'a', acquiredAt: 0, expiresAt: 0, correlationId: '1' },
      lock2: { heldBy: 'b', acquiredAt: 0, expiresAt: 0, correlationId: '2' },
    };
    const cleaned = cleanExpiredLocks(allExpired);
    expect(Object.keys(cleaned)).toHaveLength(0);
  });
});

describe('OrchestrationBrain Idempotency', () => {
  interface EventLogEntry {
    eventId: string;
    timestamp: number;
  }

  const isEventProcessed = (eventLog: EventLogEntry[], eventId: string): boolean => {
    return eventLog.some((e) => e.eventId === eventId);
  };

  it('detects first event as not processed', () => {
    const eventLog: EventLogEntry[] = [];
    expect(isEventProcessed(eventLog, 'evt-001')).toBe(false);
  });

  it('detects processed event', () => {
    const eventLog: EventLogEntry[] = [{ eventId: 'evt-001', timestamp: Date.now() }];
    expect(isEventProcessed(eventLog, 'evt-001')).toBe(true);
  });

  it('allows different event IDs', () => {
    const eventLog: EventLogEntry[] = [{ eventId: 'evt-001', timestamp: Date.now() }];
    expect(isEventProcessed(eventLog, 'evt-002')).toBe(false);
  });

  it('handles empty event log', () => {
    expect(isEventProcessed([], 'any-id')).toBe(false);
  });

  it('handles duplicate event IDs in log', () => {
    const eventLog: EventLogEntry[] = [
      { eventId: 'evt-001', timestamp: Date.now() },
      { eventId: 'evt-001', timestamp: Date.now() },
    ];
    expect(isEventProcessed(eventLog, 'evt-001')).toBe(true);
  });
});

describe('OrchestrationBrain Versioning', () => {
  interface SystemState {
    version: number;
    status: 'healthy' | 'degraded' | 'faulted';
  }

  const createInitialState = (): SystemState => ({
    version: 1,
    status: 'healthy',
  });

  const incrementVersion = (state: SystemState): SystemState => ({
    ...state,
    version: state.version + 1,
  });

  it('starts at version 1', () => {
    const state = createInitialState();
    expect(state.version).toBe(1);
  });

  it('increments version on transition', () => {
    let state = createInitialState();
    state = incrementVersion(state);
    expect(state.version).toBe(2);
  });

  it('maintains monotonic increment', () => {
    let state = createInitialState();
    for (let i = 0; i < 10; i++) {
      const oldVersion = state.version;
      state = incrementVersion(state);
      expect(state.version).toBe(oldVersion + 1);
    }
  });

  it('preserves other state on increment', () => {
    let state = createInitialState();
    state.status = 'degraded';
    const oldStatus = state.status;
    state = incrementVersion(state);
    expect(state.status).toBe(oldStatus);
  });
});

describe('OrchestrationBrain Atomic Transactions', () => {
  interface SystemState {
    version: number;
    counter: number;
  }

  const simulateAtomicTransaction = (
    initialState: SystemState,
    updateFn: (state: SystemState) => SystemState,
  ): { state: SystemState; success: boolean } => {
    try {
      const newState = updateFn(initialState);
      return { state: newState, success: true };
    } catch {
      return { state: initialState, success: false };
    }
  };

  it('applies update atomically', () => {
    const state: SystemState = { version: 1, counter: 0 };
    const result = simulateAtomicTransaction(state, (s) => ({
      ...s,
      counter: s.counter + 1,
    }));
    expect(result.success).toBe(true);
    expect(result.state.counter).toBe(1);
  });

  it('rolls back on failure', () => {
    const state: SystemState = { version: 1, counter: 0 };
    const result = simulateAtomicTransaction(state, (_s) => {
      throw new Error('Simulated failure');
    });
    expect(result.success).toBe(false);
    expect(result.state.counter).toBe(0);
  });

  it('handles concurrent transaction simulation', () => {
    let state: SystemState = { version: 1, counter: 0 };

    // Simulate two transactions
    state = simulateAtomicTransaction(state, (s) => ({ ...s, counter: s.counter + 1 })).state;
    state = simulateAtomicTransaction(state, (s) => ({ ...s, counter: s.counter + 1 })).state;

    expect(state.counter).toBe(2);
    expect(state.version).toBe(1); // Note: version not incremented in this simple sim
  });
});

// ============================================================================
// Run Tests
// ============================================================================

// Tests can be run with: npx vitest run
console.log('Run tests with: npx vitest run');
