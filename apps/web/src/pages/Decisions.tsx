import { useEffect, useState } from "react";
import { api, type Decision } from "../api";

const FILTERS = ["all", "approved", "draft", "revoked"] as const;

export function DecisionsPage({ repoId }: { repoId: string }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [open, setOpen] = useState<Decision | null>(null);

  async function load() {
    if (!repoId) return;
    const { decisions } = await api.listDecisions(repoId, filter === "all" ? undefined : filter);
    setDecisions(decisions);
  }

  useEffect(() => { load(); }, [repoId, filter]);

  async function revoke(d: Decision) {
    const reason = prompt("Reason for revoking this decision?");
    if (!reason) return;
    await api.revokeDecision(d.id, reason);
    load();
  }

  return (
    <div className="grid-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <div className="card">
        <div className="tabs">
          {FILTERS.map((f) => (
            <button key={f} className={filter === f ? "active" : ""} onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>
        {decisions.length === 0 && <p className="empty-state">No decisions in this state.</p>}
        {decisions.map((d) => (
          <div key={d.id} className="decision-list-item">
            <div className="rule">{d.rule_key} <span className="pill low">{d.kind}</span> <span className={`pill ${d.status === "approved" ? "applicable" : d.status === "revoked" ? "expired" : "needs_context"}`}>{d.status}</span></div>
            <div className="scope">{d.scope.path_glob} {d.scope.dependency_name ? `· ${d.scope.dependency_name} ${d.scope.version_range}` : ""}</div>
            <p style={{ fontSize: 13, margin: "6px 0" }}>{d.rationale}</p>
            <p style={{ fontSize: 12, color: "var(--muted)" }}>
              {d.effective_from ? `Effective ${d.effective_from}` : "Not yet effective"} {d.expires_at ? `→ expires ${d.expires_at}` : "(no expiry)"}
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button className="ghost" onClick={() => setOpen(d)}>Open decision</button>
              {d.status === "approved" && <button className="ghost" onClick={() => revoke(d)}>Revoke</button>}
            </div>
          </div>
        ))}
      </div>
      <div className="card">
        <p className="section-title">Evidence</p>
        {!open && <p className="empty-state">Select a decision to see its full source timeline.</p>}
        {open && (
          <div className="evidence-card">
            <dl>
              <dt>What was decided?</dt><dd>{open.rationale}</dd>
              <dt>By whom?</dt><dd>{open.approved_by ?? "not yet approved"}</dd>
              <dt>Where does it apply?</dt><dd>{open.scope.path_glob} {open.scope.dependency_name ?? ""} {open.scope.version_range ?? ""}</dd>
              <dt>Until when?</dt><dd>{open.expires_at ?? "no expiry"}</dd>
              <dt>Source events</dt><dd>{open.source_event_ids.join(", ") || "none"}</dd>
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
