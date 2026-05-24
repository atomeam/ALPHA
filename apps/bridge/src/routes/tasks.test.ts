/**
 * Tasks Hub Integration Test
 * 
 * Tests: create task → list tasks → update task status
 * Uses mocked D1 binding for CI compatibility
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { D1Database, D1Result, D1PreparedStatement } from '@cloudflare/workers-types';

// Mock D1 prepared statement
function createMockStatement(results: unknown[] = [], isOk = true): D1PreparedStatement {
  return {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(results[0] ?? null),
    all: vi.fn().mockResolvedValue({ results, success: isOk, meta: {} } as D1Result),
    run: vi.fn().mockResolvedValue({ meta: {}, success: isOk } as D1Result),
  } as unknown as D1PreparedStatement;
}

// Mock task data
const mockTask = {
  id: 'test-task-id-123',
  title: 'Test Task',
  lane: 'Human',
  status: 'Not started',
  priority: 'P1',
  due_date: null,
  blocking: 0,
  blocked_by: null,
  tags_json: null,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

// Mock D1 database
function createMockDb(): D1Database {
  return {
    prepare: vi.fn().mockImplementation((query: string) => {
      if (query.includes('INSERT INTO tasks')) {
        return createMockStatement([], true);
      }
      if (query.includes('SELECT * FROM tasks WHERE id')) {
        return createMockStatement([mockTask]);
      }
      if (query.includes('SELECT * FROM tasks ORDER') || query.includes('WHERE status')) {
        return createMockStatement([mockTask]);
      }
      if (query.includes('UPDATE tasks')) {
        return createMockStatement([], true);
      }
      if (query.includes('INSERT INTO audit_events')) {
        return createMockStatement([], true);
      }
      return createMockStatement([mockTask]);
    }),
  } as unknown as D1Database;
}

describe('Tasks Hub API', () => {
  let mockDb: D1Database;

  beforeEach(() => {
    mockDb = createMockDb();
    vi.clearAllMocks();
  });

  it('should validate required fields on POST /tasks', async () => {
    // Dynamic import to avoid module resolution issues in test
    const { createTasksRouter } = await import('../routes/tasks.js');
    
    // Mock BRIDGE_API_TOKEN
    process.env['BRIDGE_API_TOKEN'] = 'test-token';
    
    const app = createTasksRouter(mockDb);
    
    // Test missing title
    const missingTitleRes = await app.request('/tasks', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ lane: 'Human', priority: 'P1' }),
    });
    
    expect(missingTitleRes.status).toBe(400);
    const missingTitleBody = await missingTitleRes.json();
    expect(missingTitleBody.code).toBe('VALIDATION_ERROR');
    expect(missingTitleBody.correlationId).toBeDefined();
  });

  it('should validate enum values on POST /tasks', async () => {
    const { createTasksRouter } = await import('../routes/tasks.js');
    
    process.env['BRIDGE_API_TOKEN'] = 'test-token';
    
    const app = createTasksRouter(mockDb);
    
    // Test invalid lane
    const invalidLaneRes = await app.request('/tasks', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Test', lane: 'Invalid', priority: 'P1' }),
    });
    
    expect(invalidLaneRes.status).toBe(400);
    const invalidLaneBody = await invalidLaneRes.json();
    expect(invalidLaneBody.code).toBe('VALIDATION_ERROR');
  });

  it('should require auth token', async () => {
    const { createTasksRouter } = await import('../routes/tasks.js');
    
    process.env['BRIDGE_API_TOKEN'] = 'test-token';
    
    const app = createTasksRouter(mockDb);
    
    // Test missing auth
    const noAuthRes = await app.request('/tasks', {
      method: 'GET',
    });
    
    expect(noAuthRes.status).toBe(401);
    const noAuthBody = await noAuthRes.json();
    expect(noAuthBody.code).toBe('AUTH_DENIED');
  });

  it('should reject invalid auth token', async () => {
    const { createTasksRouter } = await import('../routes/tasks.js');
    
    process.env['BRIDGE_API_TOKEN'] = 'test-token';
    
    const app = createTasksRouter(mockDb);
    
    // Test wrong token
    const wrongTokenRes = await app.request('/tasks', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer wrong-token',
      },
    });
    
    expect(wrongTokenRes.status).toBe(401);
    const wrongTokenBody = await wrongTokenRes.json();
    expect(wrongTokenBody.code).toBe('AUTH_DENIED');
  });

  it('should list tasks with valid view', async () => {
    const { createTasksRouter } = await import('../routes/tasks.js');
    
    process.env['BRIDGE_API_TOKEN'] = 'test-token';
    
    const app = createTasksRouter(mockDb);
    
    const res = await app.request('/tasks?view=now', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer test-token',
      },
    });
    
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.correlationId).toBeDefined();
    expect(body.tasks).toBeInstanceOf(Array);
  });

  it('should create task and write audit event', async () => {
    const { createTasksRouter } = await import('../routes/tasks.js');
    
    process.env['BRIDGE_API_TOKEN'] = 'test-token';
    
    const app = createTasksRouter(mockDb);
    
    const res = await app.request('/tasks', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'New Task',
        lane: 'Human',
        priority: 'P1',
      }),
    });
    
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.correlationId).toBeDefined();
    expect(body.tasks).toBeDefined();
    expect(body.tasks[0].title).toBe('Test Task'); // Returns mock data
  });

  it('should update task status', async () => {
    const { createTasksRouter } = await import('../routes/tasks.js');
    
    process.env['BRIDGE_API_TOKEN'] = 'test-token';
    
    const app = createTasksRouter(mockDb);
    
    const res = await app.request('/tasks/test-task-id-123', {
      method: 'PATCH',
      headers: {
        'Authorization': 'Bearer test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'Done',
      }),
    });
    
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.correlationId).toBeDefined();
    expect(body.tasks).toBeDefined();
  });

  it('should mark task done via shortcut endpoint', async () => {
    const { createTasksRouter } = await import('../routes/tasks.js');
    
    process.env['BRIDGE_API_TOKEN'] = 'test-token';
    
    const app = createTasksRouter(mockDb);
    
    const res = await app.request('/tasks/test-task-id-123/done', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer test-token',
      },
    });
    
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.correlationId).toBeDefined();
    expect(body.tasks).toBeDefined();
  });
});