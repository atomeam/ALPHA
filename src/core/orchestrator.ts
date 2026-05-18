/**
 * Orchestrator - Central Task Execution Service
 * 
 * Ties together IntegrationManager and VictusBridge into a single, cohesive task execution workflow.
 * Accepts an objective, maintains an internal plan array of steps, and provides an execution loop.
 */

import { fileURLToPath } from 'url';
import { IntegrationManager, RouteRequest, RouteResponse } from './integration_manager';
import { VictusBridge, VictusCommand, VictusResponse } from './victus_bridge';

const __filename = fileURLToPath(import.meta.url);
const __dirname = require('path').dirname(__filename);

// Types for Orchestrator
export type StepType = 'api' | 'local' | 'conditional';
export type StepStatus = 'pending' | 'completed' | 'failed' | 'skipped';

export interface OrchestratorStep {
  id?: string;
  type: StepType;
  action: string;
  params?: Record<string, unknown>;
  condition?: {
    // Condition for conditional steps
    dependsOn: string; // Step ID to check
    status: StepStatus;
    value?: unknown;
  };
  retry?: {
    maxAttempts: number;
    backoffMs?: number;
  };
}

export interface OrchestratorConfig {
  continueOnError?: boolean;
  stopOnFailure?: boolean;
  defaultTimeout?: number;
}

export interface OrchestratorResult {
  stepId?: string;
  success: boolean;
  data?: unknown;
  error?: string;
  duration?: number;
  timestamp: Date;
}

export interface PlanResult {
  objective: string;
  steps: OrchestratorResult[];
  success: boolean;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  duration: number;
}

export interface OrchestratorState {
  objective: string;
  plan: OrchestratorStep[];
  executing: boolean;
  currentStepIndex: number;
}

// Logger interface
export interface Logger {
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
  debug: (message: string, ...args: unknown[]) => void;
}

// Default console logger
const defaultLogger: Logger = {
  info: (message: string, ...args: unknown[]) => console.log(`[INFO] Orchestrator: ${message}`, ...args),
  warn: (message: string, ...args: unknown[]) => console.warn(`[WARN] Orchestrator: ${message}`, ...args),
  error: (message: string, ...args: unknown[]) => console.error(`[ERROR] Orchestrator: ${message}`, ...args),
  debug: (message: string, ...args: unknown[]) => console.log(`[DEBUG] Orchestrator: ${message}`, ...args),
};

/**
 * Orchestrator Class
 * 
 * Central orchestrator that sequences multi-step tasks across external APIs and local operations.
 */
export class Orchestrator {
  private integrationManager: IntegrationManager;
  private victusBridge: VictusBridge;
  private config: OrchestratorConfig;
  private state: OrchestratorState;
  private logger: Logger;

  /**
   * Create a new Orchestrator instance
   * @param integrationManager - IntegrationManager instance for external APIs
   * @param victusBridge - VictusBridge instance for local operations
   * @param config - Optional configuration
   * @param logger - Optional custom logger
   */
  constructor(
    integrationManager: IntegrationManager,
    victusBridge: VictusBridge,
    config?: OrchestratorConfig,
    logger?: Logger
  ) {
    this.integrationManager = integrationManager;
    this.victusBridge = victusBridge;
    this.config = config || {
      continueOnError: false,
      stopOnFailure: true,
      defaultTimeout: 30000,
    };
    this.logger = logger || defaultLogger;
    this.state = {
      objective: '',
      plan: [],
      executing: false,
      currentStepIndex: -1,
    };
  }

  /**
   * Set the mission objective
   * @param objective - Description of the objective/mission
   */
  setObjective(objective: string): void {
    this.state.objective = objective;
    this.logger.info(`Objective set: ${objective}`);
  }

  /**
   * Get current objective
   */
  getObjective(): string {
    return this.state.objective;
  }

  /**
   * Add a single step to the plan
   * @param step - The step to add
   */
  addStep(step: OrchestratorStep): void {
    // Assign ID if not provided
    const stepWithId = {
      ...step,
      id: step.id || `step_${this.state.plan.length}`,
    };
    this.state.plan.push(stepWithId);
    this.logger.info(`Added step: ${stepWithId.id} (${step.type}: ${step.action})`);
  }

  /**
   * Set entire plan at once
   * @param steps - Array of steps
   */
  setPlan(steps: OrchestratorStep[]): void {
    this.state.plan = steps.map((step, index) => ({
      ...step,
      id: step.id || `step_${index}`,
    }));
    this.logger.info(`Plan set with ${steps.length} steps`);
  }

  /**
   * Get current plan
   */
  getPlan(): OrchestratorStep[] {
    return [...this.state.plan];
  }

  /**
   * Clear the plan
   */
  clearPlan(): void {
    this.state.plan = [];
    this.logger.info('Plan cleared');
  }

  /**
   * Get plan length
   */
  getPlanLength(): number {
    return this.state.plan.length;
  }

