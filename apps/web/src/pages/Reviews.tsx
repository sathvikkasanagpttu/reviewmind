import { useEffect, useState } from "react";
import { api, type PrFixture, type ReviewRun, type Finding } from "../api";
import { FindingCard } from "../components/FindingCard";
import { FeedbackDrawer, type FeedbackDraft } from "../components/FeedbackDrawer";
import { DecisionReviewCard } from "../components/DecisionReviewCard";
import { DiffViewer } from "../components/DiffViewer";

const MODES = ["memory", "static", "generic"] as const;
const MODE_DESCRIPTIONS = {
  memory: "Checks this change against scoped decisions and their limits.",
  static: "Checks this change against repository rules without memory.",
  generic: "Reviews this change without repository-specific context.",
};

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
    <div className="reviews-page">
      <section className="review-hero" aria-labelledby="review-hero-title">
        <div className="review-hero-copy">
          <p className="hero-eyebrow"><span className="hero-signal" /> Engineering decision memory</p>
          <h1 id="review-hero-title">Review with context.</h1>
          <p className="hero-description">Keep good exceptions useful, scoped, and accountable as code evolves.</p>
        </div>
        <div className="hero-identity" aria-label="ReviewMind synthetic demo workspace">
          <span className="hero-mark" aria-hidden="true">RM</span>
          <span><strong>ReviewMind</strong><small>Synthetic workspace</small></span>
        </div>
        <div className="hero-index" aria-hidden="true">01 <span /> 03</div>
      </section>

      <div className="grid-3">
      <div className="card review-rail">
        <p className="section-title">Seed PRs</p>
        {prFixtures.map((pr) => (
          <div key={pr.id} className={`pr-item ${selectedPr?.id === pr.id ? "active" : ""}`} onClick={() => selectPr(pr)}>
            <div className="title">{pr.id}</div>
            <div className="sub">{pr.expected_principle}</div>
          </div>
        ))}
        {prFixtures.length === 0 && <p className="empty-state">No seed data yet — start the API.</p>}
      </div>

      <div className="card review-editor">
        <div className="tabs">
          {MODES.map((m) => (
            <button key={m} className={mode === m ? "active" : ""} onClick={() => setMode(m)}>{m}</button>
          ))}
        </div>
        <p className="mode-description">{MODE_DESCRIPTIONS[mode]}</p>
        <label className="label">Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="PR title" />
        <label className="label diff-section-label">Diff preview</label>
        <DiffViewer diff={diff} />
        <div className="diff-editor">
          <label className="label" htmlFor="diff-source">Edit unified diff</label>
          <textarea id="diff-source" className="diff" value={diff} onChange={(e) => setDiff(e.target.value)} placeholder="--- a/file\n+++ b/file\n..." />
        </div>
        <div className="review-context-fields">
          <div className="review-field">
            <label className="label">Dependency versions (JSON)</label>
            <input value={depVersions} onChange={(e) => setDepVersions(e.target.value)} />
          </div>
          <div className="review-field">
            <label className="label">Demo time (ISO, optional)</label>
            <input value={demoTime} onChange={(e) => setDemoTime(e.target.value)} placeholder="2026-09-29T12:00:00Z" />
          </div>
        </div>
        <div className="review-submit">
          <button disabled={loading || !diff} onClick={runReview}>{loading ? "Reviewing…" : "Review change"}</button>
        </div>
        {error && <p className="review-error" role="alert">{error}</p>}
      </div>

      <div className="card review-findings">
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
    </div>
  );
}
