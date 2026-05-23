/**
 * Queue Consumer — adaptive-actions
 * 
 * Processes messages from the adaptive-actions queue dispatched by
 * the AssessmentBrain Durable Object. This closes the "nervous system"
 * loop: decisions are made by the DO and executed by this consumer.
 * 
 * Message types expected:
 * - { type: 'deploy', branch: string, env: 'preview' | 'production' }
 * - { type: 'smoke-test', url: string }
 * - { type: 'rollback', reason: string }
 * - { type: 'log', level: 'info' | 'warn' | 'error', message: string }
 */

export interface QueueMessage {
  type: 'deploy' | 'smoke-test' | 'rollback' | 'log' | 'metrics-snapshot';
  timestamp: string;
  correlationId?: string;
}

export interface DeployMessage extends QueueMessage {
  type: 'deploy';
  branch: string;
  env: 'preview' | 'production';
  triggeredBy?: string;
}

export interface LogMessage extends QueueMessage {
  type: 'log';
  level: 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, unknown>;
}

export interface MetricsSnapshotMessage extends QueueMessage {
  type: 'metrics-snapshot';
  latencyP95Ms: number;
  trustCheckRate: number;
  integrationSuccessRates: Record<string, number>;
  errorBudgetRemaining: string;
}

/**
 * Process a batch of queue messages.
 * This handler is invoked by the Cloudflare Workers runtime when messages
 * arrive on the adaptive-actions queue.
 */
export async function handleQueueBatch(
  messages: Array<{ body: unknown; ack: () => void; retry: () => void }>,
  env: {
    ACTIONS?: Queue;
    METRICS?: KVNamespace;
  },
): Promise<void> {
  const logger = {
    info: (msg: string, ctx?: Record<string, unknown>) => 
      console.log(`[queue:info] ${msg}`, ctx ?? {}),
    warn: (msg: string, ctx?: Record<string, unknown>) => 
      console.warn(`[queue:warn] ${msg}`, ctx ?? {}),
    error: (msg: string, ctx?: Record<string, unknown>) => 
      console.error(`[queue:error] ${msg}`, ctx ?? {}),
  };

  for (const msg of messages) {
    try {
      const body = msg.body as QueueMessage;
      
      logger.info('Processing queue message', {
        type: body.type,
        timestamp: body.timestamp,
        correlationId: body.correlationId,
      });

      switch (body.type) {
        case 'deploy':
          await handleDeploy(body as DeployMessage, env, logger);
          break;
          
        case 'log':
          await handleLog(body as LogMessage, logger);
          break;
          
        case 'metrics-snapshot':
          await handleMetricsSnapshot(body as MetricsSnapshotMessage, env, logger);
          break;
          
        case 'smoke-test':
          // Smoke tests are handled by CI, not here
          logger.info('Smoke-test request noted', { url: (body as unknown as { url: string }).url });
          break;
          
        case 'rollback':
          // Rollback is handled by CI monitoring
          logger.info('Rollback request noted', { reason: (body as unknown as { reason: string }).reason });
          break;
          
        default:
          logger.warn('Unknown message type', { type: body.type });
      }

      msg.ack();
    } catch (error) {
      logger.error('Failed to process message', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Retry the message for transient failures
      msg.retry();
    }
  }
}

async function handleDeploy(
  msg: DeployMessage,
  env: { ACTIONS?: Queue; METRICS?: KVNamespace },
  logger: { info: (msg: string, ctx?: Record<string, unknown>) => void; error: (msg: string, ctx?: Record<string, unknown>) => void },
): Promise<void> {
  logger.info('Deploy action received', {
    branch: msg.branch,
    env: msg.env,
    triggeredBy: msg.triggeredBy,
  });
  
  // Note: Actual deployment is triggered by GitHub Actions CI.
  // This handler logs the intent and could trigger downstream actions.
  // 
  // For now, we just log. In a full implementation, you might:
  // - Update KV with deployment status
  // - Post to a webhook
  // - Send a Slack notification
  
  if (env.METRICS) {
    const statusKey = `deploy:${msg.env}:${new Date().toISOString()}`;
    await env.METRICS.put(statusKey, JSON.stringify({
      type: 'deploy-requested',
      branch: msg.branch,
      env: msg.env,
      timestamp: msg.timestamp,
      correlationId: msg.correlationId,
    }));
  }
}

async function handleLog(
  msg: LogMessage,
  logger: { info: (msg: string, ctx?: Record<string, unknown>) => void; warn: (msg: string, ctx?: Record<string, unknown>) => void; error: (msg: string, ctx?: Record<string, unknown>) => void },
): Promise<void> {
  const logFn = {
    info: logger.info,
    warn: logger.warn,
    error: logger.error,
  }[msg.level] ?? logger.info;

  logFn(`[assessment-brain] ${msg.message}`, msg.context);
}

async function handleMetricsSnapshot(
  msg: MetricsSnapshotMessage,
  env: { ACTIONS?: Queue; METRICS?: KVNamespace },
  logger: { info: (msg: string, ctx?: Record<string, unknown>) => void },
): Promise<void> {
  logger.info('Metrics snapshot received', {
    latencyP95Ms: msg.latencyP95Ms,
    trustCheckRate: msg.trustCheckRate,
    errorBudgetRemaining: msg.errorBudgetRemaining,
  });

  if (env.METRICS) {
    const snapshotKey = `metrics:snapshot:${new Date().toISOString()}`;
    await env.METRICS.put(snapshotKey, JSON.stringify({
      latencyP95Ms: msg.latencyP95Ms,
      trustCheckRate: msg.trustCheckRate,
      integrationSuccessRates: msg.integrationSuccessRates,
      errorBudgetRemaining: msg.errorBudgetRemaining,
      timestamp: msg.timestamp,
    }));
    
    // Also update the "latest" key
    await env.METRICS.put('metrics:latest', snapshotKey);
  }
}

// Type for Cloudflare Workers Queue binding
interface Queue {
  send(msg: unknown): Promise<void>;
}

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}