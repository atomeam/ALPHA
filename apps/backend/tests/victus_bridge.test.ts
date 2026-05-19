/**
 * VictusBridge - Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { 
  VictusBridge,
  createVictusBridge,
  VictusBridgeConfig,
  VictusCommand,
  VictusResponse,
  HealthStatus,
} from '@aether/backend';

// Mock logger for testing
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

describe('VictusBridge', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with default config', () => {
      const bridge = new VictusBridge({ runtimeUrl: 'http://localhost:8080' });
      expect(bridge).toBeDefined();
    });

    it('should create instance with custom config', () => {
      const config: VictusBridgeConfig = {
        runtimeUrl: 'http://localhost:8080',
        healthCheckEndpoint: '/status',
        commandEndpoint: '/run',
        timeout: 5000,
        retries: 2,
      };
      const bridge = new VictusBridge(config, mockLogger);
      expect(bridge).toBeDefined();
    });

    it('should create instance with custom logger', () => {
      const bridge = new VictusBridge({ runtimeUrl: 'http://localhost:8080' }, mockLogger);
      expect(bridge).toBeDefined();
    });
  });

  describe('isInitialized', () => {
    it('should return false before initialization', () => {
      const bridge = new VictusBridge({ runtimeUrl: 'http://localhost:8080' });
      expect(bridge.isInitialized()).toBe(false);
    });
  });

  describe('isReady', () => {
    it('should return false before initialization', () => {
      const bridge = new VictusBridge({ runtimeUrl: 'http://localhost:8080' });
      expect(bridge.isReady()).toBe(false);
    });
  });

  describe('getConfig', () => {
    it('should return config object', () => {
      const config: VictusBridgeConfig = {
        runtimeUrl: 'http://localhost:8080',
        healthCheckEndpoint: '/health',
        commandEndpoint: '/execute',
      };
      const bridge = new VictusBridge(config);
      const retrievedConfig = bridge.getConfig();
      
      expect(retrievedConfig.runtimeUrl).toBe('http://localhost:8080');
      expect(retrievedConfig.healthCheckEndpoint).toBe('/health');
      expect(retrievedConfig.commandEndpoint).toBe('/execute');
    });
  });

  describe('getState', () => {
    it('should return state object', () => {
      const bridge = new VictusBridge({ runtimeUrl: 'http://localhost:8080' });
      const state = bridge.getState();
      
      expect(state).toHaveProperty('initialized');
      expect(state).toHaveProperty('ready');
    });
  });

  describe('checkHealth', () => {
    it('should return healthy status when health check succeeds', async () => {
      const bridge = new VictusBridge({ runtimeUrl: 'http://localhost:8080' }, mockLogger);
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ uptime: 3600 }),
      } as Response);

      const health: HealthStatus = await bridge.checkHealth();
      
      expect(health.healthy).toBe(true);
      expect(health.uptime).toBe(3600);
    });

    it('should return unhealthy status when health check fails', async () => {
      const bridge = new VictusBridge({ runtimeUrl: 'http://localhost:8080' }, mockLogger);
      
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
      } as Response);

      const health: HealthStatus = await bridge.checkHealth();
      
      expect(health.healthy).toBe(false);
    });

    it('should return unhealthy when fetch throws', async () => {
      const bridge = new VictusBridge({ runtimeUrl: 'http://localhost:8080' }, mockLogger);
      
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const health: HealthStatus = await bridge.checkHealth();
      
      expect(health.healthy).toBe(false);
    });
  });

  describe('forwardCommand', () => {
    it('should return error when not initialized', async () => {
      const bridge = new VictusBridge({ runtimeUrl: 'http://localhost:8080' }, mockLogger);
      
      const command: VictusCommand = {
        operation: 'read_file',
        args: { path: '/test.txt' },
      };

      const response: VictusResponse = await bridge.forwardCommand(command);
      
      expect(response.success).toBe(false);
      expect(response.error).toBe('VictusBridge not initialized');
    });

    it('should format command request correctly', async () => {
      const bridge = new VictusBridge({ runtimeUrl: 'http://localhost:8080' }, mockLogger);
      
      // Initialize by mocking health check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'ok' }),
      } as Response);

      await bridge.initialize();

      // Mock command execution
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: 'file content' }),
      } as Response);

      const command: VictusCommand = {
        operation: 'read_file',
        args: { path: '/test.txt' },
      };

      const response: VictusResponse = await bridge.forwardCommand(command);
      
      expect(response.success).toBe(true);
      expect(response.statusCode).toBe(200);
    });

    it('should handle command execution errors', async () => {
      const bridge = new VictusBridge({ runtimeUrl: 'http://localhost:8080' }, mockLogger);
      
      // Initialize
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'ok' }),
      } as Response);

      await bridge.initialize();

      // Mock failed command
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal error' }),
      } as Response);

      const command: VictusCommand = {
        operation: 'execute',
        args: { command: 'invalid' },
      };

      const response: VictusResponse = await bridge.forwardCommand(command);
      
      expect(response.success).toBe(false);
    });
  });

  describe('readFile', () => {
    it('should call forwardCommand with read_file operation', async () => {
      const bridge = new VictusBridge({ runtimeUrl: 'http://localhost:8080' }, mockLogger);
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'ok' }),
      } as Response);

      await bridge.initialize();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'file content' }),
      } as Response);

      const response: VictusResponse = await bridge.readFile('/test.txt');
      
      expect(response.success).toBe(true);
    });
  });

  describe('writeFile', () => {
    it('should call forwardCommand with write_file operation', async () => {
      const bridge = new VictusBridge({ runtimeUrl: 'http://localhost:8080' }, mockLogger);
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'ok' }),
      } as Response);

      await bridge.initialize();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      } as Response);

      const response: VictusResponse = await bridge.writeFile('/test.txt', 'content');
      
      expect(response.success).toBe(true);
    });
  });

  describe('executeCommand', () => {
    it('should call forwardCommand with execute operation', async () => {
      const bridge = new VictusBridge({ runtimeUrl: 'http://localhost:8080' }, mockLogger);
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'ok' }),
      } as Response);

      await bridge.initialize();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ output: 'ls -la' }),
      } as Response);

      const response: VictusResponse = await bridge.executeCommand('ls -la');
      
      expect(response.success).toBe(true);
    });
  });
});

describe('createVictusBridge factory', () => {
  it('should create VictusBridge with default config', () => {
    const bridge = createVictusBridge();
    expect(bridge).toBeDefined();
  });

  it('should create VictusBridge with custom runtime URL', () => {
    const bridge = createVictusBridge('http://custom:9090');
    const config = bridge.getConfig();
    
    expect(config.runtimeUrl).toBe('http://custom:9090');
  });

  it('should create VictusBridge with custom logger', () => {
    const bridge = createVictusBridge('http://localhost:8080', mockLogger);
    expect(bridge).toBeDefined();
  });
});