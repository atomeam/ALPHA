import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Config - paths relative to parent repo
const CONFIG = {
  repos: [
    { name: 'atomarcade-bridge', path: '../atomarcade-bridge' },
    { name: 'Aether', path: '../Aether' },
    { name: 'ALPHA', path: '../ALPHA' }
  ],
  logs: [
    { name: 'HomeBase Logs', path: '../atomarcade-bridge/homebase-logs.jsonl' },
    { name: 'Bridge Logs', path: '../atomarcade-bridge/homebase-chat.jsonl' }
  ],
  tools: [
    { name: 'HomeBase', file: '../atomarcade-bridge/homebase.ps1', cmd: 'pwsh' },
    { name: 'Recovery', file: '../atomarcade-bridge/tools/fresh-start-homebase-recovery.ps1', cmd: 'pwsh' }
  ]
};

app.get('/api/status', (req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    summary: {
      totalRepos: CONFIG.repos.length,
      totalLogs: CONFIG.logs.length,
      totalTools: CONFIG.tools.length
    }
  });
});

app.get('/api/repos', (req, res) => {
  res.json(CONFIG.repos.map(r => ({ name: r.name, exists: true })));
});

app.get('/api/tools', (req, res) => {
  res.json(CONFIG.tools);
});

app.get('/api/logs', (req, res) => {
  res.json(CONFIG.logs.map(l => ({ name: l.name, exists: true })));
});

app.use(express.static(join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`atomeam-stack running at http://localhost:${PORT}`);
});