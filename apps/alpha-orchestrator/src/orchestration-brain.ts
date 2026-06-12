/**
 * ALPHA OrchestrationBrain v0.2 — Event-Sourced Kernel
 * Hardened Durable Object with FSM, TTL locks, idempotency
 */

// Import DurableObject from cloudflare workers runtime

// For local dev with wrangler, we use the global export
import { DurableObject } from 'cloudflare:workers';

// ============================================================================
// Type Definitions
// ============================================================================

type AgentState = 'idle' | 'running' | 'waiting' | 'blocked' | 'completed' | 'failed' | 'escalated';

const VALID_TRANSITIONS: Record<AgentState, AgentState[]> = {
  idle: ['running'],
  running: ['completed', 'failed', 'blocked', 'waiting'],
  waiting: ['running', 'failed'],
  blocked: ['running', 'failed'],
  completed: [],
  failed: [],
  escalated: ['running', 'failed'],
};

interface AgentTransitionEvent {
  eventId: string;
  correlationId: string;
  timestamp: number;
  sourceAgent: string;
  transition: {
    fromState: AgentState;
    toState: AgentState;
    actionPerformed: string;
  };
  budget: {
    tokensUsed?: number;
    executionTimeMs: number;
  };
  payload: Record<string, unknown>;
}

interface EventLogEntry {
  eventId: string;
  correlationId: string;
  timestamp: number;
  sourceAgent: string;
  transition: {
    fromState: AgentState;
    toState: AgentState;
    actionPerformed: string;
  };
  version: number;
  metadata?: Record<string, unknown>;
}

interface SystemStateSnapshot {
  version: number;
  status: 'healthy' | 'degraded' | 'faulted';
  lastReconciliation: number;
  activeLocks: Record<string, LockEntry>;
  agentStates: Record<string, AgentStateEntry>;
}

interface LockEntry {
  heldBy: string;
  acquiredAt: number;
  expiresAt: number;
  correlationId: string;
}

interface AgentStateEntry {
  status: AgentState;
  currentTask: string | null;
  lastSeen: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_STATE_KEY = 'alpha_mesh_state';
const STORAGE_EVENT_LOG_KEY = 'alpha_event_log';
const MAX_EVENT_LOG_SIZE = 1000;
const DEFAULT_LOCK_TTL_MS = 5 * 60 * 1000;

// ============================================================================
// OrchestrationBrain Durable Object
// ============================================================================

export class OrchestrationBrain extends DurableObject {
  private initialized = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    const state = await this.ctx.storage.get<SystemStateSnapshot>(STORAGE_STATE_KEY);
    if (!state) {
      await this.ctx.storage.put(STORAGE_STATE_KEY, {
        version: 1,
        status: 'healthy',
        lastReconciliation: Date.now(),
        activeLocks: {},
        agentStates: {},
      });
    }
    this.initialized = true;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      switch (pathname) {
        case '/state':
          return this.handleGetState();
        case '/transition':
          return this.handleTransition(request);
        case '/transition/idempotent':
          return this.handleTransitionIdempotent(request);
        case '/lock':
          return this.handleLock(request);
        case '/agents':
          return this.handleAgents();
        case '/health':
          return this.handleHealth();
        case '/reconcile':
          return this.handleReconcile();
        case '/events':
          return this.handleEventLog(request);
        case '/snapshot':
          return this.handleSnapshot();
        default:
          return this.errorResponse('NotFound', 404);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return this.errorResponse('InternalError', 500, message);
    }
  }

  private async handleGetState(): Promise<Response> {
    await this.ensureInitialized();
    const state = await this.ctx.storage.get<SystemStateSnapshot>(STORAGE_STATE_KEY);
    if (!state) {
      return this.errorResponse('StateNotFound', 404);
    }
    const cleanedState = this.cleanStaleLocksSync(state);
    return new Response(JSON.stringify(cleanedState), {
      headers: { 'Content-Type': 'application/json', 'X-Version': String(cleanedState.version) },
    });
  }

