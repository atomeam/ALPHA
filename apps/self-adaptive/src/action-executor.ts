/**
 * Action Executor - handles execution of planned actions
 */

import type { PlannedAction, ActionResult, ActionType } from './types';

export interface ActionHandler {
  type: ActionType;
  execute(params: Record<string, unknown>): Promise<ActionResult>;
}

export class ActionExecutor {
  private handlers: Map<ActionType, ActionHandler> = new Map();

  /**
   * Register an action handler
   */
  registerHandler(handler: ActionHandler): void {
    this.handlers.set(handler.type, handler);
  }

  /**
   * Execute an action
   */
  async execute(action: PlannedAction): Promise<ActionResult> {
    const handler = this.handlers.get(action.type);
    
    if (!handler) {
      return {
        actionId: action.id,
        success: false,
        executedAt: Date.now(),
        durationMs: 0,
        error: `No handler registered for action type: ${action.type}`,
      };
    }

    const startTime = Date.now();
    
    try {
      const result = await handler.execute(action.parameters);
      return {
        ...result,
        actionId: action.id,
        executedAt: Date.now(),
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        actionId: action.id,
        success: false,
        executedAt: Date.now(),
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute multiple actions
   */
  async executeAll(actions: PlannedAction[]): Promise<ActionResult[]> {
    return Promise.all(actions.map(action => this.execute(action)));
  }
}

// Pre-built action handlers

export class ScaleUpHandler implements ActionHandler {
  type = 'scale_up';

  async execute(params: Record<string, unknown>): Promise<Partial<ActionResult>> {
    // In a real implementation, this would interact with:
    // - Cloudflare Workers scaling API
    // - Kubernetes HPA
    // - Or other orchestration platform
    
    console.log('Executing scale_up with params:', params);
    
    return {
      success: true,
      output: 'Scaled up successfully',
    };
  }
}

export class ClearCacheHandler implements ActionHandler {
  type = 'clear_cache';

  async execute(params: Record<string, unknown>): Promise<Partial<ActionResult>> {
    console.log('Executing clear_cache with params:', params);
    
    return {
      success: true,
      output: 'Cache cleared successfully',
    };
  }
}

export class SendAlertHandler implements ActionHandler {
  type = 'send_alert';

  async execute(params: Record<string, unknown>): Promise<Partial<ActionResult>> {
    console.log('Executing send_alert with params:', params);
    
    // In a real implementation, this would send to:
    // - Slack webhook
    // - PagerDuty
    // - Email
    // - etc.
    
    return {
      success: true,
      output: 'Alert sent successfully',
    };
  }
}

export class RestartServiceHandler implements ActionHandler {
  type = 'restart_service';

  async execute(params: Record<string, unknown>): Promise<Partial<ActionResult>> {
    console.log('Executing restart_service with params:', params);
    
    return {
      success: true,
      output: 'Service restarted successfully',
    };
  }
}