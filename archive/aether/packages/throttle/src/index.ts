/**
 * @aether/throttle - Token Bucket Rate Limiter
 * 
 * Enforces rate limits per channel to prevent API blocking.
 * Uses token bucket algorithm with configurable limits.
 * 
 * Usage:
 *   const throttle = new ThrottleProvider({ linkedin: { maxPerDay: 8 } });
 *   await throttle.acquire('linkedin'); // throws if rate exceeded
 */

import { z } from 'zod';

// Channel configuration schema
export const ChannelConfigSchema = z.object({
  maxPerDay: z.number().default(10),
  maxPerHour: z.number().default(3),
  minIntervalMinutes: z.number().default(15),
  maxIntervalMinutes: z.number().default(120),
  burstProtection: z.boolean().default(true),
  warmupRatio: z.number().default(1.0), // Daily volume scaling
});

export type ChannelConfig = z.infer<typeof ChannelConfigSchema>;

// All channel configs
export const ThrottleConfigSchema = z.object({
  linkedin: ChannelConfigSchema.default({
    maxPerDay: 8,
    maxPerHour: 2,
    minIntervalMinutes: 45,
    maxIntervalMinutes: 180,
    burstProtection: true,
    warmupRatio: 1.0,
  }),
  email: ChannelConfigSchema.default({
    maxPerDay: 25,
    maxPerHour: 10,
    minIntervalMinutes: 15,
    maxIntervalMinutes: 60,
    burstProtection: true,
    warmupRatio: 1.1,
  }),
  twitter: ChannelConfigSchema.default({
    maxPerDay: 15,
    maxPerHour: 5,
    minIntervalMinutes: 20,
    maxIntervalMinutes: 90,
    burstProtection: true,
    warmupRatio: 1.0,
  }),
});

export type ThrottleConfig = z.infer<typeof ThrottleConfigSchema>;
export type Channel = keyof ThrottleConfig;

// Token bucket state per channel
interface BucketState {
  tokens: number;
  lastRefill: number;
  usedToday: number;
  usedHour: number;
}

export class ThrottleProvider {
  private buckets: Map<Channel, BucketState> = new Map();
  private config: ThrottleConfig;
  
  // Track action history (in production, persist to DB)
  private actionLog: Array<{ channel: Channel; timestamp: number; targetId: string }> = [];

  constructor(config: Partial<ThrottleConfig> = {}) {
    this.config = ThrottleConfigSchema.parse({
      ...ThrottleConfigSchema.parse({}),
      ...config,
    });
    
    // Initialize buckets
    for (const channel of Object.keys(this.config) as Channel[]) {
      this.buckets.set(channel, {
        tokens: this.config[channel].maxPerHour,
        lastRefill: Date.now(),
        usedToday: 0,
        usedHour: 0,
      });
    }
  }

  /**
   * Attempt to acquire a slot for the given channel
   * @throws Error if rate limit exceeded
   */
  async acquire(channel: Channel, targetId?: string): Promise<void> {
    const channelConfig = this.config[channel];
    const bucket = this.buckets.get(channel)!;
    
    this.refill(channel);
    
    // Check daily limit
    if (bucket.usedToday >= channelConfig.maxPerDay) {
      throw new Error(
        `Rate limit: ${channel} daily limit (${channelConfig.maxPerDay}) exceeded. ` +
        `Resets at midnight.`
      );
    }
    
    // Check hourly limit
    if (bucket.usedHour >= channelConfig.maxPerHour) {
      throw new Error(
        `Rate limit: ${channel} hourly limit (${channelConfig.maxPerHour}) exceeded. ` +
        `Resets in ${this.getMinutesUntilNextHour()} minutes.`
      );
    }
    
    // Check minimum interval since last action
    const lastAction = this.actionLog
      .filter(a => a.channel === channel)
      .pop();
    
    if (lastAction) {
      const minutesSince = (Date.now() - lastAction.timestamp) / 60000;
      if (minutesSince < channelConfig.minIntervalMinutes) {
        throw new Error(
          `Rate limit: ${channel} min interval (${channelConfig.minIntervalMinutes}min) not reached. ` +
          `Wait ${Math.ceil(channelConfig.minIntervalMinutes - minutesSince)} more minutes.`
        );
      }
    }
    
    // Acquire slot
    bucket.tokens--;
    bucket.usedToday++;
    bucket.usedHour++;
    
    if (targetId) {
      this.actionLog.push({
        channel,
        timestamp: Date.now(),
        targetId,
      });
    }
  }

