export interface McpRequest {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
  id: string | number | null;
}

export type McpResponse =
  | { jsonrpc: '2.0'; result: unknown; id: string | number | null }
  | { jsonrpc: '2.0'; error: { code: number; message: string }; id: string | number | null };

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const tools: McpToolDefinition[] = [
  {
    name: 'alpha.stack.list',
    description: 'List the ALPHA-connected repositories and provider readiness.',
    inputSchema: { type: 'object', additionalProperties: false },
  },
  {
    name: 'alpha.trust.check',
    description: 'Evaluate a TrustRequest against the active grant registry.',
    inputSchema: { type: 'object' },
  },
];

function isMcpRequest(value: unknown): value is McpRequest {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<McpRequest>;
  return record.jsonrpc === '2.0' && typeof record.method === 'string' && 'id' in record;
}

export function listMcpTools(): McpToolDefinition[] {
  return tools;
}

export function handleMcpRequest(value: unknown): McpResponse {
  if (!isMcpRequest(value)) {
    return {
      jsonrpc: '2.0',
      error: { code: -32600, message: 'Invalid JSON-RPC request' },
      id: null,
    };
  }

  if (value.method === 'resources/list') {
    return {
      jsonrpc: '2.0',
      result: {
        resources: [
          { uri: 'alpha://stack', name: 'Connected ALPHA stack' },
          { uri: 'alpha://trust', name: 'Trust kernel and grants' },
        ],
      },
      id: value.id,
    };
  }

  if (value.method === 'tools/list') {
    return { jsonrpc: '2.0', result: { tools }, id: value.id };
  }

  return {
    jsonrpc: '2.0',
    error: { code: -32601, message: `Method not found: ${value.method}` },
    id: value.id,
  };
}
