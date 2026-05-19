/**
 * @aether/curator - Default-deny security gate for generated UI
 * 
 * Inspects component actions before they are allowed to impact the UI surface.
 * Default-deny means: if it's not explicitly allowed, it's blocked.
 * 
 * @version 1.0.0
 */

import { type ComponentAction, ComponentActionSchema } from "@aether/contracts";
import { ALLOWED_TYPES, getEntry } from "@aether/components";

export interface CuratorVerdict {
  approved: boolean;
  reason: string;
  rejectedActionIds: string[];
}

/**
 * Strict vocabulary of component types allowed to mount.
 * Derived from @aether/components manifest (single source of truth).
 */
const ALLOWED_COMPONENT_TYPES = ALLOWED_TYPES;

/**
 * Maximum actions allowed in a single response to prevent DoS
 */
const MAX_ACTIONS_PER_RESPONSE = 10;

/**
 * Default-Deny Curator Gate
 * 
 * Inspects generated actions before they are allowed to impact the UI surface.
 * Blocks:
 * - Unauthorized component types (not in ALLOWED_COMPONENT_TYPES)
 * - Too many actions (rate limit)
 * - Malformed actions (fails Zod validation)
 * 
 * @param actions - Array of component actions from the generative engine
 * @returns CuratorVerdict - approval/rejection with reason
 */
export function curateActions(actions: unknown): CuratorVerdict {
  // Ensure we have an array
  const actionArray = Array.isArray(actions) ? actions : [actions];
  
  // Validate each action against the schema
  for (const action of actionArray) {
    const validation = ComponentActionSchema.safeParse(action);
    if (!validation.success) {
      return {
        approved: false,
        reason: "Schema Violation: Actions failed Zod validation",
        rejectedActionIds: [],
      };
    }
  }
  
  // Rate limit check
  if (actionArray.length > MAX_ACTIONS_PER_RESPONSE) {
    return {
      approved: false,
      reason: `Rate Limit: ${actionArray.length} actions exceed maximum of ${MAX_ACTIONS_PER_RESPONSE}`,
      rejectedActionIds: [],
    };
  }

  const rejectedActionIds: string[] = [];

  // Capability check against allow-list
  for (const action of actionArray) {
    if (action.action === 'ADD') {
      if (!ALLOWED_COMPONENT_TYPES.has(action.plan.type)) {
        rejectedActionIds.push(action.plan.id);
      }
    } else if (action.action === 'MODIFY') {
      if (action.plan.type && !ALLOWED_COMPONENT_TYPES.has(action.plan.type)) {
        rejectedActionIds.push(action.targetId);
      }
    }
    // REMOVE is allowed
  }

  if (rejectedActionIds.length > 0) {
    return {
      approved: false,
      reason: `Default-Deny: Unauthorized component types: ${rejectedActionIds.join(", ")}`,
      rejectedActionIds,
    };
  }

  return {
    approved: true,
    reason: "All actions clear security capability boundaries.",
    rejectedActionIds: [],
  };
}

/**
 * Log a curator verdict to the routing ledger
 * Stub - will be promoted to Logs DB in follow-up
 */
export function logCuratorVerdict(verdict: CuratorVerdict, prompt: string): void {
  const entry = {
    timestamp: new Date().toISOString(),
    verdict: verdict.approved ? 'APPROVED' : 'REJECTED',
    reason: verdict.reason,
    rejectedIds: verdict.rejectedActionIds,
    promptHash: prompt.slice(0, 32), // First 32 chars as identifier
  };
  console.log(`[CURATOR] ${JSON.stringify(entry)}`);
}