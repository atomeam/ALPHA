/**
 * MCP Tool Registry
 * 
 * Sandboxed tools for the Executor agent.
 */

export interface Tool {
  name: string;
  description: string;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

// File read tool
const fileReadTool: Tool = {
  name: 'file_read',
  description: 'Read contents of a file',
  async execute(args) {
    const path = args.path as string;
    if (!path) throw new Error('path required');
    
    // Security: Only allow reads within workspace
    if (!path.includes('/workspace/project/Aether')) {
      throw new Error('Access denied: path must be in workspace');
    }
    
    const fs = await import('fs/promises');
    const content = await fs.readFile(path, 'utf-8');
    return { path, content, length: content.length };
  }
};

// File write tool
const fileWriteTool: Tool = {
  name: 'file_write',
  description: 'Write content to a file',
  async execute(args) {
    const path = args.path as string;
    const content = args.content as string;
    
    if (!path || content === undefined) throw new Error('path and content required');
    
    // Security: Only allow writes within workspace
    if (!path.includes('/workspace/project/Aether')) {
      throw new Error('Access denied: path must be in workspace');
    }
    
    const fs = await import('fs/promises');
    await fs.writeFile(path, content, 'utf-8');
    return { path, written: true };
  }
};

// Git status tool
const gitStatusTool: Tool = {
  name: 'git_status',
  description: 'Check git repository status',
  async execute(args) {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec.exec);
    
    const cwd = args.cwd as string || process.cwd();
    const { stdout } = await execAsync('git status --short', { cwd });
    return { status: stdout || 'clean', cwd };
  }
};

// Git commit tool
const gitCommitTool: Tool = {
  name: 'git_commit',
  description: 'Create a git commit',
  async execute(args) {
    const message = args.message as string;
    if (!message) throw new Error('message required');
    
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec.exec);
    
    const cwd = args.cwd as string || process.cwd();
    
    await execAsync('git add -A', { cwd });
    const { stdout } = await execAsync(`git commit -m "${message}"`, { cwd });
    return { message, output: stdout };
  }
};

// HTTP request tool
const httpRequestTool: Tool = {
  name: 'http_request',
  description: 'Make an HTTP request (GET/HEAD only)',
  async execute(args) {
    const url = args.url as string;
    const method = (args.method as string) || 'GET';
    
    if (!url) throw new Error('url required');
    
    // Security: Only allow safe methods
    if (!['GET', 'HEAD'].includes(method)) {
      throw new Error('Only GET and HEAD allowed');
    }
    
    const response = await fetch(url, { method });
    
    return {
      url,
      status: response.status,
      ok: response.ok
    };
  }
};

// Tool registry
export const toolRegistry: Record<string, Tool> = {
  file_read: fileReadTool,
  file_write: fileWriteTool,
  git_status: gitStatusTool,
  git_commit: gitCommitTool,
  http_request: httpRequestTool
};

// Get available tools
export function getTools() {
  return Object.values(toolRegistry).map(t => ({ name: t.name, description: t.description }));
}

// Execute a tool by name
export async function executeTool(name: string, args: Record<string, unknown>) {
  const tool = toolRegistry[name];
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.execute(args);
}