import { useState } from "react";
import type { Finding } from "../api";

export interface FeedbackDraft {
  finding_id: string;
  disposition: "accepted" | "incorrect" | "already_handled" | "temporary_exception" | "preference";
  reason: string;
  proposed_scope?: { path_glob: string; dependency_name?: string; version_range?: string; expires_at?: string };
}

export function FeedbackDrawer({
  finding, onCancel, onSave,
}: { finding: Finding; onCancel: () => void; onSave: (draft: FeedbackDraft) => void }) {
  const [disposition, setDisposition] = useState<FeedbackDraft["disposition"]>("accepted");
  const [reason, setReason] = useState("");
  const [pathGlob, setPathGlob] = useState(finding.file);
  const [depName, setDepName] = useState("bridge-client");
  const [versionRange, setVersionRange] = useState(">=1.8.0 <2.0.0");
  const [expiresAt, setExpiresAt] = useState("2026-09-30T00:00:00Z");

  const needsScope = disposition === "temporary_exception";

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <p className="section-title">Feedback drawer — {finding.id}</p>
      <label className="label">Disposition</label>
      <select value={disposition} onChange={(e) => setDisposition(e.target.value as any)}>
        <option value="accepted">accepted</option>
        <option value="incorrect">incorrect</option>
        <option value="already_handled">already_handled</option>
        <option value="temporary_exception">temporary_exception</option>
        <option value="preference">preference</option>
      </select>
      <label className="label" style={{ marginTop: 10 }}>Reason (mandatory)</label>
      <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this disposition applies..." />

      {needsScope && (
        <>
          <label className="label" style={{ marginTop: 10 }}>Path glob</label>
          <input value={pathGlob} onChange={(e) => setPathGlob(e.target.value)} />
          <label className="label" style={{ marginTop: 10 }}>Dependency name</label>
          <input value={depName} onChange={(e) => setDepName(e.target.value)} />
          <label className="label" style={{ marginTop: 10 }}>Version range</label>
          <input value={versionRange} onChange={(e) => setVersionRange(e.target.value)} />
          <label className="label" style={{ marginTop: 10 }}>Expires at (UTC, exclusive)</label>
          <input value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button
          disabled={!reason || (needsScope && (!pathGlob || !expiresAt))}
          onClick={() =>
            onSave({
              finding_id: finding.id,
              disposition,
              reason,
              proposed_scope: needsScope ? { path_glob: pathGlob, dependency_name: depName, version_range: versionRange, expires_at: expiresAt } : undefined,
            })
          }
        >
          Save and draft decision
        </button>
        <button className="ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
