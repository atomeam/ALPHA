// Mock for Cloudflare Workers runtime types.
// Used by vitest to resolve 'cloudflare:workers' imports without a real Workers runtime.
// Provides minimal stub types so orchestration-brain.ts can be imported in tests.
import type { Env } from 'cloudflare:workers';

export class DurableObject {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_state: DurableObjectState, _env: Env) {
    // Mock DO - constructor params not used in test environment
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async fetch(_request: Request): Promise<Response> {
    return new Response('mock');
  }
}

export class DurableObjectState {
  storage: DurableObjectStorage;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  blockConcurrencyWhile<T>(_fn: () => T | Promise<T>): Promise<void> {
    return Promise.resolve();
  }
  constructor(_state: DurableObjectStorage) {
    this.storage = _state;
  }
}

export interface DurableObjectStorage {
  get<T>(key: string, options?: { type?: 'json' | 'text' }): Promise<T | null>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  list<T>(options?: { prefix?: string }): Promise<Map<string, T>>;
  transaction<T>(_fn: (txn: DurableObjectStorageTransaction) => T | Promise<T>): Promise<T>;
}

export interface DurableObjectStorageTransaction {
  get<T>(key: string, options?: { type?: 'json' | 'text' }): Promise<T | null>;
  put<T>(key: string, value: T): void;
  delete(key: string): void;
  rollback(): void;
}

export interface Env {
  METRICS?: KVNamespace;
  TELEMETRY_QUEUE?: Queue<unknown>;
}

export interface KVNamespace {
  get<T>(key: string, options?: { type?: 'json' | 'text' }): Promise<T | null>;
  put<T>(key: string, value: T, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number }): Promise<{ keys: Array<{ name: string }> }>;
}

export interface Queue<T> {
  send(body: T, options?: { delaySeconds?: number }): Promise<void>;
}
