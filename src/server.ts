import express from 'express';
import { IntegrationManager } from './integration_manager';
import { VictusBridge } from './victus_bridge';
import { Orchestrator } from './orchestrator';

const app = express();
const PORT = 8080;

app.use(express.json());

// Initialize services
const integrationManager = new IntegrationManager({ logLevel: 'info' });
const victusBridge = new VictusBridge({ baseUrl: 'http://localhost:8080' });
const orchestrator = new Orchestrator(
  { logLevel: 'info', stopOnFailure: true },
  integrationManager,
  victusBridge
);

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