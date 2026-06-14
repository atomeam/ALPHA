/**
 * Executor Agent
 * 
 * Runs approved MCP tools and reports results to the ledger.
 * Watches for approved actions from Curator and executes them.
 */

import { executeTool, getTools, toolRegistry } from '@aether/mcp-tools';
import { writeRecord } from '@aether/logger';

export interface ApprovedAction {
  traceId: string;
  tool: string;
  args: Record<string, unknown>;
  timestamp: number;
}

// Process an approved action
export async function executeApprovedAction(action: ApprovedAction) {
  const { traceId, tool, args, timestamp } = action;
  
  try {
    // Execute the tool
    const result = await executeTool(tool, args);
    
    // Record success to ledger
    await writeRecord({
      traceId,
      phase: 'executor',
      status: 'success',
      tool,
      result: JSON.stringify(result),
      timestamp
    });
    
    return { success: true, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    
    // Record failure
    await writeRecord({
      traceId,
      phase: 'executor',
      status: 'error',
      tool,
      error: message,
      timestamp
    });
    
    return { success: false, error: message };
  }
}

// Health check for tools
export function getExecutorHealth() {
  const tools = getTools();
  return {
    status: 'running',
    tools: tools.length,
    availableTools: tools.map(t => t.name)
  };
}