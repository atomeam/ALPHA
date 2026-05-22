/**
 * Integration Manager - Core Module
 * 
 * A centralized registry and router for connecting external APIs and MCP configurations.
 * Provides a single entry point for Alpha to route requests across connected services.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Types for integration configuration
export interface IntegrationConfig {
  name: string;
  type: 'api' | 'mcp';
  enabled: boolean;
  baseUrl?: string;
  apiKeyEnvVar?: string;
  authType?: 'bearer' | 'basic' | 'api_key';
  authHeader?: string; // Custom header name for API key auth (default: 'Authorization')
  headers?: Record<string, string>;
  mcpServerUrl?: string;
  mcpTools?: string[];
  metadata?: Record<string, unknown>;
}

export interface IntegrationState {
  status: 'initialized' | 'active' | 'error' | 'disabled';
  initializedAt?: Date;
  error?: string;
}

// Standard HTTP methods
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface RouteRequest {
  integration: string;
  endpoint: string;
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface RouteResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  statusCode?: number;
}

// MCP Types
export interface MCPRequest {
  tool: string;
  arguments?: Record<string, unknown>;
}

export interface MCPJSONRPCRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPJSONRPCResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// MCP Client interface for executing MCP tools
export interface MCPClient {
  callTool(toolName: string, args?: Record<string, unknown>): Promise<{ success: boolean; result?: unknown; error?: string }>;
  listTools(): Promise<string[]>;
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
  info: (message: string, ...args: unknown[]) => console.log(`[INFO] ${message}`, ...args),
  warn: (message: string, ...args: unknown[]) => console.warn(`[WARN] ${message}`, ...args),
  error: (message: string, ...args: unknown[]) => console.error(`[ERROR] ${message}`, ...args),
  debug: (message: string, ...args: unknown[]) => console.log(`[DEBUG] ${message}`, ...args),
};

/**
 * Integration Manager Class
 * 
 * Serves as the single entry point for connecting external APIs and managing MCP configurations.
 */
export class IntegrationManager {
  private integrations: Map<string, IntegrationConfig> = new Map();
  private states: Map<string, IntegrationState> = new Map();
  private logger: Logger;
  private configPath: string;
  private initialized: boolean = false;

  /**
   * Create a new IntegrationManager
   * @param configPath - Path to the integrations configuration file
   * @param logger - Optional custom logger
   */
  constructor(configPath: string, logger?: Logger) {
    this.configPath = configPath;
    this.logger = logger || defaultLogger;
  }

  /**
   * Initialize the manager by loading configuration from file
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('IntegrationManager already initialized');
      return;
    }

    try {
      this.logger.info(`Loading integration config from: ${this.configPath}`);
      
      const configContent = fs.readFileSync(this.configPath, 'utf-8');
      const config = JSON.parse(configContent) as { integrations: IntegrationConfig[] };
      
      if (!config.integrations || !Array.isArray(config.integrations)) {
        throw new Error('Invalid config: missing or invalid "integrations" array');
      }

      // Load each integration
      for (const integration of config.integrations) {
        await this.registerIntegration(integration);
      }

      this.initialized = true;
      this.logger.info(`IntegrationManager initialized with ${this.integrations.size} integrations`);
    } catch (error) {
      this.logger.error('Failed to initialize IntegrationManager', error);
      throw error;
    }
  }

  /**
   * Register a single integration
   */
  async registerIntegration(config: IntegrationConfig): Promise<void> {
    const { name, type, enabled } = config;

    if (!name) {
      throw new Error('Integration config must have a "name" field');
    }

    if (!type || !['api', 'mcp'].includes(type)) {
      throw new Error(`Invalid integration type: ${type}`);
    }

    // Set initial state
    this.integrations.set(name, config);
    this.states.set(name, { 
      status: enabled ? 'initialized' : 'disabled',
      initializedAt: enabled ? new Date() : undefined,
    });

    // Load API key from environment if specified
    if (enabled && config.apiKeyEnvVar) {
      const apiKey = process.env[config.apiKeyEnvVar];
      if (!apiKey) {
        this.logger.warn(`Environment variable ${config.apiKeyEnvVar} not found for ${name}`);
        this.states.set(name, { 
          status: 'error',
          error: `Missing required env var: ${config.apiKeyEnvVar}`,
        });
      } else {
        this.logger.info(`Loaded API key for ${name} from ${config.apiKeyEnvVar}`);
      }
    }

    this.logger.info(`Registered integration: ${name} (type: ${type}, enabled: ${enabled})`);
  }

