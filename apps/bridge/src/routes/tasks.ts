/**
 * Tasks API Routes
 * 
 * GET  /tasks?view=now|human|ai|blocked|done
 * POST /tasks  { title, lane, priority, dueDate?, tags?, blockedBy?, blocking? }
 * PATCH /tasks/:id { title?, lane?, status?, priority?, dueDate?, tags?, blockedBy?, blocking? }
 * POST /tasks/:id/done
 * 
 * All endpoints require Authorization: Bearer BRIDGE_API_TOKEN
 * Every POST/PATCH writes an audit_events row
 */

import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import { v4 as uuidv4 } from 'uuid';
import { Database } from '../lib/db.js';
import {
  LANE_VALUES,
  STATUS_VALUES,
  PRIORITY_VALUES,
  VIEW_VALUES,
  type TaskInput,
  type TaskPatch,
  type TaskResponse,
  type ErrorResponse,
} from '../lib/types.js';

export function createTasksRouter(db: D1Database): Hono {
  const app = new Hono();
  const database = new Database(db);

  // Auth middleware - validates BRIDGE_API_TOKEN
  app.use('/tasks/*', async (c, next) => {
    const authHeader = c.req.header('Authorization');
    const expectedToken = process.env['BRIDGE_API_TOKEN'];

    if (!expectedToken) {
      const correlationId = uuidv4();
      c.status(500);
      return c.json({
        correlationId,
        code: 'INTERNAL',
        message: 'Server misconfiguration: BRIDGE_API_TOKEN not set',
      } satisfies ErrorResponse);
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const correlationId = uuidv4();
      c.status(401);
      return c.json({
        correlationId,
        code: 'AUTH_DENIED',
        message: 'Missing or invalid Authorization header',
      } satisfies ErrorResponse);
    }

    const token = authHeader.slice(7);
    if (token !== expectedToken) {
      const correlationId = uuidv4();
      c.status(401);
      return c.json({
        correlationId,
        code: 'AUTH_DENIED',
        message: 'Invalid token',
      } satisfies ErrorResponse);
    }

    await next();
  });

  // Transform task to response format (camelCase, tags parsed)
  function toResponse(task: { id: string; title: string; lane: string; status: string; priority: string; due_date: string | null; blocking: number; blocked_by: string | null; tags_json: string | null; created_at: string; updated_at: string }): TaskResponse {
    return {
      id: task.id,
      title: task.title,
      lane: task.lane as TaskResponse['lane'],
      status: task.status as TaskResponse['status'],
      priority: task.priority as TaskResponse['priority'],
      dueDate: task.due_date,
      blocking: task.blocking,
      blockedBy: task.blocked_by,
      tags: task.tags_json ? JSON.parse(task.tags_json) : [],
      createdAt: task.created_at,
      updatedAt: task.updated_at,
    };
  }

  // GET /tasks?view=...
  app.get('/', async (c) => {
    const correlationId = uuidv4();
    const view = (c.req.query('view') || 'all') as (typeof VIEW_VALUES)[number] | 'all';

    if (view !== 'all' && !VIEW_VALUES.includes(view as (typeof VIEW_VALUES)[number])) {
      c.status(400);
      return c.json({
        correlationId,
        code: 'VALIDATION_ERROR',
        message: `Invalid view. Must be one of: ${VIEW_VALUES.join(', ')}, all`,
      } satisfies ErrorResponse);
    }

    const tasks = await database.listTasksByView(view);
    return c.json({
      correlationId,
      tasks: tasks.map(toResponse),
    });
  });

  // POST /tasks - Create task
  app.post('/', async (c) => {
    const correlationId = uuidv4();

    try {
      const body = await c.req.json<Partial<TaskInput>>();

      // Validate required fields
      if (!body.title || typeof body.title !== 'string' || body.title.trim() === '') {
        c.status(400);
        return c.json({
          correlationId,
          code: 'VALIDATION_ERROR',
          message: 'title is required and must be a non-empty string',
        } satisfies ErrorResponse);
      }

      if (!body.lane || !LANE_VALUES.includes(body.lane as (typeof LANE_VALUES)[number])) {
        c.status(400);
        return c.json({
          correlationId,
          code: 'VALIDATION_ERROR',
          message: `lane is required and must be one of: ${LANE_VALUES.join(', ')}`,
        } satisfies ErrorResponse);
      }

      if (!body.priority || !PRIORITY_VALUES.includes(body.priority as (typeof PRIORITY_VALUES)[number])) {
        c.status(400);
        return c.json({
          correlationId,
          code: 'VALIDATION_ERROR',
          message: `priority is required and must be one of: ${PRIORITY_VALUES.join(', ')}`,
        } satisfies ErrorResponse);
      }

      const input: TaskInput = {
        title: body.title.trim(),
        lane: body.lane as TaskInput['lane'],
        priority: body.priority as TaskInput['priority'],
        dueDate: body.dueDate,
        tags: body.tags,
        blockedBy: body.blockedBy,
        blocking: body.blocking,
      };

      const task = await database.createTask(input);

      // Write audit event
      await database.writeAuditEvent(correlationId, 'CREATE', 'task', task.id, {
        title: task.title,
        lane: task.lane,
        priority: task.priority,
      });

      return c.json({
        correlationId,
        task: toResponse(task),
      });
    } catch (err) {
      const errorId = uuidv4();
      c.status(500);
      return c.json({
        correlationId: errorId,
        code: 'INTERNAL',
        message: 'Failed to create task',
      } satisfies ErrorResponse);
    }
  });

  // PATCH /tasks/:id - Update task
  app.patch('/:id', async (c) => {
    const correlationId = uuidv4();
    const id = c.req.param('id');

    try {
      const body = await c.req.json<Partial<TaskPatch>>();

      // Validate enum fields if provided
      if (body.lane !== undefined && !LANE_VALUES.includes(body.lane as (typeof LANE_VALUES)[number])) {
        c.status(400);
        return c.json({
          correlationId,
          code: 'VALIDATION_ERROR',
          message: `lane must be one of: ${LANE_VALUES.join(', ')}`,
        } satisfies ErrorResponse);
      }

      if (body.status !== undefined && !STATUS_VALUES.includes(body.status as (typeof STATUS_VALUES)[number])) {
        c.status(400);
        return c.json({
          correlationId,
          code: 'VALIDATION_ERROR',
          message: `status must be one of: ${STATUS_VALUES.join(', ')}`,
        } satisfies ErrorResponse);
      }

      if (body.priority !== undefined && !PRIORITY_VALUES.includes(body.priority as (typeof PRIORITY_VALUES)[number])) {
        c.status(400);
        return c.json({
          correlationId,
          code: 'VALIDATION_ERROR',
          message: `priority must be one of: ${PRIORITY_VALUES.join(', ')}`,
        } satisfies ErrorResponse);
      }

      const patch: TaskPatch = {};
      if (body.title !== undefined) patch.title = body.title.trim();
      if (body.lane !== undefined) patch.lane = body.lane;
      if (body.status !== undefined) patch.status = body.status;
      if (body.priority !== undefined) patch.priority = body.priority;
      if (body.dueDate !== undefined) patch.dueDate = body.dueDate;
      if (body.tags !== undefined) patch.tags = body.tags;
      if (body.blockedBy !== undefined) patch.blockedBy = body.blockedBy;
      if (body.blocking !== undefined) patch.blocking = body.blocking;

      const task = await database.updateTask(id, patch);

      if (!task) {
        c.status(404);
        return c.json({
          correlationId,
          code: 'NOT_FOUND',
          message: `Task ${id} not found`,
        } satisfies ErrorResponse);
      }

      // Write audit event
      await database.writeAuditEvent(correlationId, 'UPDATE', 'task', id, patch);

      return c.json({
        correlationId,
        task: toResponse(task),
      });
    } catch (err) {
      const errorId = uuidv4();
      c.status(500);
      return c.json({
        correlationId: errorId,
        code: 'INTERNAL',
        message: 'Failed to update task',
      } satisfies ErrorResponse);
    }
  });

  // POST /tasks/:id/done - Mark task as done
  app.post('/:id/done', async (c) => {
    const correlationId = uuidv4();
    const id = c.req.param('id');

    try {
      const task = await database.updateTask(id, { status: 'Done' });

      if (!task) {
        c.status(404);
        return c.json({
          correlationId,
          code: 'NOT_FOUND',
          message: `Task ${id} not found`,
        } satisfies ErrorResponse);
      }

      // Write audit event
      await database.writeAuditEvent(correlationId, 'COMPLETE', 'task', id, {
        status: 'Done',
      });

      return c.json({
        correlationId,
        task: toResponse(task),
      });
    } catch (err) {
      const errorId = uuidv4();
      c.status(500);
      return c.json({
        correlationId: errorId,
        code: 'INTERNAL',
        message: 'Failed to complete task',
      } satisfies ErrorResponse);
    }
  });

  return app;
}