  /**
   * Get the configured jitter delay for a channel
   * Uses Gaussian-like distribution: min + random * (max - min)
   */
  getJitterDelay(channel: Channel): number {
    const config = this.config[channel];
    const range = config.maxIntervalMinutes - config.minIntervalMinutes;
    
    // Random between min and max
    const randomMinutes = config.minIntervalMinutes + (Math.random() * range);
    
    // Add millisecond variance (0-999ms)
    const msVariance = Math.random() * 1000;
    
    return Math.floor((randomMinutes * 60 * 1000) + msVariance);
  }

  /**
   * Check if channel is available (without acquiring)
   */
  canAcquire(channel: Channel): boolean {
    try {
      this.refill(channel);
      const bucket = this.buckets.get(channel)!;
      const config = this.config[channel];
      
      return (
        bucket.usedToday < config.maxPerDay &&
        bucket.usedHour < config.maxPerHour
      );
    } catch {
      return false;
    }
  }

  /**
   * Get current throttle status for all channels
   */
  getStatus(): Record<Channel, {
    remainingToday: number;
    remainingHour: number;
    nextAvailable: string;
  }> {
    const status: any = {};
    
    for (const channel of Object.keys(this.config) as Channel[]) {
      this.refill(channel);
      const bucket = this.buckets.get(channel)!;
      const config = this.config[channel];
      
      status[channel] = {
        remainingToday: config.maxPerDay - bucket.usedToday,
        remainingHour: config.maxPerHour - bucket.usedHour,
        nextAvailable: this.getNextAvailable(channel),
      };
    }
    
    return status;
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(channel: Channel): void {
    const bucket = this.buckets.get(channel)!;
    const config = this.config[channel];
    const now = Date.now();
    
    // Hourly refill
    const hoursSinceRefill = (now - bucket.lastRefill) / 3600000;
    if (hoursSinceRefill >= 1) {
      bucket.tokens = Math.min(
        bucket.tokens + (hoursSinceRefill * config.maxPerHour),
        config.maxPerHour
      );
      bucket.usedHour = 0;
      bucket.lastRefill = now;
    }
    
    // Daily reset (simplified - check if past midnight)
    const lastAction = this.actionLog
      .filter(a => a.channel === channel)
      .pop();
    
    if (lastAction) {
      const daysSince = (now - lastAction.timestamp) / 86400000;
      if (daysSince >= 1) {
        bucket.usedToday = 0;
      }
    }
  }

  private getMinutesUntilNextHour(): number {
    return Math.ceil(60 - (new Date().getMinutes()));
  }

  private getNextAvailable(channel: Channel): string {
    const config = this.config[channel];
    const bucket = this.buckets.get(channel)!;
    
    if (bucket.usedToday >= config.maxPerDay) {
      return 'Tomorrow';
    }
    if (bucket.usedHour >= config.maxPerHour) {
      return `${this.getMinutesUntilNextHour()} minutes`;
    }
    
    const lastAction = this.actionLog
      .filter(a => a.channel === channel)
      .pop();
    
    if (lastAction) {
      const minutesSince = (Date.now() - lastAction.timestamp) / 60000;
      const waitTime = config.minIntervalMinutes - minutesSince;
      if (waitTime > 0) {
        return `${Math.ceil(waitTime)} minutes`;
      }
    }
    
    return 'Now';
  }
}