  /**
   * Get an integration configuration by name
   */
  getIntegration(name: string): IntegrationConfig | undefined {
    return this.integrations.get(name);
  }

  /**
   * Get the status of an integration
   */
  getStatus(name: string): IntegrationState | undefined {
    return this.states.get(name);
  }

  /**
   * List all registered integrations
   */
  listIntegrations(): { name: string; type: string; enabled: boolean; status: string }[] {
    const result: { name: string; type: string; enabled: boolean; status: string }[] = [];
    
    for (const [name, config] of this.integrations) {
      const state = this.states.get(name);
      result.push({
        name,
        type: config.type,
        enabled: config.enabled,
        status: state?.status || 'unknown',
      });
    }
    
    return result;
  }

  /**
   * Route a request to the appropriate integration
   */
  async route(request: RouteRequest): Promise<RouteResponse> {
    const { integration: integrationName, endpoint, method = 'GET', headers = {}, body } = request;
    
    // Find integration
    const config = this.integrations.get(integrationName);
    const state = this.states.get(integrationName);
    
    if (!config) {
      return {
        success: false,
        error: `Integration not found: ${integrationName}`,
        statusCode: 404,
      };
    }

    if (!config.enabled) {
      return {
        success: false,
        error: `Integration is disabled: ${integrationName}`,
        statusCode: 403,
      };
    }

    if (state?.status === 'error') {
      return {
        success: false,
        error: state.error || `Integration in error state: ${integrationName}`,
        statusCode: 500,
      };
    }

    try {
      let url: string;
      let requestHeaders: Record<string, string> = { ...headers };

      if (config.type === 'api') {
        // Build API URL
        const baseUrl = config.baseUrl || '';
        url = `${baseUrl}${endpoint}`;
        
        // Inject API key/token from environment variables with configurable auth type
        if (config.apiKeyEnvVar) {
          const apiKey = process.env[config.apiKeyEnvVar];
          if (apiKey) {
            const authType = config.authType || 'bearer';
            const authHeader = config.authHeader || 'Authorization';
            
            switch (authType) {
              case 'bearer':
                requestHeaders[authHeader] = `Bearer ${apiKey}`;
                break;
              case 'basic':
                requestHeaders[authHeader] = `Basic ${Buffer.from(apiKey).toString('base64')}`;
                break;
              case 'api_key':
                // API key as custom header or query param
                requestHeaders[authHeader] = apiKey;
                break;
              default:
                requestHeaders[authHeader] = `Bearer ${apiKey}`;
            }
            this.logger.debug(`Injected ${authType} auth via ${config.apiKeyEnvVar}`);
          } else {
            this.logger.warn(`API key env var ${config.apiKeyEnvVar} not found for ${integrationName}`);
          }
        }

        // Add custom headers
        if (config.headers) {
          requestHeaders = { ...requestHeaders, ...config.headers };
        }
      } else if (config.type === 'mcp') {
        // Route to MCP server - prepare JSON-RPC payload
        const mcpServerUrl = config.mcpServerUrl;
        if (!mcpServerUrl) {
          return {
            success: false,
            error: `MCP server URL not configured for: ${integrationName}`,
            statusCode: 500,
          };
        }
        
        // Build MCP JSON-RPC request for tool execution
        const mcpRequestId = Date.now().toString();
        const mcpRequest: MCPJSONRPCRequest = {
          jsonrpc: '2.0',
          id: mcpRequestId,
          method: endpoint.replace(/^\//, ''), // Remove leading slash for method name
          params: body as Record<string, unknown> | undefined,
        };
        
        url = `${mcpServerUrl}/rpc`;
        requestHeaders['Content-Type'] = 'application/json';
        
        // MCP servers may use token auth
        if (config.apiKeyEnvVar) {
          const mcpToken = process.env[config.apiKeyEnvVar];
          if (mcpToken) {
            requestHeaders['Authorization'] = `Bearer ${mcpToken}`;
          }
        }
        
        this.logger.info(`Routing MCP request to ${integrationName}: ${mcpRequest.method}`);
        this.logger.debug('MCP JSON-RPC payload:', mcpRequest);
        
        // Make MCP JSON-RPC request
        const response = await fetch(url, {
          method: 'POST',
          headers: requestHeaders,
          body: JSON.stringify(mcpRequest),
        });

        const responseData = await response.json().catch(() => null);

        // Handle MCP JSON-RPC response
        if (responseData && typeof responseData === 'object') {
          const mcpResponse = responseData as MCPJSONRPCResponse;
          if (mcpResponse.error) {
            return {
              success: false,
              error: `${mcpResponse.error.message}${mcpResponse.error.data ? `: ${JSON.stringify(mcpResponse.error.data)}` : ''}`,
              statusCode: response.status,
            };
          }
          return {
            success: true,
            data: mcpResponse.result,
            statusCode: response.status,
          };
        }

        return {
          success: response.ok,
          data: responseData,
          statusCode: response.status,
        };
      } else {
        return {
          success: false,
          error: `Unknown integration type: ${config.type}`,
          statusCode: 500,
        };
      }

      this.logger.info(`Routing ${method} request to ${integrationName}: ${url}`);

      // Make the actual HTTP request
      const response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: body ? JSON.stringify(body) : undefined,
      });

      const responseData = await response.json().catch(() => null);

      return {
        success: response.ok,
        data: responseData,
        statusCode: response.status,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Route request failed for ${integrationName}:`, errorMessage);
      
      return {
        success: false,
        error: errorMessage,
        statusCode: 500,
      };
    }
  }

  /**
   * Enable or disable an integration at runtime
   */
  setEnabled(name: string, enabled: boolean): boolean {
    const config = this.integrations.get(name);
    if (!config) {
      return false;
    }

    config.enabled = enabled;
    this.states.set(name, {
      status: enabled ? 'active' : 'disabled',
      initializedAt: enabled ? new Date() : undefined,
    });

    this.logger.info(`Integration ${name} ${enabled ? 'enabled' : 'disabled'}`);
    return true;
  }

  /**
   * Check if manager is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Create an MCP client for a specific integration
   * Returns an MCPClient interface for executing tools on the MCP server
   */
  createMCPClient(integrationName: string): MCPClient | null {
    const config = this.integrations.get(integrationName);
    const state = this.states.get(integrationName);
    
    if (!config || config.type !== 'mcp') {
      this.logger.error(`Integration ${integrationName} is not an MCP type`);
      return null;
    }
    
    if (!config.enabled || state?.status === 'error') {
      this.logger.error(`Integration ${integrationName} is not available`);
      return null;
    }
    
    const mcpServerUrl = config.mcpServerUrl;
    if (!mcpServerUrl) {
      this.logger.error(`MCP server URL not configured for ${integrationName}`);
      return null;
    }
    
    const baseUrl = `${mcpServerUrl}/rpc`;
    const apiKeyEnvVar = config.apiKeyEnvVar;
    
    return {
      async callTool(toolName: string, args?: Record<string, unknown>): Promise<{ success: boolean; result?: unknown; error?: string }> {
        try {
          const request: MCPJSONRPCRequest = {
            jsonrpc: '2.0',
            id: Date.now().toString(),
            method: toolName,
            params: args,
          };
          
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          
          // Add auth if configured
          if (apiKeyEnvVar) {
            const token = process.env[apiKeyEnvVar];
            if (token) {
              headers['Authorization'] = `Bearer ${token}`;
            }
          }
          
          this.logger.debug(`MCP calling tool: ${toolName}`, args);
          
          const response = await fetch(baseUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(request),
          });
          
          const responseData = await response.json() as MCPJSONRPCResponse;
          
          if (responseData.error) {
            return {
              success: false,
              error: responseData.error.message,
            };
          }
          
          return {
            success: true,
            result: responseData.result,
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          return {
            success: false,
            error: errorMessage,
          };
        }
      },
      
      async listTools(): Promise<string[]> {
        return config.mcpTools || [];
      },
    };
  }
}

/**
 * Factory function to create a pre-configured IntegrationManager
 */
export async function createIntegrationManager(
  configPath: string = path.join(__dirname, '../../config/integrations.json'),
  logger?: Logger
): Promise<IntegrationManager> {
  const manager = new IntegrationManager(configPath, logger);
  await manager.initialize();
  return manager;
}

export default IntegrationManager;