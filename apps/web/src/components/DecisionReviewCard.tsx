import { useEffect, useState } from "react";
import { api, type Decision } from "../api";

export function DecisionReviewCard({ decisionId, onApproved }: { decisionId: string; onApproved: () => void }) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [rationale, setRationale] = useState("");
  const [pathGlob, setPathGlob] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getDecision(decisionId).then((d) => {
      setDecision(d);
      setRationale(d.rationale ?? "");
      setPathGlob(d.scope?.path_glob ?? "");
      setExpiresAt(d.expires_at ?? "");
    });
  }, [decisionId]);

  if (!decision) return <div className="card">Loading draft…</div>;

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      await api.approveDecision(decisionId, {
        scope: { ...decision!.scope, path_glob: pathGlob },
        rationale,
        expires_at: expiresAt || null,
        effective_from: new Date().toISOString(),
      });
      onApproved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 12, borderColor: "var(--accent)" }}>
      <p className="section-title">Reflect draft — verify before approving</p>
      <label className="label">Rule key</label>
      <input value={decision.rule_key} disabled />
      <label className="label" style={{ marginTop: 8 }}>Kind</label>
      <input value={decision.kind} disabled />
      <label className="label" style={{ marginTop: 8 }}>Rationale</label>
      <textarea rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} />
      <label className="label" style={{ marginTop: 8 }}>Path glob</label>
      <input value={pathGlob} onChange={(e) => setPathGlob(e.target.value)} />
      <label className="label" style={{ marginTop: 8 }}>Expires at (required for temporary_exception)</label>
      <input value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} placeholder="2026-09-30T00:00:00Z" />
      <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
        Source events: {decision.source_event_ids.join(", ") || "none"}
      </p>
      {error && <p style={{ color: "var(--danger)", fontSize: 12 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button disabled={busy} onClick={approve}>Approve decision</button>
      </div>
    </div>
  );
}