  /**
   * Execute a single step via appropriate service
   * @param step - The step to execute
   * @returns Result of the execution
   */
  async executeStep(step: OrchestratorStep): Promise<OrchestratorResult> {
    const startTime = Date.now();
    const stepId = step.id || 'unknown';

    this.logger.info(`Executing step: ${stepId} (${step.type}: ${step.action})`);

    try {
      let result: unknown;

      if (step.type === 'api') {
        // Route to IntegrationManager
        const request: RouteRequest = {
          integration: step.action, // action is the integration name
          endpoint: (step.params?.endpoint as string) || '/',
          method: (step.params?.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH') || 'GET',
          headers: step.params?.headers as Record<string, string> | undefined,
          body: step.params?.body,
        };
        const response: RouteResponse = await this.integrationManager.route(request);
        result = response;
      } else if (step.type === 'local') {
        // Route to VictusBridge based on action
        const action = step.action;
        
        if (action === 'read_file') {
          const response = await this.victusBridge.readFile(step.params?.path as string);
          result = response;
        } else if (action === 'write_file') {
          const response = await this.victusBridge.writeFile(
            step.params?.path as string,
            step.params?.content as string
          );
          result = response;
        } else if (action === 'execute') {
          const response = await this.victusBridge.executeCommand(step.params?.command as string);
          result = response;
        } else {
          // Generic command forwarding
          const victusCommand: VictusCommand = {
            operation: action,
            args: step.params,
          };
          result = await this.victusBridge.forwardCommand(victusCommand);
        }
      } else if (step.type === 'conditional') {
        // Conditional steps handled by executePlan
        this.logger.debug(`Conditional step ${stepId} deferred to execution context`);
        result = { success: true, conditional: true };
      } else {
        throw new Error(`Unknown step type: ${step.type}`);
      }

      const duration = Date.now() - startTime;
      
      return {
        stepId,
        success: true,
        data: result,
        duration,
        timestamp: new Date(),
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.logger.error(`Step ${stepId} failed:`, errorMessage);
      
      return {
        stepId,
        success: false,
        error: errorMessage,
        duration,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Execute the entire plan sequentially
   * @returns Final result with all step results and summary
   */
  async executePlan(): Promise<PlanResult> {
    if (this.state.plan.length === 0) {
      return {
        objective: this.state.objective,
        steps: [],
        success: true,
        totalSteps: 0,
        completedSteps: 0,
        failedSteps: 0,
        duration: 0,
      };
    }

    this.state.executing = true;
    const startTime = Date.now();
    
    this.logger.info(`Executing plan: ${this.state.objective} (${this.state.plan.length} steps)`);

    const results: OrchestratorResult[] = [];
    let completedSteps = 0;
    let failedSteps = 0;

    for (let i = 0; i < this.state.plan.length; i++) {
      const step = this.state.plan[i];
      this.state.currentStepIndex = i;

      // Check if this is a conditional step
      if (step.type === 'conditional' && step.condition) {
        const dependsOnStep = results.find(r => r.stepId === step.condition?.dependsOn);
        const shouldSkip = dependsOnStep?.stepId && 
          (step.condition.status === 'completed' ? !dependsOnStep.success : dependsOnStep.success);
        
        if (shouldSkip) {
          results.push({
            stepId: step.id,
            success: true,
            data: { skipped: true, reason: 'condition_not_met' },
            duration: 0,
            timestamp: new Date(),
          });
          continue;
        }
      }

      // Handle retries if configured
      let attempts = 0;
      const maxAttempts = step.retry?.maxAttempts || 1;
      let stepResult: OrchestratorResult;
      
      do {
        stepResult = await this.executeStep(step);
        attempts++;
        
        if (!stepResult.success && attempts < maxAttempts) {
          const backoffMs = step.retry?.backoffMs || 1000;
          this.logger.warn(`Step ${step.id} failed, retrying in ${backoffMs}ms... (attempt ${attempts}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      } while (!stepResult.success && attempts < maxAttempts);

      results.push(stepResult);

      if (stepResult.success) {
        completedSteps++;
      } else {
        failedSteps++;
        
        // Stop on failure if configured
        if (this.config.stopOnFailure) {
          this.logger.warn(`Step ${step.id} failed, stopping execution`);
          break;
        }
      }
    }

    this.state.executing = false;
    const totalDuration = Date.now() - startTime;
    const success = failedSteps === 0 || this.config.continueOnError;

    this.logger.info(`Plan execution complete: ${completedSteps}/${this.state.plan.length} steps successful`);

    return {
      objective: this.state.objective,
      steps: results,
      success,
      totalSteps: this.state.plan.length,
      completedSteps,
      failedSteps,
      duration: totalDuration,
    };
  }

  /**
   * Check if currently executing
   */
  isExecuting(): boolean {
    return this.state.executing;
  }

  /**
   * Get current step index
   */
  getCurrentStepIndex(): number {
    return this.state.currentStepIndex;
  }

  /**
   * Get state snapshot
   */
  getState(): OrchestratorState {
    return { ...this.state };
  }
}

/**
 * Factory function to create a pre-configured Orchestrator
 */
export function createOrchestrator(
  integrationManager: IntegrationManager,
  victusBridge: VictusBridge,
  config?: OrchestratorConfig,
  logger?: Logger
): Orchestrator {
  return new Orchestrator(integrationManager, victusBridge, config, logger);
}

export default Orchestrator;