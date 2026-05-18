import { useState } from 'react';

function App() {
  const [objective, setObjective] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const execute = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objective }),
      });
      const data = await res.json();
      setResult(data);
    } catch (e: any) {
      setResult({ error: e.message });
    }
    setLoading(false);
  };

  return (
    <div className="app">
      <h1>Alpha - HomeBase</h1>
      <input
        value={objective}
        onChange={(e) => setObjective(e.target.value)}
        placeholder="Enter objective..."
      />
      <button onClick={execute} disabled={loading}>
        {loading ? 'Executing...' : 'Execute'}
      </button>
      {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
}

export default App;