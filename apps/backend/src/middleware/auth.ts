import type { Request, Response, NextFunction } from 'express';

/**
 * Auth middleware for Alpha's internal API endpoints.
 * 
 * Protects write endpoints (/thresholds, /ingest, /metrics POST)
 * from unauthorized metric injection that could trick the self-improvement loop.
 * 
 * Auth is via Bearer token in Authorization header.
 * The token is stored as a Worker secret: ASSESSMENT_API_KEY
 */
export function requireApiKey(getSecret: () => string | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing Authorization header' });
      return;
    }
    
    const token = authHeader.slice(7); // Remove 'Bearer ' prefix
    const secret = getSecret();
    
    if (!secret) {
      // If no secret configured, allow requests (for development/local)
      console.warn('ASSESSMENT_API_KEY not configured - allowing unauthenticated request');
      next();
      return;
    }
    
    if (token !== secret) {
      res.status(403).json({ error: 'Invalid API key' });
      return;
    }
    
    next();
  };
}

/**
 * Optional auth middleware - returns 401 only if a token is provided
 * but invalid, allows unauthenticated requests if no secret is configured.
 */
export function optionalApiKey(getSecret: () => string | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      // No auth provided - check if secret is required
      const secret = getSecret();
      if (secret) {
        res.status(401).json({ error: 'Authorization required' });
        return;
      }
      next();
      return;
    }
    
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Invalid Authorization format' });
      return;
    }
    
    const token = authHeader.slice(7);
    const secret = getSecret();
    
    if (secret && token !== secret) {
      res.status(403).json({ error: 'Invalid API key' });
      return;
    }
    
    next();
  };
}

/**
 * Read the API secret from environment variable.
 * In Cloudflare Workers, secrets are injected as env vars at deploy time.
 */
export function getSecretFromEnv(): string | undefined {
  return process.env.ASSESSMENT_API_KEY;
}