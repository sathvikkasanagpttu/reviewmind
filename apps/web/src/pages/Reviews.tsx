import { useEffect, useState } from "react";
import { api, type PrFixture, type ReviewRun, type Finding } from "../api";
import { FindingCard } from "../components/FindingCard";
import { FeedbackDrawer, type FeedbackDraft } from "../components/FeedbackDrawer";
import { DecisionReviewCard } from "../components/DecisionReviewCard";

const MODES = ["memory", "static", "generic"] as const;

export function ReviewsPage({ repoId }: { repoId: string }) {
  const [prFixtures, setPrFixtures] = useState<PrFixture[]>([]);
  const [selectedPr, setSelectedPr] = useState<PrFixture | null>(null);
  const [title, setTitle] = useState("");
  const [diff, setDiff] = useState("");
  const [demoTime, setDemoTime] = useState("");
  const [depVersions, setDepVersions] = useState("{}");
  const [mode, setMode] = useState<(typeof MODES)[number]>("memory");
  const [run, setRun] = useState<ReviewRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFeedbackFinding, setActiveFeedbackFinding] = useState<Finding | null>(null);
  const [draftDecisionId, setDraftDecisionId] = useState<string | null>(null);
  const [lastFeedbackIds, setLastFeedbackIds] = useState<string[]>([]);

  useEffect(() => {
    if (!repoId) return;
    api.bootstrap().then((b) => setPrFixtures(b.pr_fixtures));
  }, [repoId]);

  function selectPr(pr: PrFixture) {
    setSelectedPr(pr);
    setTitle(pr.title);
    setDiff(pr.diff);
    setDemoTime(pr.demo_time ?? "");
    setDepVersions(JSON.stringify(pr.dependency_versions));
    setRun(null);
    setDraftDecisionId(null);
  }

  async function runReview() {
    setLoading(true);
    setError(null);
    setRun(null);
    try {
      let dependency_versions = {};
      try { dependency_versions = JSON.parse(depVersions || "{}"); } catch { /* keep empty */ }
      const { review_id } = await api.submitReview({
        repo_id: repoId,
        mode,
        title: title || "Untitled review",
        diff,
        context_files: [],
        dependency_versions,
        demo_time: demoTime || null,
      });
      const result = await api.getReview(review_id);
      setRun(result);
    } catch (e: any) {
      setError(e.fieldErrors ? Object.values(e.fieldErrors).join(" ") : e.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveFeedback(draft: FeedbackDraft) {
    if (!run) return;
    const { feedback_id } = await api.sendFeedback(run.id, draft);
    setActiveFeedbackFinding(null);
    if (draft.disposition === "temporary_exception" || draft.disposition === "incorrect") {
      const ids = [...lastFeedbackIds, feedback_id];
      setLastFeedbackIds(ids);
      const { draft_id } = await api.draftDecision(repoId, [feedback_id]);
      setDraftDecisionId(draft_id);
    }
  }

  return (
    <div className="grid-3">
      <div className="card">
        <p className="section-title">Seed PRs</p>
        {prFixtures.map((pr) => (
          <div key={pr.id} className={`pr-item ${selectedPr?.id === pr.id ? "active" : ""}`} onClick={() => selectPr(pr)}>
            <div className="title">{pr.id}</div>
            <div className="sub">{pr.expected_principle}</div>
          </div>
        ))}
        {prFixtures.length === 0 && <p className="empty-state">No seed data yet — start the API.</p>}
      </div>

      <div className="card">
        <div className="tabs">
          {MODES.map((m) => (
            <button key={m} className={mode === m ? "active" : ""} onClick={() => setMode(m)}>{m}</button>
          ))}
        </div>
        <label className="label">Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="PR title" />
        <label className="label" style={{ marginTop: 10 }}>Diff (pasted unified diff)</label>
        <textarea className="diff" value={diff} onChange={(e) => setDiff(e.target.value)} placeholder="--- a/file\n+++ b/file\n..." />
        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <div style={{ flex: 1 }}>
            <label className="label">Dependency versions (JSON)</label>
            <input value={depVersions} onChange={(e) => setDepVersions(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="label">Demo time (ISO, optional)</label>
            <input value={demoTime} onChange={(e) => setDemoTime(e.target.value)} placeholder="2026-09-29T12:00:00Z" />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button disabled={loading || !diff} onClick={runReview}>{loading ? "Reviewing…" : "Review change"}</button>
        </div>
        {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>{error}</p>}
      </div>

      <div className="card">
        <p className="section-title">Findings + memory</p>
        {!run && <p className="empty-state">No findings within supplied context yet — run a review.</p>}
        {run?.output && (
          <>
            <p style={{ fontSize: 13, color: "var(--muted)" }}>{run.output.summary}</p>
            {run.output.findings.length === 0 && <p className="empty-state">No findings within supplied context</p>}
            {run.output.findings.map((f) => (
              <FindingCard key={f.id} finding={f} onGiveFeedback={setActiveFeedbackFinding} />
            ))}
            {run.output.questions.length > 0 && (
              <div className="evidence-card">
                <strong>Questions</strong>
                <ul style={{ margin: "6px 0 0 16px" }}>{run.output.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
              </div>
            )}
          </>
        )}
        {activeFeedbackFinding && (
          <FeedbackDrawer finding={activeFeedbackFinding} onCancel={() => setActiveFeedbackFinding(null)} onSave={saveFeedback} />
        )}
        {draftDecisionId && <DecisionReviewCard decisionId={draftDecisionId} onApproved={() => setDraftDecisionId(null)} />}
      </div>
    </div>
  );
}
