/**
 * ALPHA OrchestrationBrain v0.1
 * 
 * Durable Object for orchestrating agent state transitions,
 * enforcing OCC invariants, and managing distributed agent states.
 * 
 * Part of: ALPHA Identity Model v0.1
 * Spec: /workspace/project/ALPHA/docs/ALPHA.md
 */

import { DurableObject } from "cloudflare:workers";

// ============================================================================
// Type Definitions
// ============================================================================

export interface AgentTransitionEvent {
  eventId: string;
  correlationId: string;
  timestamp: number;
  sourceAgent: string;
  transition: {
    fromState: string;
    toState: string;
    actionPerformed: string;
  };
  budget: {
    tokensUsed?: number;
    executionTimeMs: number;
  };
  payload: Record<string, unknown>;
}

export interface SystemStateSnapshot {
  version: number;
  status: "healthy" | "degraded" | "faulted";
  lastReconciliation: number;
  activeLocks: Record<string, { heldBy: string; acquiredAt: number }>;
  agentStates: Record<string, AgentState>;
}

export interface AgentState {
  status: string;
  currentTask: string | null;
  lastSeen: number;
  metadata?: Record<string, unknown>;
}

export interface TransitionResult {
  success: boolean;
  newVersion: number;
  error?: string;
  details?: Record<string, unknown>;
}

export interface LockInfo {
  heldBy: string;
  acquiredAt: number;
  correlationId: string;
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = "alpha_mesh_state";
const MAX_LOCK_AGE_MS = 30 * 60 * 1000; // 30 minutes max lock lifetime

const VALID_STATES = [
  "idle", "running", "waiting", "completed", 
  "failed", "blocked", "escalated"
] as const;

type ValidState = typeof VALID_STATES[number];

// ============================================================================
// OrchestrationBrain Durable Object
// ============================================================================

export class OrchestrationBrain extends DurableObject {
  private state: SystemStateSnapshot | null = null;
  private initializationPromise: Promise<void> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    
    // Block concurrency during initialization
    this.initializationPromise = this.initialize();
    this.ctx.blockConcurrencyWhile(async () => {
      await this.initializationPromise!;
    });
  }

  private async initialize(): Promise<void> {
    const stored = await this.ctx.storage.get<SystemStateSnapshot>(STORAGE_KEY);
    
    this.state = stored || {
      version: 1,
      status: "healthy",
      lastReconciliation: Date.now(),
      activeLocks: {},
      agentStates: {}
    };

    // Clean up stale locks on startup
    await this.cleanupStaleLocks();
  }

