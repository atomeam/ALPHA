/**
 * Database helper for Tasks Hub
 * Provides D1 operations for tasks and audit_events tables
 */

import type { D1Database } from '@cloudflare/workers-types';
import { v4 as uuidv4 } from 'uuid';
import type { Task, TaskInput, TaskPatch, AuditEvent } from './types.js';

export class Database {
  constructor(private db: D1Database) {}

  async createTask(input: TaskInput): Promise<Task> {
    const id = uuidv4();
    const now = new Date().toISOString();
    const tags_json = input.tags ? JSON.stringify(input.tags) : null;

    await this.db
      .prepare(
        `INSERT INTO tasks (id, title, lane, status, priority, due_date, blocking, blocked_by, tags_json, created_at, updated_at)
         VALUES (?, ?, ?, 'Not started', ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        input.title,
        input.lane,
        input.priority,
        input.dueDate ?? null,
        input.blocking ?? 0,
        input.blockedBy ?? null,
        tags_json,
        now,
        now
      )
      .run();

    const result = await this.db
      .prepare('SELECT * FROM tasks WHERE id = ?')
      .bind(id)
      .first<Task>();

    return result!;
  }

  async getTask(id: string): Promise<Task | null> {
    const result = await this.db
      .prepare('SELECT * FROM tasks WHERE id = ?')
      .bind(id)
      .first<Task>();
    return result ?? null;
  }

  async updateTask(id: string, patch: TaskPatch): Promise<Task | null> {
    const now = new Date().toISOString();
    const updates: string[] = ['updated_at = ?'];
    const values: (string | number | null)[] = [now];

    if (patch.title !== undefined) {
      updates.push('title = ?');
      values.push(patch.title);
    }
    if (patch.lane !== undefined) {
      updates.push('lane = ?');
      values.push(patch.lane);
    }
    if (patch.status !== undefined) {
      updates.push('status = ?');
      values.push(patch.status);
    }
    if (patch.priority !== undefined) {
      updates.push('priority = ?');
      values.push(patch.priority);
    }
    if (patch.dueDate !== undefined) {
      updates.push('due_date = ?');
      values.push(patch.dueDate);
    }
    if (patch.blocking !== undefined) {
      updates.push('blocking = ?');
      values.push(patch.blocking);
    }
    if (patch.blockedBy !== undefined) {
      updates.push('blocked_by = ?');
      values.push(patch.blockedBy);
    }
    if (patch.tags !== undefined) {
      updates.push('tags_json = ?');
      values.push(patch.tags ? JSON.stringify(patch.tags) : null);
    }

    values.push(id);

    await this.db
      .prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();

    return this.getTask(id);
  }

  async listTasksByView(view: string): Promise<Task[]> {
    let query = '';
    const params: (string | number)[] = [];

    switch (view) {
      case 'now':
        // status != Done AND priority IN (P0, P1), sorted P0→P1 then due_date then updated_at desc
        query = `SELECT * FROM tasks
                 WHERE status != 'Done' AND priority IN ('P0', 'P1')
                 ORDER BY
                   CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 END,
                   due_date ASC NULLS LAST,
                   updated_at DESC`;
        break;

      case 'human':
        // lane = "Human" AND status != Done
        query = `SELECT * FROM tasks
                 WHERE lane = 'Human' AND status != 'Done'
                 ORDER BY updated_at DESC`;
        break;

      case 'ai':
        // lane = "Council" AND status != Done
        query = `SELECT * FROM tasks
                 WHERE lane = 'Council' AND status != 'Done'
                 ORDER BY updated_at DESC`;
        break;

      case 'blocked':
        // blocked_by IS NOT NULL AND referenced task not Done
        query = `SELECT t.* FROM tasks t
                 WHERE t.blocked_by IS NOT NULL
                   AND EXISTS (
                     SELECT 1 FROM tasks blocker
                     WHERE blocker.id = t.blocked_by AND blocker.status != 'Done'
                   )
                 ORDER BY t.updated_at DESC`;
        break;

      case 'done':
        // status = "Done"
        query = `SELECT * FROM tasks
                 WHERE status = 'Done'
                 ORDER BY updated_at DESC`;
        break;

      default:
        // All tasks
        query = `SELECT * FROM tasks ORDER BY updated_at DESC`;
    }

    const result = await this.db.prepare(query).bind(...params).all<Task>();
    return result.results;
  }

  async writeAuditEvent(
    correlationId: string,
    action: string,
    entityType: string,
    entityId: string,
    payload?: Record<string, unknown>
  ): Promise<void> {
    const id = uuidv4();
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `INSERT INTO audit_events (id, correlation_id, action, entity_type, entity_id, payload, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        correlationId,
        action,
        entityType,
        entityId,
        payload ? JSON.stringify(payload) : null,
        now
      )
      .run();
  }
}