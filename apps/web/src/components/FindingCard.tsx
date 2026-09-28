import type { Finding } from "../api";

export function FindingCard({ finding, onGiveFeedback }: { finding: Finding; onGiveFeedback: (f: Finding) => void }) {
  return (
    <div className="finding-card">
      <h4>{finding.file}:{finding.line_start}{finding.line_end !== finding.line_start ? `-${finding.line_end}` : ""}</h4>
      <div className="meta">
        <span className={`pill ${finding.severity}`}>{finding.severity}</span>
        <span className="pill low">{finding.category}</span>
        {finding.rule_key && <span className="pill low">{finding.rule_key}</span>}
        {finding.applicability && <span className={`pill ${finding.applicability.status}`}>{finding.applicability.status}</span>}
      </div>
      <p>{finding.message}</p>
      <p style={{ color: "var(--muted)", fontSize: 13 }}><strong>Suggestion:</strong> {finding.suggestion}</p>
      {finding.applicability && (
        <div className="evidence">
          <strong>Memory check:</strong> {finding.applicability.reason}
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <button className="secondary" onClick={() => onGiveFeedback(finding)}>Give feedback</button>
      </div>
    </div>
  );
}
