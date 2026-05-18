/**
 * VictusBridge - Orchestration Client for Local Victus Runtime
 * 
 * Acts as an orchestration client connecting the IntegrationManager to a local Victus runtime.
 * Provides a standardized interface for forwarding commands and file operations from Alpha to the local environment.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Types for VictusBridge configuration and requests/responses
export interface VictusBridgeConfig {
  runtimeUrl: string;
  healthCheckEndpoint?: string;
  commandEndpoint?: string;
  timeout?: number;
  retries?: number;
}

export interface VictusCommand {
  operation: string;
  args?: Record<string, unknown>;
  sourceFile?: string;
  destinationFile?: string;
  options?: Record<string, unknown>;
}

export interface VictusResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  statusCode?: number;
  timestamp?: Date;
}

export interface HealthStatus {
  healthy: boolean;
  status?: string;
  uptime?: number;
  version?: string;
  checks?: Record<string, boolean>;
}

export interface VictusBridgeState {
  initialized: boolean;
  ready: boolean;
  lastHealthCheck?: Date;
  error?: string;
}

// Logger interface (same as IntegrationManager)
export interface Logger {
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
  debug: (message: string, ...args: unknown[]) => void;
}

// Default console logger
const defaultLogger: Logger = {
  info: (message: string, ...args: unknown[]) => console.log(`[INFO] VictusBridge: ${message}`, ...args),
  warn: (message: string, ...args: unknown[]) => console.warn(`[WARN] VictusBridge: ${message}`, ...args),
  error: (message: string, ...args: unknown[]) => console.error(`[ERROR] VictusBridge: ${message}`, ...args),
  debug: (message: string, ...args: unknown[]) => console.log(`[DEBUG] VictusBridge: ${message}`, ...args),
};

/**
 * VictusBridge Class
 * 
 * Orchestration client that connects Alpha to a local Victus runtime at http://localhost:8080.
 * Provides standardized interface for forwarding commands and file operations.
 */
export class VictusBridge {
  private config: VictusBridgeConfig;
  private state: VictusBridgeState;
  private logger: Logger;
  private initialized: boolean = false;

  /**
   * Create a new VictusBridge instance
   * @param config - Configuration for the bridge
   * @param logger - Optional custom logger
   */
  constructor(config: VictusBridgeConfig, logger?: Logger) {
    this.config = {
      runtimeUrl: config.runtimeUrl || 'http://localhost:8080',
      healthCheckEndpoint: config.healthCheckEndpoint || '/health',
      commandEndpoint: config.commandEndpoint || '/execute',
      timeout: config.timeout || 30000,
      retries: config.retries || 3,
    };
    this.logger = logger || defaultLogger;
    this.state = {
      initialized: false,
      ready: false,
    };
  }

  /**
   * Initialize the bridge and verify connection to Victus runtime
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('VictusBridge already initialized');
      return;
    }

    this.logger.info(`Initializing bridge to ${this.config.runtimeUrl}`);
    
    try {
      // Verify connection with a health check
      const healthCheck = await this.checkHealth();
      
      if (healthCheck.healthy) {
        this.state.initialized = true;
        this.state.ready = true;
        this.state.lastHealthCheck = new Date();
        this.logger.info('VictusBridge initialized successfully');
      } else {
        throw new Error('Health check failed - runtime not ready');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.state.error = errorMessage;
      this.logger.error('Failed to initialize VictusBridge', errorMessage);
      throw error;
    }
  }

  /**
   * Forward a command to the Victus runtime for execution
   * @param command - The command to execute
   * @returns Response from the Victus runtime
   */
  async forwardCommand(command: VictusCommand): Promise<VictusResponse> {
    if (!this.state.initialized) {
      return {
        success: false,
        error: 'VictusBridge not initialized',
        statusCode: 500,
      };
    }

    const endpoint = `${this.config.runtimeUrl}${this.config.commandEndpoint}`;
    
    this.logger.info(`Forwarding command: ${command.operation}`);
    this.logger.debug('Command payload:', command);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(command),
        signal: AbortSignal.timeout(this.config.timeout || 30000),
      });

      const responseData = await response.json().catch(() => null);

      return {
        success: response.ok,
        data: responseData,
        statusCode: response.status,
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Command forwarding failed: ${command.operation}`, errorMessage);
      
      return {
        success: false,
        error: errorMessage,
        statusCode: 500,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Check system health status of the Victus runtime
   * @returns Health status information
   */
  async checkHealth(): Promise<HealthStatus> {
    const endpoint = `${this.config.runtimeUrl}${this.config.healthCheckEndpoint}`;
    
    this.logger.debug(`Checking health at ${endpoint}`);

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // Short timeout for health checks
      });

      if (response.ok) {
        const data = await response.json().catch(() => null);
        
        this.state.lastHealthCheck = new Date();
        this.state.ready = true;
        
        return {
          healthy: true,
          status: 'operational',
          ...(typeof data === 'object' ? data as Record<string, unknown> : {}),
        } as HealthStatus;
      } else {
        return {
          healthy: false,
          status: `HTTP ${response.status}`,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn('Health check failed:', errorMessage);
      
      return {
        healthy: false,
        status: errorMessage,
      };
    }
  }

  /**
   * Read a file from the local filesystem via Victus
   * @param filePath - Path to the file to read
   * @returns File contents
   */
  async readFile(filePath: string): Promise<VictusResponse> {
    return this.forwardCommand({
      operation: 'read_file',
      args: { path: filePath },
    });
  }

  /**
   * Write content to a file via Victus
   * @param filePath - Path to write to
   * @param content - Content to write
   * @returns Response
   */
  async writeFile(filePath: string, content: string): Promise<VictusResponse> {
    return this.forwardCommand({
      operation: 'write_file',
      args: { path: filePath, content },
    });
  }

  /**
   * Execute a shell command via Victus
   * @param command - Command to execute
   * @returns Response
   */
  async executeCommand(command: string): Promise<VictusResponse> {
    return this.forwardCommand({
      operation: 'execute',
      args: { command },
    });
  }

  /**
   * Check if the bridge is ready
   */
  isReady(): boolean {
    return this.state.ready && this.state.initialized;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get current state
   */
  getState(): VictusBridgeState {
    return { ...this.state };
  }

  /**
   * Get configuration
   */
  getConfig(): VictusBridgeConfig {
    return { ...this.config };
  }
}

/**
 * Factory function to create a pre-configured VictusBridge
 */
export function createVictusBridge(
  runtimeUrl: string = 'http://localhost:8080',
  logger?: Logger
): VictusBridge {
  const config: VictusBridgeConfig = {
    runtimeUrl,
  };
  return new VictusBridge(config, logger);
}

export default VictusBridge;