  /**
   * Main request handler
   */
  async fetch(request: Request): Promise<Response> {
    if (!this.state) {
      return this.errorResponse("NotInitialized", 500);
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      switch (pathname) {
        case "/state":
          return this.handleGetState(request);
        
        case "/transition":
          return this.handleTransition(request);
        
        case "/lock":
          return this.handleLock(request);
        
        case "/agents":
          return this.handleAgents(request);
        
        case "/health":
          return this.handleHealth();
        
        case "/reconcile":
          return this.handleReconcile(request);
        
        default:
          return this.errorResponse("NotFound", 404);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return this.errorResponse("InternalError", 500, message);
    }
  }

  // ============================================================================
  // State Read Operations
  // ============================================================================

  private handleGetState(_request: Request): Response {
    return new Response(JSON.stringify(this.state), {
      headers: { "Content-Type": "application/json" }
    });
  }

  private handleHealth(): Response {
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes
    
    // Check for stale agents
    const staleAgents = Object.entries(this.state!.agentStates)
      .filter(([_, state]) => now - state.lastSeen > staleThreshold)
      .map(([name]) => name);

    return new Response(JSON.stringify({
      status: this.state!.status,
      version: this.state!.version,
      activeAgents: Object.keys(this.state!.agentStates).length,
      activeLocks: Object.keys(this.state!.activeLocks).length,
      staleAgents: staleAgents.length > 0 ? staleAgents : undefined,
      lastReconciliation: this.state!.lastReconciliation
    }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  private handleAgents(request: Request): Response {
    const url = new URL(request.url);
    const agentId = url.searchParams.get("id");

    if (agentId) {
      const agentState = this.state!.agentStates[agentId];
      if (!agentState) {
        return this.errorResponse("AgentNotFound", 404);
      }
      return new Response(JSON.stringify({ [agentId]: agentState }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify(this.state!.agentStates), {
      headers: { "Content-Type": "application/json" }
    });
  }

  // ============================================================================
  // State Mutation Operations (OCC + Locking)
  // ============================================================================

  private async handleTransition(request: Request): Promise<Response> {
    // Parse event
    const event = await request.json() as AgentTransitionEvent;
    
    // Get headers
    const agentIdentity = request.headers.get("X-Agent-Identity") || event.sourceAgent;
    const clientExpectedVersion = this.parseExpectedVersion(request);
    
    // OCC Check (Invariant I1)
    if (clientExpectedVersion !== this.state!.version) {
      return this.conflictResponse(
        "StaleStateRevision",
        `Expected version ${clientExpectedVersion}, current ${this.state!.version}`
      );
    }

    // Validate transition
    const validation = this.validateTransition(event);
    if (!validation.valid) {
      return this.errorResponse(validation.error!, 400, validation.message);
    }

    // Process state transition
    const result = await this.processTransition(event, agentIdentity);
    
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" }
    });
  }

  private async processTransition(
    event: AgentTransitionEvent, 
    agentIdentity: string
  ): Promise<TransitionResult> {
    const lockKey = event.correlationId;

    // Check lock ownership
    const existingLock = this.state!.activeLocks[lockKey];
    if (existingLock && existingLock.heldBy !== agentIdentity) {
      return {
        success: false,
        newVersion: this.state!.version,
        error: "LockConflict",
        details: { heldBy: existingLock.heldBy, acquiredAt: existingLock.acquiredAt }
      };
    }

    // Mutate state
    this.state!.version += 1;
    this.state!.lastReconciliation = Date.now();

    // Handle lock lifecycle
    if (this.isTerminalState(event.transition.toState)) {
      // Release lock on terminal state
      delete this.state!.activeLocks[lockKey];
    } else {
      // Acquire or refresh lock
      this.state!.activeLocks[lockKey] = {
        heldBy: agentIdentity,
        acquiredAt: existingLock?.acquiredAt || Date.now()
      };
    }

    // Update agent state
    this.state!.agentStates[agentIdentity] = {
      status: event.transition.toState,
      currentTask: event.correlationId,
      lastSeen: Date.now(),
      metadata: event.payload
    };

    // Persist state
    await this.ctx.storage.put(STORAGE_KEY, this.state!);

    // Queue optional telemetry
    this.queueTelemetry(event);

    return {
      success: true,
      newVersion: this.state!.version
    };
  }

  // ============================================================================
  // Lock Management
  // ============================================================================

  private async handleLock(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "status";
    const correlationId = url.searchParams.get("id");

    if (action === "status" && correlationId) {
      const lock = this.state!.activeLocks[correlationId];
      return new Response(JSON.stringify({
        locked: !!lock,
        lock: lock || null
      }), { headers: { "Content-Type": "application/json" } });
    }

    if (action === "release" && correlationId) {
      const agentIdentity = request.headers.get("X-Agent-Identity") || "unknown";
      const lock = this.state!.activeLocks[correlationId];

      if (!lock) {
        return new Response(JSON.stringify({ released: false, reason: "NoLock" }), {
          headers: { "Content-Type": "application/json" }
        });
      }

      if (lock.heldBy !== agentIdentity) {
        return this.conflictResponse(
          "LockOwnership",
          `Lock held by ${lock.heldBy}`
        );
      }

      delete this.state!.activeLocks[correlationId];
      await this.ctx.storage.put(STORAGE_KEY, this.state!);

      return new Response(JSON.stringify({ released: true }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({
      activeLocks: this.state!.activeLocks
    }), { headers: { "Content-Type": "application/json" } });
  }

  // ============================================================================
  // Reconciliation
  // ============================================================================

  private async handleReconcile(_request: Request): Promise<Response> {
    await this.cleanupStaleLocks();
    
    // Update status based on lock health
    const lockCount = Object.keys(this.state!.activeLocks).length;
    if (lockCount > 50) {
      this.state!.status = "degraded";
    } else if (lockCount === 0) {
      this.state!.status = "healthy";
    }

    this.state!.lastReconciliation = Date.now();
    await this.ctx.storage.put(STORAGE_KEY, this.state!);

    return new Response(JSON.stringify({
      reconciled: true,
      status: this.state!.status,
      activeLocks: lockCount,
      version: this.state!.version
    }), { headers: { "Content-Type": "application/json" } });
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private parseExpectedVersion(request: Request): number {
    const header = request.headers.get("X-Expected-Version");
    return header ? parseInt(header, 10) : 0;
  }

  private validateTransition(event: AgentTransitionEvent): { valid: boolean; error?: string; message?: string } {
    // Check required fields
    if (!event.eventId || !event.correlationId || !event.sourceAgent) {
      return { valid: false, error: "InvalidPayload", message: "Missing required fields" };
    }

    // Validate states
    if (!VALID_STATES.includes(event.transition.fromState as ValidState) ||
        !VALID_STATES.includes(event.transition.toState as ValidState)) {
      return { 
        valid: false, 
        error: "InvalidState", 
        message: `Invalid state: ${event.transition.fromState} -> ${event.transition.toState}` 
      };
    }

    // Validate timestamp
    if (!event.timestamp || event.timestamp < 0) {
      return { valid: false, error: "InvalidTimestamp", message: "Invalid timestamp" };
    }

    return { valid: true };
  }

  private isTerminalState(state: string): boolean {
    return state === "completed" || state === "failed";
  }

  private async cleanupStaleLocks(): Promise<void> {
    const now = Date.now();
    const staleThreshold = MAX_LOCK_AGE_MS;

    for (const [key, lock] of Object.entries(this.state!.activeLocks)) {
      if (now - lock.acquiredAt > staleThreshold) {
        delete this.state!.activeLocks[key];
      }
    }

    await this.ctx.storage.put(STORAGE_KEY, this.state!);
  }

  private queueTelemetry(event: AgentTransitionEvent): void {
    // Placeholder for telemetry queue - can be enhanced with KV or Queue
    console.log(`[Telemetry] ${event.sourceAgent}: ${event.transition.fromState} -> ${event.transition.toState}`);
  }

  private errorResponse(error: string, status: number, message?: string): Response {
    return new Response(
      JSON.stringify({ error, ...(message && { details: message }) }), 
      { status, headers: { "Content-Type": "application/json" } }
    );
  }

  private conflictResponse(error: string, message: string): Response {
    return new Response(
      JSON.stringify({ error, message, currentVersion: this.state!.version }), 
      { status: 412, headers: { "Content-Type": "application/json" } }
    );
  }
}

// ============================================================================
// Environment Interface
// ============================================================================

interface Env {
  // Add bindings as needed: KV, Queues, etc.
  METRICS?: KVNamespace;
  TELEMETRY_QUEUE?: Queue<unknown>;
}