  private async handleHealth(): Promise<Response> {
    const state = await this.ctx.storage.get<SystemStateSnapshot>(STORAGE_STATE_KEY);
    if (!state) {
      return new Response(JSON.stringify({ status: 'uninitialized', version: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const now = Date.now();
    const staleAgents = Object.entries(state.agentStates)
      .filter(([_, entry]) => now - entry.lastSeen > 5 * 60 * 1000)
      .map(([name]) => name);
    const staleLocks = Object.entries(state.activeLocks)
      .filter(([_, lock]) => now > lock.expiresAt)
      .map(([id]) => id);
    return new Response(
      JSON.stringify({
        status: state.status,
        version: state.version,
        activeAgents: Object.keys(state.agentStates).length,
        activeLocks: Object.keys(state.activeLocks).length,
        staleAgents: staleAgents.length > 0 ? staleAgents : undefined,
        staleLocks: staleLocks.length > 0 ? staleLocks : undefined,
        lastReconciliation: state.lastReconciliation,
      }),
      {
        headers: { 'Content-Type': 'application/json', 'X-Version': String(state.version) },
      },
    );
  }

  private async handleAgents(): Promise<Response> {
    const state = await this.ctx.storage.get<SystemStateSnapshot>(STORAGE_STATE_KEY);
    if (!state) {
      return this.errorResponse('StateNotFound', 404);
    }
    return new Response(JSON.stringify(state.agentStates), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async handleEventLog(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '100', 10);
    const events = await this.ctx.storage.get<EventLogEntry[]>(STORAGE_EVENT_LOG_KEY);
    if (!events) {
      return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });
    }
    const recentEvents = events.slice(-limit).reverse();
    return new Response(JSON.stringify(recentEvents), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async handleTransition(request: Request): Promise<Response> {
    const event = (await request.json()) as AgentTransitionEvent;
    const agentIdentity = request.headers.get('X-Agent-Identity') || event.sourceAgent;

    const result = await this.ctx.storage.transaction(async (txn) => {
      const state = await txn.get<SystemStateSnapshot>(STORAGE_STATE_KEY);
      if (!state) {
        return { success: false, error: 'StateNotFound', newVersion: 0, eventLogged: false };
      }

      const validation = this.validateTransition(event);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          details: { message: validation.message },
          newVersion: state.version,
          eventLogged: false,
        };
      }

      const currentAgentState = state.agentStates[agentIdentity];
      if (currentAgentState && currentAgentState.status !== event.transition.fromState) {
        return {
          success: false,
          error: 'InvalidFromState',
          details: { expected: event.transition.fromState, actual: currentAgentState.status },
          newVersion: state.version,
          eventLogged: false,
        };
      }

      state.version += 1;
      state.lastReconciliation = Date.now();

      const lockKey = event.correlationId;
      if (this.isTerminalState(event.transition.toState)) {
        delete state.activeLocks[lockKey];
      } else {
        const existingLock = state.activeLocks[lockKey];
        state.activeLocks[lockKey] = {
          heldBy: agentIdentity,
          acquiredAt: existingLock?.acquiredAt || Date.now(),
          expiresAt: Date.now() + DEFAULT_LOCK_TTL_MS,
          correlationId: lockKey,
        };
      }

      state.agentStates[agentIdentity] = {
        status: event.transition.toState,
        currentTask: event.correlationId,
        lastSeen: Date.now(),
        metadata: event.payload,
      };

      await txn.put(STORAGE_STATE_KEY, state);

      const events = (await txn.get<EventLogEntry[]>(STORAGE_EVENT_LOG_KEY)) || [];
      events.push({
        eventId: event.eventId,
        correlationId: event.correlationId,
        timestamp: event.timestamp,
        sourceAgent: event.sourceAgent,
        transition: event.transition,
        version: state.version,
        metadata: event.payload,
      });
      while (events.length > MAX_EVENT_LOG_SIZE) events.shift();
      await txn.put(STORAGE_EVENT_LOG_KEY, events);

      return { success: true, newVersion: state.version, eventLogged: true };
    });

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 400,
      headers: { 'Content-Type': 'application/json', 'X-Version': String(result.newVersion) },
    });
  }

  private async handleTransitionIdempotent(request: Request): Promise<Response> {
    const event = (await request.json()) as AgentTransitionEvent;
    const events = await this.ctx.storage.get<EventLogEntry[]>(STORAGE_EVENT_LOG_KEY);
    if (events?.some((e) => e.eventId === event.eventId)) {
      const state = await this.ctx.storage.get<SystemStateSnapshot>(STORAGE_STATE_KEY);
      return new Response(
        JSON.stringify({
          success: true,
          newVersion: state?.version || 0,
          eventLogged: false,
          details: { idempotent: true, alreadyProcessed: event.eventId },
        }),
        {
          headers: { 'Content-Type': 'application/json', 'X-Version': String(state?.version || 0) },
        },
      );
    }
    return this.handleTransition(request);
  }

  private async handleLock(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'status';
    const correlationId = url.searchParams.get('id');
    const agentIdentity = request.headers.get('X-Agent-Identity') || 'unknown';

    const state = await this.ctx.storage.get<SystemStateSnapshot>(STORAGE_STATE_KEY);
    if (!state) {
      return this.errorResponse('StateNotFound', 404);
    }

    if (action === 'status' && correlationId) {
      const lock = state.activeLocks[correlationId];
      return new Response(
        JSON.stringify({
          locked: !!lock && Date.now() <= lock.expiresAt,
          lock: lock && Date.now() <= lock.expiresAt ? lock : null,
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (action === 'release' && correlationId) {
      const lock = state.activeLocks[correlationId];
      if (!lock) {
        return new Response(JSON.stringify({ released: false, reason: 'NoLock' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (lock.heldBy !== agentIdentity) {
        return new Response(
          JSON.stringify({ released: false, reason: 'LockOwnership', heldBy: lock.heldBy }),
          { status: 403, headers: { 'Content-Type': 'application/json' } },
        );
      }
      await this.ctx.storage.transaction(async (txn) => {
        const s = await txn.get<SystemStateSnapshot>(STORAGE_STATE_KEY);
        if (s) {
          delete s.activeLocks[correlationId];
          await txn.put(STORAGE_STATE_KEY, s);
        }
      });
      return new Response(JSON.stringify({ released: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (action === 'acquire') {
      const ttl = parseInt(url.searchParams.get('ttl') || String(DEFAULT_LOCK_TTL_MS), 10);
      const result = await this.ctx.storage.transaction(async (txn) => {
        const currentState = await txn.get<SystemStateSnapshot>(STORAGE_STATE_KEY);
        if (!currentState) return { acquired: false, reason: 'NoState' };
        if (currentState.activeLocks[correlationId!]) {
          const existingLock = currentState.activeLocks[correlationId!];
          if (Date.now() > existingLock.expiresAt) {
            delete currentState.activeLocks[correlationId!];
          } else if (existingLock.heldBy !== agentIdentity) {
            return {
              acquired: false,
              reason: 'LockHeld',
              heldBy: existingLock.heldBy,
              expiresAt: existingLock.expiresAt,
            };
          }
        }
        currentState.activeLocks[correlationId!] = {
          heldBy: agentIdentity,
          acquiredAt: Date.now(),
          expiresAt: Date.now() + ttl,
          correlationId: correlationId!,
        };
        await txn.put(STORAGE_STATE_KEY, currentState);
        return { acquired: true, expiresAt: Date.now() + ttl };
      });
      return new Response(JSON.stringify(result), {
        status: result.acquired ? 200 : 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ activeLocks: state.activeLocks }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async handleReconcile(): Promise<Response> {
    const result = await this.ctx.storage.transaction(async (txn) => {
      const state = await txn.get<SystemStateSnapshot>(STORAGE_STATE_KEY);
      if (!state) return { reconciled: false, reason: 'NoState' };
      let cleanedLocks = 0;
      const now = Date.now();
      for (const [key, lock] of Object.entries(state.activeLocks)) {
        if (now > lock.expiresAt) {
          delete state.activeLocks[key];
          cleanedLocks++;
        }
      }
      const lockCount = Object.keys(state.activeLocks).length;
      if (lockCount > 50) state.status = 'degraded';
      else if (lockCount === 0 && Object.keys(state.agentStates).length > 0)
        state.status = 'healthy';
      state.lastReconciliation = now;
      await txn.put(STORAGE_STATE_KEY, state);
      return {
        reconciled: true,
        status: state.status,
        activeLocks: lockCount,
        cleanedLocks,
        version: state.version,
      };
    });
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json', 'X-Version': String(result.version || 0) },
    });
  }

  private async handleSnapshot(): Promise<Response> {
    const state = await this.ctx.storage.get<SystemStateSnapshot>(STORAGE_STATE_KEY);
    if (!state) return this.errorResponse('StateNotFound', 404);
    const events = await this.ctx.storage.get<EventLogEntry[]>(STORAGE_EVENT_LOG_KEY);
    return new Response(
      JSON.stringify({
        snapshot: state,
        eventCount: events?.length || 0,
        latestEventId: events?.[events.length - 1]?.eventId,
      }),
      {
        headers: { 'Content-Type': 'application/json', 'X-Version': String(state.version) },
      },
    );
  }

  private validateTransition(event: AgentTransitionEvent): {
    valid: boolean;
    error?: string;
    message?: string;
  } {
    if (!event.eventId || !event.correlationId || !event.sourceAgent) {
      return { valid: false, error: 'InvalidPayload', message: 'Missing required fields' };
    }
    if (!event.timestamp || event.timestamp < 0) {
      return { valid: false, error: 'InvalidTimestamp', message: 'Invalid timestamp' };
    }
    const fromState = event.transition.fromState as AgentState;
    const toState = event.transition.toState as AgentState;
    if (!VALID_TRANSITIONS[fromState])
      return { valid: false, error: 'InvalidState', message: `Unknown fromState: ${fromState}` };
    if (!VALID_TRANSITIONS[toState])
      return { valid: false, error: 'InvalidState', message: `Unknown toState: ${toState}` };
    if (!VALID_TRANSITIONS[fromState].includes(toState)) {
      return {
        valid: false,
        error: 'InvalidTransition',
        message: `Illegal transition: ${fromState} -> ${toState}. Valid: ${VALID_TRANSITIONS[fromState].join(', ') || 'none'}`,
      };
    }
    return { valid: true };
  }

  private isTerminalState(state: AgentState): boolean {
    return state === 'completed' || state === 'failed';
  }

  private cleanStaleLocksSync(state: SystemStateSnapshot): SystemStateSnapshot {
    const now = Date.now();
    const cleaned: SystemStateSnapshot = { ...state, activeLocks: {} };
    for (const [key, lock] of Object.entries(state.activeLocks)) {
      if (now <= lock.expiresAt) cleaned.activeLocks[key] = lock;
    }
    return cleaned;
  }

  private errorResponse(error: string, status: number, message?: string): Response {
    return new Response(JSON.stringify({ error, ...(message && { message }) }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ============================================================================
// Environment Interface
// ============================================================================

interface Env {
  ORCHESTRATION_BRAIN?: DurableObjectNamespace;
  METRICS?: KVNamespace;
  TELEMETRY_QUEUE?: Queue<unknown>;
}
