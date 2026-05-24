// Alpha v0 — LessonSink implementations (PR1).
// Three implementations with precedence chain:
//   KVLessonSink (primary, system-of-record) → NotionLessonSink (secondary, async writeback) → MemoryLessonSink (tertiary, test/fallback)

import type { Lesson, LessonSink } from './types.js';

const LESSONS_KEY = 'alpha:lessons';
const LESSONS_INDEX_KEY = 'alpha:lessons:index';

/**
 * KVLessonSink — writes Lesson records to Cloudflare KV.
 * Primary storage: system-of-record for runtime.
 * Append-only list with index for efficient lookup.
 */
export class KVLessonSink implements LessonSink {
  constructor(private kv: KVNamespace | null) {}

  async write(lesson: Lesson): Promise<void> {
    if (!this.kv) return;
    // Append to lessons list
    const lessons = await this.list();
    const updated = [...lessons, lesson];
    await this.kv.put(LESSONS_KEY, JSON.stringify(updated));
    // Update index
    const index = ((await this.kv.get(LESSONS_INDEX_KEY, 'json')) as string[]) || [];
    if (!index.includes(lesson.id)) {
      await this.kv.put(LESSONS_INDEX_KEY, JSON.stringify([...index, lesson.id]));
    }
  }

  async list(): Promise<Lesson[]> {
    if (!this.kv) return [];
    const raw = await this.kv.get(LESSONS_KEY, 'json');
    if (!raw) return [];
    return raw as Lesson[];
  }

  isAvailable(): boolean {
    return this.kv !== null;
  }
}

/**
 * NotionLessonSink — appends Lesson records to a Notion database page.
 * Secondary storage: async human-facing review surface.
 * Writes are queued (non-blocking) so they don't slow Worker responses.
 */
export class NotionLessonSink implements LessonSink {
  constructor(
    private integrationKey: string | null,
    private databaseId: string | null,
    private queue: Queue<unknown> | null, // Queue for async Notion writes
  ) {}

  async write(lesson: Lesson): Promise<void> {
    if (!this.queue) return;
    // Fire-and-forget: queue the write so it doesn't block the response.
    // PR3 will wire the actual Notion API call from the queue consumer.
    await this.queue.send({
      type: 'notion:lesson',
      payload: lesson,
      timestamp: Date.now(),
    });
  }

  async list(): Promise<Lesson[]> {
    // Notion is not a reliable read source for fast lookups.
    // Curator reads from KVLessonSink; Notion is append-only for audit.
    return [];
  }

  isAvailable(): boolean {
    return this.queue !== null;
  }
}

/**
 * MemoryLessonSink — in-memory append-only store.
 * Tertiary (fallback only): used in tests and local dev when KV binding is missing.
 * NOT durable — do not use in production.
 */
export class MemoryLessonSink implements LessonSink {
  private lessons: Lesson[] = [];

  async write(lesson: Lesson): Promise<void> {
    this.lessons.push(lesson);
  }

  async list(): Promise<Lesson[]> {
    return [...this.lessons];
  }

  isAvailable(): boolean {
    return true; // Always available as fallback
  }

  clear(): void {
    this.lessons = [];
  }
}

/**
 * LessonSinkChain — resolves lesson storage using precedence.
 * Primary → Secondary → Tertiary with first-available semantics.
 */
export class LessonSinkChain implements LessonSink {
  constructor(
    private primary: LessonSink,
    private secondary: LessonSink,
    private tertiary: LessonSink,
  ) {}

  async write(lesson: Lesson): Promise<void> {
    // Write to first available sink
    if (this.primary.isAvailable()) {
      await this.primary.write(lesson);
      return;
    }
    if (this.secondary.isAvailable()) {
      await this.secondary.write(lesson);
      return;
    }
    await this.tertiary.write(lesson);
  }

  async list(): Promise<Lesson[]> {
    // Read from primary only (KV is authoritative for lookup)
    if (this.primary.isAvailable()) return this.primary.list();
    if (this.secondary.isAvailable()) return this.secondary.list();
    return this.tertiary.list();
  }

  isAvailable(): boolean {
    return (
      this.primary.isAvailable() || this.secondary.isAvailable() || this.tertiary.isAvailable()
    );
  }
}
