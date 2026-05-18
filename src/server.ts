import express from 'express';
import path from 'path';
import { IntegrationManager } from './core/integration_manager';
import { VictusBridge } from './core/victus_bridge';
import { Orchestrator } from './core/orchestrator';

const app = express();
const PORT = 8080;

app.use(express.json());

// Initialize services with correct constructor signatures
const configPath = path.join(process.cwd(), 'config', 'integrations.json');
const integrationManager = new IntegrationManager(configPath);
const victusBridge = new VictusBridge({ runtimeUrl: 'http://localhost:8080' });
const orchestrator = new Orchestrator(integrationManager, victusBridge, { stopOnFailure: true });

// POST /api/execute - Main entry point for frontend
app.post('/api/execute', async (req, res) => {
  try {
    const { objective, plan } = req.body;
    
    if (objective) {
      orchestrator.setObjective(objective);
    }
    
    if (plan) {
      orchestrator.setPlan(plan);
    }
    
    const result = await orchestrator.executePlan();
    res.json({ success: true, result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`HomeBase runtime running on port ${PORT}`);
});

export default app;