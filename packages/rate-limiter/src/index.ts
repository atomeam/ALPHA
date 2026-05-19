/**
 * Rate Limiter
 * 
 * Per-tool rate limiting with sliding window.
 */

export interface RateLimitConfig {
  windowMs: number;    // Time window in ms
  maxRequests: number; // Max requests per window
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

// Per-key sliding window
class SlidingWindow {
  private timestamps: number[] = [];
  
  constructor(private config: RateLimitConfig) {}
  
  check(): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    
    // Remove old timestamps
    this.timestamps = this.timestamps.filter(t => t > windowStart);
    
    const remaining = this.config.maxRequests - this.timestamps.length;
    
    if (remaining <= 0) {
      const oldest = this.timestamps[0];
      const resetMs = oldest + this.config.windowMs - now;
      return { allowed: false, remaining: 0, resetMs };
    }
    
    return { allowed: true, remaining, resetMs: this.config.windowMs };
  }
  
  record() {
    this.timestamps.push(Date.now());
  }
  
  reset() {
    this.timestamps = [];
  }
}

// Registry
const limiters = new Map<string, SlidingWindow>();

export function getLimiter(key: string, config: RateLimitConfig): SlidingWindow {
  let limiter = limiters.get(key);
  if (!limiter) {
    limiter = new SlidingWindow(config);
    limiters.set(key, limiter);
  }
  return limiter;
}

export function checkLimit(key: string, config: RateLimitConfig): RateLimitResult {
  return getLimiter(key, config).check();
}

export function allow(key: string, config: RateLimitConfig): boolean {
  const result = checkLimit(key, config);
  if (result.allowed) {
    getLimiter(key, config).record();
  }
  return result.allowed;
}

export function resetLimit(key: string) {
  const limiter = limiters.get(key);
  if (limiter) limiter.reset();
}

// Tool-specific limits
export const DEFAULT_TOOL_LIMITS: Record<string, RateLimitConfig> = {
  git_commit: { windowMs: 60000, maxRequests: 10 },  // 10 commits/min
  file_write: { windowMs: 60000, maxRequests: 30 }, // 30 writes/min
  http_request: { windowMs: 60000, maxRequests: 60 }, // 60 req/min
  chaos_inject: { windowMs: 600000, maxRequests: 5 }, // 5/min
  trigger_workflow: { windowMs: 60000, maxRequests: 10 }, // 10/min
};

export function getToolLimit(tool: string): RateLimitConfig | undefined {
  return DEFAULT_TOOL_LIMITS[tool];
}