/**
 * Alpha Bridge - Cloudflare Worker
 * 
 * Tasks Hub: D1-backed task management API
 * 
 * Endpoints:
 * - GET  /tasks?view=now|human|ai|blocked|done
 * - POST /tasks  { title, lane, priority, dueDate?, tags?, blockedBy?, blocking? }
 * - PATCH /tasks/:id { title?, lane?, status?, priority?, dueDate?, tags?, blockedBy?, blocking? }
 * - POST /tasks/:id/done
 * 
 * Auth: All /tasks/* endpoints require Authorization: Bearer BRIDGE_API_TOKEN
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { D1Database } from '@cloudflare/workers-types';
import { createTasksRouter } from './routes/tasks.js';

export interface Env {
  BRIDGE_DB: D1Database;
  BRIDGE_API_TOKEN: string;
  ENVIRONMENT?: string;
}

const app = new Hono<{ Bindings: Env }>();

// CORS headers
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Authorization', 'Content-Type'],
}));

// Request logging (no secrets)
app.use('*', logger((info) => {
  // Don't log auth headers
  return `${info.method} ${info.path}`;
}));

// Health check (no auth required)
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'alpha-bridge',
    started_at: c.env.ENVIRONMENT || 'development',
  });
});

// Tasks API routes
app.route('/tasks', createTasksRouter(c.env.BRIDGE_DB));

// 404 handler
app.notFound((c) => {
  return c.json({
    correlationId: crypto.randomUUID(),
    code: 'NOT_FOUND',
    message: 'Endpoint not found',
  }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({
    correlationId: crypto.randomUUID(),
    code: 'INTERNAL',
    message: 'Internal server error',
  }, 500);
});

export default {
  fetch: app.fetch,
};