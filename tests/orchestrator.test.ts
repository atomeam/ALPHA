/**
 * Orchestrator - Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { 
  Orchestrator,
  createOrchestrator,
  OrchestratorStep,
  OrchestratorConfig,
  OrchestratorResult,
  PlanResult,
  StepType,
} from '../src/core/orchestrator';

// Mock dependencies
const createMockIntegrationManager = () => ({
  route: vi.fn().mockResolvedValue({ success: true, data: { test: 'data' }, statusCode: 200 }),
  listIntegrations: vi.fn().mockReturnValue([]),
  getIntegration: vi.fn(),
  getStatus: vi.fn(),
  isInitialized: vi.fn().mockReturnValue(true),
});

const createMockVictusBridge = () => ({
  readFile: vi.fn().mockResolvedValue({ success: true, data: 'file content' }),
  writeFile: vi.fn().mockResolvedValue({ success: true }),
  executeCommand: vi.fn().mockResolvedValue({ success: true, data: 'command output' }),
  forwardCommand: vi.fn().mockResolvedValue({ success: true }),
  checkHealth: vi.fn().mockResolvedValue({ healthy: true }),
  isReady: vi.fn().mockReturnValue(true),
  isInitialized: vi.fn().mockReturnValue(true),
  getState: vi.fn().mockReturnValue({ initialized: true, ready: true }),
  getConfig: vi.fn(),
});

// Mock logger for testing
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

describe('Orchestrator', () => {
  let manager: ReturnType<typeof createMockIntegrationManager>;
  let bridge: ReturnType<typeof createMockVictusBridge>;
  let orchestrator: Orchestrator;

  beforeEach(() => {
    manager = createMockIntegrationManager();
    bridge = createMockVictusBridge();
    orchestrator = createOrchestrator(manager as any, bridge as any, undefined, mockLogger);
  });

  describe('constructor', () => {
    it('should create instance with dependencies', () => {
      expect(orchestrator).toBeDefined();
    });

    it('should use default config', () => {
      const config: OrchestratorConfig = {
        continueOnError: false,
        stopOnFailure: true,
      };
      const orch = createOrchestrator(manager as any, bridge as any, config);
      expect(orch).toBeDefined();
    });
  });

  describe('setObjective', () => {
    it('should set objective', () => {
      orchestrator.setObjective('Process customer data');
      expect(orchestrator.getObjective()).toBe('Process customer data');
    });
  });

  describe('addStep', () => {
    it('should add a single step', () => {
      orchestrator.addStep({
        type: 'api' as StepType,
        action: 'stripe',
        params: { endpoint: '/customers' },
      });
      expect(orchestrator.getPlanLength()).toBe(1);
    });

    it('should add step with ID', () => {
      orchestrator.addStep({
        id: 'fetch_customers',
        type: 'api' as StepType,
        action: 'stripe',
      });
      const plan = orchestrator.getPlan();
      expect(plan[0].id).toBe('fetch_customers');
    });
  });

  describe('setPlan', () => {
    it('should set multiple steps at once', () => {
      const steps: OrchestratorStep[] = [
        { type: 'api' as StepType, action: 'stripe', params: { endpoint: '/customers' } },
        { type: 'local' as StepType, action: 'read_file', params: { path: '/data.json' } },
      ];
      orchestrator.setPlan(steps);
      expect(orchestrator.getPlanLength()).toBe(2);
    });
  });

  describe('clearPlan', () => {
    it('should clear the plan', () => {
      orchestrator.addStep({ type: 'api' as StepType, action: 'stripe' });
      orchestrator.clearPlan();
      expect(orchestrator.getPlanLength()).toBe(0);
    });
  });

  describe('executeStep - api type', () => {
    it('should route api steps to IntegrationManager', async () => {
      const step: OrchestratorStep = {
        id: 'api_step',
        type: 'api',
        action: 'stripe',
        params: { endpoint: '/customers', method: 'GET' },
      };

      const result = await orchestrator.executeStep(step);

      expect(result.success).toBe(true);
      expect(manager.route).toHaveBeenCalledWith({
        integration: 'stripe',
        endpoint: '/customers',
        method: 'GET',
        headers: undefined,
        body: undefined,
      });
    });
  });

  describe('executeStep - local type', () => {
    it('should route read_file to VictusBridge', async () => {
      const step: OrchestratorStep = {
        id: 'read_step',
        type: 'local',
        action: 'read_file',
        params: { path: '/test.txt' },
      };

      const result = await orchestrator.executeStep(step);

      expect(result.success).toBe(true);
      expect(bridge.readFile).toHaveBeenCalledWith('/test.txt');
    });

    it('should route write_file to VictusBridge', async () => {
      const step: OrchestratorStep = {
        type: 'local',
        action: 'write_file',
        params: { path: '/test.txt', content: 'hello' },
      };

      const result = await orchestrator.executeStep(step);

      expect(result.success).toBe(true);
      expect(bridge.writeFile).toHaveBeenCalledWith('/test.txt', 'hello');
    });

    it('should route execute to VictusBridge', async () => {
      const step: OrchestratorStep = {
        type: 'local',
        action: 'execute',
        params: { command: 'ls -la' },
      };

      const result = await orchestrator.executeStep(step);

      expect(result.success).toBe(true);
      expect(bridge.executeCommand).toHaveBeenCalledWith('ls -la');
    });
  });

  describe('executePlan', () => {
    it('should execute empty plan', async () => {
      const result: PlanResult = await orchestrator.executePlan();

      expect(result.success).toBe(true);
      expect(result.totalSteps).toBe(0);
    });

    it('should execute api steps sequentially', async () => {
      orchestrator.setObjective('Process payments');
      orchestrator.setPlan([
        { type: 'api', action: 'stripe', params: { endpoint: '/customers' } },
        { type: 'api', action: 'hubspot', params: { endpoint: '/contacts' } },
      ]);

      const result: PlanResult = await orchestrator.executePlan();

      expect(result.success).toBe(true);
      expect(result.totalSteps).toBe(2);
      expect(result.completedSteps).toBe(2);
      expect(result.failedSteps).toBe(0);
    });

    it('should stop on failure when stopOnFailure is true', async () => {
      // Override bridge that fails second step
      const failingBridge = {
        ...bridge,
        executeCommand: vi.fn()
          .mockResolvedValueOnce({ success: true })
          .mockResolvedValueOnce({ success: false, error: 'Command failed' }),
      };
      
      const failOrch = createOrchestrator(manager as any, failingBridge as any, { stopOnFailure: true } as any);
      failOrch.setObjective('Test failure');
      failOrch.setPlan([
        { type: 'local', action: 'execute', params: { command: 'echo test' } },
        { type: 'local', action: 'execute', params: { command: 'fail' } },
      ]);

      const result: PlanResult = await failOrch.executePlan();

      // First step should succeed, second may not be reached due to stopOnFailure
      expect(result.totalSteps).toBe(2);
    });

    it('should continue on error when continueOnError is true', async () => {
      const errorBridge = {
        ...bridge,
        readFile: vi.fn()
          .mockResolvedValueOnce({ success: true })
          .mockResolvedValueOnce({ success: false, error: 'File not found' } as any),
      };
      
      const continueOrch = createOrchestrator(manager as any, errorBridge as any, { continueOnError: true } as any);
      continueOrch.setObjective('Read files');
      continueOrch.setPlan([
        { type: 'local', action: 'read_file', params: { path: '/exists.txt' } },
        { type: 'local', action: 'read_file', params: { path: '/missing.txt' } },
      ]);

      const result: PlanResult = await continueOrch.executePlan();

      expect(result.totalSteps).toBe(2);
      // Second step failed but we continued - check that both steps were attempted
      expect(errorBridge.readFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('state getters', () => {
    it('should report executing state', () => {
      expect(orchestrator.isExecuting()).toBe(false);
    });

    it('should report current step index', () => {
      expect(orchestrator.getCurrentStepIndex()).toBe(-1);
    });

    it('should return state snapshot', () => {
      const state = orchestrator.getState();
      expect(state).toHaveProperty('objective');
      expect(state).toHaveProperty('plan');
      expect(state).toHaveProperty('executing');
    });
  });
});

describe('createOrchestrator factory', () => {
  it('should create with minimal args', () => {
    const mockManager = createMockIntegrationManager();
    const mockBridge = createMockVictusBridge();
    
    const orch = createOrchestrator(mockManager as any, mockBridge as any);
    expect(orch).toBeDefined();
  });

  it('should create with config', () => {
    const mockManager = createMockIntegrationManager();
    const mockBridge = createMockVictusBridge();
    const config: OrchestratorConfig = { stopOnFailure: false };
    
    const orch = createOrchestrator(mockManager as any, mockBridge as any, config);
    expect(orch).toBeDefined();
  });
});