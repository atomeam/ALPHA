/**
 * Types and Schemas for Tasks Hub
 *
 * Canonical enums:
 * - lane: "Human" | "Council"
 * - status: "Not started" | "In progress" | "Done"
 * - priority: "P0" | "P1" | "P2" | "P3"
 *
 * Views:
 * - now: status != Done AND priority IN (P0, P1), sorted P0→P1 then due_date then updated_at desc
 * - human: lane = "Human" AND status != Done
 * - ai: lane = "Council" AND status != Done
 * - blocked: blocked_by IS NOT NULL AND referenced task not Done
 * - done: status = "Done"
 */

export const LANE_VALUES = ['Human', 'Council'] as const;
export const STATUS_VALUES = ['Not started', 'In progress', 'Done'] as const;
export const PRIORITY_VALUES = ['P0', 'P1', 'P2', 'P3'] as const;
export const VIEW_VALUES = ['now', 'human', 'ai', 'blocked', 'done'] as const;

export type Lane = (typeof LANE_VALUES)[number];
export type Status = (typeof STATUS_VALUES)[number];
export type Priority = (typeof PRIORITY_VALUES)[number];
export type View = (typeof VIEW_VALUES)[number];

export interface Task {
  id: string;
  title: string;
  lane: Lane;
  status: Status;
  priority: Priority;
  due_date: string | null;
  blocking: number;
  blocked_by: string | null;
  tags_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskInput {
  title: string;
  lane: Lane;
  priority: Priority;
  dueDate?: string | null;
  tags?: string[] | null;
  blockedBy?: string | null;
  blocking?: number;
}

export interface TaskPatch {
  title?: string;
  lane?: Lane;
  status?: Status;
  priority?: Priority;
  dueDate?: string | null;
  tags?: string[] | null;
  blockedBy?: string | null;
  blocking?: number;
}

export interface TaskResponse {
  id: string;
  title: string;
  lane: Lane;
  status: Status;
  priority: Priority;
  dueDate: string | null;
  blocking: number;
  blockedBy: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

// All API responses return tasks array for consistency
export interface TasksListResponse {
  correlationId: string;
  tasks: TaskResponse[];
}

export interface TaskMutationResponse {
  correlationId: string;
  tasks: TaskResponse[]; // Always array, single item for single-resource ops
}

export interface ErrorResponse {
  correlationId: string;
  code: 'AUTH_DENIED' | 'VALIDATION_ERROR' | 'NOT_FOUND' | 'INTERNAL';
  message: string;
}

// Error codes:
// AUTH_DENIED: Missing or invalid Authorization header
// VALIDATION_ERROR: Invalid input data
// NOT_FOUND: Task not found
// INTERNAL: Server error

export interface AuditEvent {
  id: string;
  correlation_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  payload: string | null;
  created_at: string;
}