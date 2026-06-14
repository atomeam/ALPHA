/**
 * Network Health Check
 * 
 * Check external dependencies before diagnosing internal errors.
 * Prevents false lessons from external outages.
 */

export interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'degraded' | 'down';
  latencyMs?: number;
  statusCode?: number;
  error?: string;
  checkedAt: number;
}

// Known external dependencies
export const SERVICES = {
  npm: 'https://registry.npmjs.org',
  github: 'https://api.github.com',
  vercel: 'https://api.vercel.com',
  linear: 'https://api.linear.app',
} as const;

// Check a single service
export async function checkService(url: string, timeoutMs = 5000): Promise<HealthCheckResult> {
  const start = Date.now();
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    
    const latencyMs = Date.now() - start;
    let status: HealthCheckResult['status'] = 'healthy';
    
    if (response.status >= 500) status = 'down';
    else if (response.status >= 400) status = 'degraded';
    else if (latencyMs > 3000) status = 'degraded';
    
    return {
      service: url,
      status,
      latencyMs,
      statusCode: response.status,
      checkedAt: Date.now(),
    };
  } catch (e: any) {
    return {
      service: url,
      status: 'down',
      error: e.message,
      checkedAt: Date.now(),
    };
  }
}

// Check all known services
export async function checkAllServices(): Promise<HealthCheckResult[]> {
  const results: HealthCheckResult[] = [];
  
  for (const [name, url] of Object.entries(SERVICES)) {
    const result = await checkService(url);
    result.service = name;
    results.push(result);
  }
  
  return results;
}

// Check if external services are causing errors
export async function getExternalStatus(): Promise<{
  isBlocked: boolean;
  blockedServices: string[];
  results: HealthCheckResult[];
}> {
  const results = await checkAllServices();
  
  const blocked = results.filter(r => r.status === 'down');
  const blockedServices = blocked.map(r => r.service);
  
  return {
    isBlocked: blockedServices.length > 0,
    blockedServices,
    results,
  };
}

// Before diagnosing an error, check if external services are down
export async function gatekeepDiagnosis(error: string): Promise<{
  shouldPause: boolean;
  reason: string;
  externalBlock?: string;
}> {
  const { isBlocked, blockedServices } = await getExternalStatus();
  
  if (isBlocked) {
    return {
      shouldPause: true,
      reason: `External service blocked: ${blockedServices.join(', ')}`,
      externalBlock: blockedServices[0],
    };
  }
  
  // Check for common external error patterns
  const externalPatterns = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', '503', '502', '504'];
  for (const pattern of externalPatterns) {
    if (error.includes(pattern)) {
      const extStatus = await getExternalStatus();
      if (extStatus.isBlocked) {
        return {
          shouldPause: true,
          reason: `External error pattern detected: ${pattern}`,
          externalBlock: extStatus.blockedServices[0],
        };
      }
    }
  }
  
  return {
    shouldPause: false,
    reason: 'Internal error, proceed with diagnosis',
  };
}