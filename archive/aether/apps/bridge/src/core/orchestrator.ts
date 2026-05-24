import { IntegrationManager } from './integration_manager';
import { VictusBridge } from './victus_bridge';

/**
 * Orchestrator - stub for @aether/bridge  
 * The actual orchestration logic lives in apps/backend
 */
export class Orchestrator {
  constructor(
    _integrationManager?: IntegrationManager,
    _victusBridge?: VictusBridge,
    _config?: { stopOnFailure?: boolean }
  ) {}
  
  setObjective(_objective: string) {}
  
  setPlan(_plan: unknown[]) {}
  
  async executePlan() {
    return { steps: [], success: true };
  }
}