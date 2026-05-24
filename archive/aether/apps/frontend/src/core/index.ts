/**
 * Core Module Exports
 * 
 * Centralized access point for all core modules.
 */

export { 
  IntegrationManager,
  createIntegrationManager,
  type IntegrationConfig,
  type IntegrationState,
  type RouteRequest,
  type RouteResponse,
  type HttpMethod,
  type Logger,
  // MCP types
  type MCPRequest,
  type MCPJSONRPCRequest,
  type MCPJSONRPCResponse,
  type MCPClient,
} from './integration_manager';

// VictusBridge exports
export {
  VictusBridge,
  createVictusBridge,
  type VictusBridgeConfig,
  type VictusCommand,
  type VictusResponse,
  type HealthStatus,
  type VictusBridgeState,
  type Logger as VictusLogger,
} from './victus_bridge';

// Orchestrator exports
export {
  Orchestrator,
  createOrchestrator,
  type OrchestratorStep,
  type OrchestratorConfig,
  type OrchestratorResult,
  type PlanResult,
  type OrchestratorState,
  type StepType,
  type StepStatus,
  type Logger as OrchestratorLogger,
} from './orchestrator';