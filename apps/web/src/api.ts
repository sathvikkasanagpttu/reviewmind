const API_BASE = "/api";

export interface DemoUser { id: string; name: string; role: "viewer" | "contributor" | "maintainer"; }

export interface PrFixture {
  id: string;
  title: string;
  diff: string;
  dependency_versions: Record<string, string>;
  demo_time: string | null;
  expected_principle: string;
}

export interface Finding {
  id: string;
  category: string;
  severity: "low" | "medium" | "high";
  file: string;
  line_start: number;
  line_end: number;
  message: string;
  suggestion: string;
  evidence_refs: string[];
  rule_key: string | null;
  disposition: "used" | "rejected" | "awaiting_verification";
  applicability?: { decision_id: string; rule_key: string; status: string; reason: string } | null;
}

export interface ReviewOutput { summary: string; findings: Finding[]; questions: string[]; limitations: string[]; }
export interface ReviewRun {
  id: string; repo_id: string; mode: string; status: string; output: ReviewOutput | null;
  review_time: string; input: any;
}

export interface Decision {
  id: string; repo_id: string; version: number; kind: string; rule_key: string;
  scope: { path_glob: string; dependency_name?: string; version_range?: string };
  rationale: string; status: string; approved_by?: string | null; approved_at?: string | null;
  effective_from?: string | null; expires_at?: string | null; draft_status?: string | null;
  source_event_ids: string[]; source_timeline?: any[];
}

let currentUserId = "demo-maintainer";
export function setCurrentUser(id: string) { currentUserId = id; }
export function getCurrentUser() { return currentUserId; }

async function req(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${currentUserId}`,
      ...(opts.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(body?.error?.message ?? `Request failed (${res.status})`), { code: body?.error?.code, fieldErrors: body?.error?.field_errors });
  }
  return body;
}

export const api = {
  bootstrap: () => req("/bootstrap"),
  repoFiles: (repoId: string) => req(`/repos/${repoId}/files`),
  submitReview: (input: any) => req("/reviews", { method: "POST", body: JSON.stringify(input) }),
  getReview: (id: string) => req(`/reviews/${id}`) as Promise<ReviewRun>,
  sendFeedback: (reviewId: string, input: any) =>
    req(`/reviews/${reviewId}/feedback`, {
      method: "POST",
      headers: { "idempotency-key": `${reviewId}:${input.finding_id}:${Date.now()}` },
      body: JSON.stringify(input),
    }),
  draftDecision: (repoId: string, feedbackIds: string[]) =>
    req("/decision-drafts", { method: "POST", body: JSON.stringify({ repo_id: repoId, feedback_ids: feedbackIds }) }),
  getDecision: (id: string) => req(`/decisions/${id}`) as Promise<Decision>,
  approveDecision: (id: string, payload: any) => req(`/decisions/${id}/approve`, { method: "POST", body: JSON.stringify(payload) }),
  revokeDecision: (id: string, reason: string) => req(`/decisions/${id}/revoke`, { method: "POST", body: JSON.stringify({ reason }) }),
  listDecisions: (repoId: string, status?: string) => req(`/repos/${repoId}/decisions${status ? `?status=${status}` : ""}`),
  memoryJobStatus: (opId: string) => req(`/memory-jobs/${opId}`),
  resetDemo: (repoId: string) => req("/demo/reset", { method: "POST", body: JSON.stringify({ repo_id: repoId }) }),
  runEvaluations: (repoId: string) => req("/evaluations", { method: "POST", body: JSON.stringify({ repo_id: repoId }) }),
};
