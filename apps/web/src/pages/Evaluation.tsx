import { useState } from "react";
import { api } from "../api";

export function EvaluationPage({ repoId }: { repoId: string }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const r = await api.runEvaluations(repoId);
      setResult(r);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="card">
      <p className="section-title">Evaluation — 12 held-out cases × 3 modes</p>
      <p style={{ fontSize: 13, color: "var(--muted)" }}>
        Same generation setup across generic / static / memory modes, run against an isolated pre-case memory state.
        Counts and case-level outputs only — this sample does not establish production reliability.
      </p>
      <button disabled={running} onClick={run}>{running ? "Running…" : "Run selected case"}</button>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      {result && (
        <div style={{ marginTop: 16 }}>
          <p><strong>{result.generation_count}</strong> generations across <strong>{result.case_count}</strong> cases.
            Memory-mode matches: <strong>{result.memory_mode_matches}</strong> / {result.memory_mode_total}</p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                <th>Case</th><th>Category</th><th>Mode</th><th>Observed status</th><th>Schema valid</th>
              </tr>
            </thead>
            <tbody>
              {result.results.map((r: any, i: number) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td>{r.case_id}</td><td>{r.category}</td><td>{r.mode}</td><td>{r.observed_status}</td>
                  <td>{r.schema_valid ? "yes" : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
