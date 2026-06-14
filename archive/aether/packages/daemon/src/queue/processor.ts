/**
 * Outbound Queue with Jitter
 * 
 * Processes outreach actions with human-like delays.
 * Uses Gaussian-style jitter to avoid platform detection.
 * 
 * Usage:
 *   const processor = new OutboundQueueProcessor();
 *   await processor.enqueue({ channel: 'linkedin', targetId: '...' });
 */

import { ThrottleProvider, Channel, ThrottleConfigSchema } from '@aether/throttle';

// Queue item
interface QueueItem {
  id: string;
  channel: Channel;
  targetId: string;
  payload: Record<string, unknown>;
  priority: number;
  scheduledAt: number;
  createdAt: number;
}

// Execution result
interface ExecutionResult {
  itemId: string;
  success: boolean;
  error?: string;
  executedAt: number;
}

// Queue processor
export class OutboundQueueProcessor {
  private queue: QueueItem[] = [];
  private throttle: ThrottleProvider;
  private isProcessing: boolean = false;
  private processedToday: number = 0;

  constructor(throttleConfig?: Partial<Record<Channel, any>>) {
    this.throttle = new ThrottleProvider(ThrottleConfigSchema.parse(throttleConfig || {}));
  }

  /**
   * Add an action to the queue
   */
  enqueue(item: Omit<QueueItem, 'id' | 'scheduledAt' | 'createdAt' | 'priority'>): string {
    const id = `outbound_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    const queueItem: QueueItem = {
      ...item,
      id,
      priority: 0, // Can be extended for priority queue
      scheduledAt: 0,
      createdAt: Date.now(),
    };
    
    this.queue.push(queueItem);
    this.queue.sort((a, b) => a.createdAt - b.createdAt);
    
    console.log(`[Queue] Enqueued ${item.channel} action for ${item.targetId} (id: ${id})`);
    
    return id;
  }

  /**
   * Process next item in queue with jitter
   */
  async processNext(): Promise<ExecutionResult | null> {
    // Check if we have items
    if (this.queue.length === 0) {
      return null;
    }

    const item = this.queue[0];
    
    try {
      // Check throttle
      await this.throttle.acquire(item.channel, item.targetId);
      
      // Calculate jitter delay (human-like)
      const jitterDelay = this.throttle.getJitterDelay(item.channel);
      
      console.log(
        `[Queue] Processing ${item.channel} action for ${item.targetId} ` +
        `in ${Math.ceil(jitterDelay / 60000)} minutes ` +
        `(jitter: ${Math.ceil(jitterDelay / 1000)}s)`
      );
      
      // Execute after jitter delay
      await this.sleep(jitterDelay);
      
      // Simulate delivery (in production, call actual API)
      const result = await this.executeAction(item);
      
      // Remove from queue on success
      if (result.success) {
        this.queue.shift();
        this.processedToday++;
      }
      
      return result;
    } catch (error: any) {
      // Rate limited - keep in queue, will retry later
      console.log(`[Queue] Queued: ${error.message}`);
      
      return {
        itemId: item.id,
        success: false,
        error: error.message,
        executedAt: Date.now(),
      };
    }
  }

  /**
   * Run the queue processor loop
   */
  async startProcessing(intervalMs: number = 60000): Promise<void> {
    this.isProcessing = true;
    console.log('[Queue] Starting queue processor loop...');
    
    while (this.isProcessing) {
      await this.processNext();
      await this.sleep(intervalMs);
    }
    
    console.log('[Queue] Queue processor loop stopped.');
  }

  stopProcessing(): void {
    this.isProcessing = false;
  }

  /**
   * Get queue status
   */
  getStatus(): {
    queueLength: number;
    nextItem: QueueItem | null;
    throttleStatus: Record<Channel, any>;
    processedToday: number;
  } {
    return {
      queueLength: this.queue.length,
      nextItem: this.queue[0] || null,
      throttleStatus: this.throttle.getStatus(),
      processedToday: this.processedToday,
    };
  }

  /**
   * Simulated action execution
   * In production, replace with actual API calls
   */
  private async executeAction(item: QueueItem): Promise<ExecutionResult> {
    // Simulate API call (90% success rate for testing)
    const success = Math.random() > 0.1;
    
    return {
      itemId: item.id,
      success,
      error: success ? undefined : 'Simulated failure (mock mode)',
      executedAt: Date.now(),
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}