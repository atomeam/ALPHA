# Self-Adaptive System

A self-monitoring and self-healing backend service built on Cloudflare Workers with Durable Objects for stateful assessment, KV for metrics storage, and Queues for action dispatch.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Cloudflare Worker                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐   ┌─────────────────┐   ┌──────────────────┐  │
│  │  Monitoring  │──▶│  Assessment     │──▶│  Decision        │  │
│  │  Layer       │   │  Engine (DO)    │   │  Engine          │  │
│  │              │   │                 │   │                  │  │
│  │ • System     │   │ • Rules         │   │ • Priority       │  │
│  │ • Health     │   │ • Anomaly Det. │   │ • Cost/Benefit   │  │
│  │ • Custom     │   │ • Health Eval.  │   │ • Human-in-loop  │  │
│  └─────────────┘   └────────┬────────┘   └────────┬─────────┘  │
│                             │                       │            │
│                             ▼                       ▼            │
│                      ┌──────────────┐       ┌──────────────┐   │
│                      │    KV        │       │    Queue     │   │
│                      │  (Metrics)   │       │  (Actions)   │   │
│                      └──────────────┘       └──────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Monitoring Layer (`src/monitoring.ts`)
Collects metrics from various sources:
- **SystemMetricsSource**: Built-in system metrics
- **HealthCheckSource**: External health endpoints
- **CustomMetricsSource**: Custom metric providers

### 2. Assessment Engine (`src/assessment-engine.ts`)
Durable Object that serves as the "brain":
- Ingests and buffers metrics
- Evaluates health status
- Generates recommendations
- Plans and coordinates actions
- Maintains state across requests

### 3. Decision Engine (`src/decision-engine.ts`)
Rule-based decision system:
- Configurable thresholds
- Anomaly detection
- Trend analysis
- Priority-based action planning

### 4. Action Executor (`src/action-executor.ts`)
Handles execution of planned actions:
- Scale up/down
- Clear cache
- Send alerts
- Restart services

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/metrics` | Ingest metrics |
| GET | `/api/metrics` | Get recent metrics |
| POST | `/api/assess` | Run assessment |
| GET | `/api/status` | System status |
| GET | `/api/actions` | List pending actions |
| POST | `/api/actions/:id/approve` | Approve action |

## Metrics Format

```json
{
  "name": "cpu_usage_percent",
  "value": 75.5,
  "unit": "percent",
  "timestamp": 1703251200000,
  "tags": { "region": "us-east" }
}
```

## Deployment

### Prerequisites

1. Node.js 18+
2. Wrangler CLI (`pnpm add -D wrangler`)
3. Cloudflare account

### Setup

```bash
cd apps/self-adaptive
pnpm install
```

### Create KV Namespace

```bash
wrangler kv:namespace create METRICS_KV
# Copy the ID to wrangler.toml
```

### Configure Secrets

```bash
wrangler secret put SLACK_WEBHOOK_URL
wrangler secret put CLOUDFLARE_API_TOKEN
```

### Deploy

```bash
# Development
pnpm dev

# Staging
pnpm deploy:staging

# Production
pnpm deploy
```

### View Logs

```bash
pnpm tail
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Log level (debug, info, warn, error) |
| `ASSESSMENT_INTERVAL_MS` | `60000` | Assessment frequency (ms) |
| `METRICS_RETENTION_HOURS` | `168` | How long to keep metrics (7 days) |

### Durable Object

Single instance named `main-assessment-engine` handles all assessment logic and maintains state across requests.

### Queue

Actions are dispatched to `self-adaptive-actions` queue for async processing and retry logic.

## Development

```bash
# Run locally
pnpm dev

# Type checking
pnpm typecheck
```

## Extending

### Adding Custom Metrics

```typescript
import { MonitoringLayer, CustomMetricsSource } from './monitoring';

const monitoring = new MonitoringLayer();
monitoring.registerSource(new CustomMetricsSource(async () => {
  return {
    'custom_metric_1': getValue1(),
    'custom_metric_2': getValue2(),
  };
}));
```

### Adding Custom Rules

```typescript
import { DecisionEngine, Rule } from './decision-engine';

const engine = new DecisionEngine();
engine.addRule({
  id: 'my-rule',
  name: 'My Custom Rule',
  description: 'Triggers when something happens',
  condition: { metric: 'my_metric', operator: '>', value: 100 },
  action: 'scale_up',
  parameters: {},
  priority: 'high',
  enabled: true,
});
```

### Adding Custom Action Handlers

```typescript
import { ActionExecutor, ActionHandler } from './action-executor';

const executor = new ActionExecutor();
executor.registerHandler({
  type: 'my_custom_action',
  async execute(params) {
    // Custom logic here
    return { success: true, output: 'Done!' };
  },
});
```

## License

MIT