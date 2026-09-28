import { z } from "zod";

/**
 * Shared schemas and error codes.
 * Rule from the PRD: "packages/contracts — Shared schemas and error codes; API/UI cannot drift."
 * Everything the API returns and the UI renders should be validated against these shapes.
 */

// ---------------------------------------------------------------------------
// Roles & permissions
// ---------------------------------------------------------------------------

export const RoleSchema = z.enum(["viewer", "contributor", "maintainer"]);
export type Role = z.infer<typeof RoleSchema>;

export const CAPABILITIES: Record<
  Role,
  { submitReview: boolean; draftDecision: boolean; approveDecision: boolean; resetDemo: boolean; runEvaluation: boolean }
> = {
  viewer: { submitReview: false, draftDecision: false, approveDecision: false, resetDemo: false, runEvaluation: false },
  contributor: { submitReview: true, draftDecision: true, approveDecision: false, resetDemo: false, runEvaluation: false },
  maintainer: { submitReview: true, draftDecision: true, approveDecision: true, resetDemo: true, runEvaluation: true },
};

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export const DecisionKindSchema = z.enum(["convention", "temporary_exception", "correction"]);
export type DecisionKind = z.infer<typeof DecisionKindSchema>;

export const DecisionStatusSchema = z.enum(["draft", "approved", "revoked", "rejected"]);
export type DecisionStatus = z.infer<typeof DecisionStatusSchema>;

export const ScopeSchema = z.object({
  path_glob: z.string().min(1, "path_glob is required; use ** for deliberately repository-wide scope"),
  dependency_name: z.string().min(1).optional(),
  version_range: z.string().min(1).optional(),
  expires_at: z.string().optional(),
});
export type Scope = z.infer<typeof ScopeSchema>;

export const DecisionSchema = z.object({
  id: z.string().uuid(),
  repo_id: z.string().uuid(),
  version: z.number().int().min(1),
  kind: DecisionKindSchema,
  rule_key: z.string().min(1),
  scope: ScopeSchema,
  rationale: z.string().min(1),
  source_event_ids: z.array(z.string()),
  status: DecisionStatusSchema,
  approved_by: z.string().nullable().optional(),
  approved_at: z.string().nullable().optional(),
  effective_from: z.string().nullable().optional(),
  expires_at: z.string().nullable().optional(),
  supersedes_id: z.string().uuid().nullable().optional(),
  draft_payload: z.record(z.any()).nullable().optional(),
  draft_status: z.enum(["queued", "running", "ready", "failed"]).nullable().optional(),
  created_at: z.string(),
});
export type Decision = z.infer<typeof DecisionSchema>;

export const ApplicabilityStatusSchema = z.enum([
  "applicable",
  "out_of_scope",
  "expired",
  "superseded",
  "conflict",
  "needs_context",
]);
export type ApplicabilityStatus = z.infer<typeof ApplicabilityStatusSchema>;

export const ApplicabilityResultSchema = z.object({
  decision_id: z.string().uuid(),
  rule_key: z.string(),
  status: ApplicabilityStatusSchema,
  reason: z.string(),
});
export type ApplicabilityResult = z.infer<typeof ApplicabilityResultSchema>;

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export const DispositionSchema = z.enum([
  "accepted",
  "incorrect",
  "already_handled",
  "temporary_exception",
  "preference",
]);
export type Disposition = z.infer<typeof DispositionSchema>;

export const FeedbackInputSchema = z.object({
  finding_id: z.string().min(1),
  disposition: DispositionSchema,
  reason: z.string().min(1, "A reason is mandatory."),
  proposed_scope: ScopeSchema.optional(),
}).refine(
  (f) => f.disposition !== "temporary_exception" || !!f.proposed_scope,
  { message: "temporary_exception requires target rule, exact scope, rationale and expiry (proposed_scope)." }
);
export type FeedbackInput = z.infer<typeof FeedbackInputSchema>;

export const FeedbackSchema = z.object({
  id: z.string().uuid(),
  review_run_id: z.string().uuid(),
  finding_id: z.string(),
  actor_id: z.string(),
  disposition: DispositionSchema,
  reason: z.string(),
  proposed_scope: ScopeSchema.nullable().optional(),
  idempotency_key: z.string(),
  created_at: z.string(),
});
export type Feedback = z.infer<typeof FeedbackSchema>;

// ---------------------------------------------------------------------------
// Review findings / output (LLM-facing schema, validated server-side)
// ---------------------------------------------------------------------------

export const SeveritySchema = z.enum(["low", "medium", "high"]);
export const CategorySchema = z.enum(["reliability", "security", "style", "correctness", "maintainability"]);

export const FindingSchema = z.object({
  id: z.string(),
  category: CategorySchema,
  severity: SeveritySchema,
  file: z.string(),
  line_start: z.number().int().min(1),
  line_end: z.number().int().min(1),
  message: z.string().min(1),
  suggestion: z.string().min(1),
  evidence_refs: z.array(z.string()),
  rule_key: z.string().nullable().optional(),
  disposition: z.enum(["used", "rejected", "awaiting_verification"]).default("awaiting_verification"),
  applicability: ApplicabilityResultSchema.nullable().optional(),
});
export type Finding = z.infer<typeof FindingSchema>;

export const ReviewOutputSchema = z.object({
  summary: z.string(),
  findings: z.array(FindingSchema).max(5),
  questions: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
});
export type ReviewOutput = z.infer<typeof ReviewOutputSchema>;

export const ReviewModeSchema = z.enum(["generic", "static", "memory"]);
export type ReviewMode = z.infer<typeof ReviewModeSchema>;

export const ReviewStatusSchema = z.enum([
  "queued",
  "recalling",
  "generating",
  "validating",
  "complete",
  "failed",
]);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

export const ReviewInputSchema = z.object({
  repo_id: z.string().uuid(),
  mode: ReviewModeSchema.default("memory"),
  title: z.string().min(1),
  diff: z.string().min(1),
  context_files: z.array(z.object({ path: z.string(), content: z.string() })).default([]),
  dependency_versions: z.record(z.string()).default({}),
  demo_time: z.string().nullable().optional(),
}).superRefine((val, ctx) => {
  const files = new Set([...val.diff.matchAll(/^\+\+\+ b\/(.+)$/gm)].map((m) => m[1]));
  if (files.size > 3) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Diff touches more than 3 files (P0 limit)." });
  }
  if (val.diff.split("\n").length > 200 + files.size * 4) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Diff exceeds the 200 changed-line budget." });
  }
  const totalBytes = Buffer.byteLength(val.diff, "utf8") + val.context_files.reduce((n, f) => n + Buffer.byteLength(f.content, "utf8"), 0);
  if (totalBytes > 30 * 1024) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Total review input exceeds the 30 KB limit." });
  }
  for (const f of val.context_files) {
    if (f.path.includes("..") || f.path.startsWith("/")) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unsafe path rejected: ${f.path}` });
    }
  }
});
export type ReviewInput = z.infer<typeof ReviewInputSchema>;

export const ReviewRunSchema = z.object({
  id: z.string().uuid(),
  repo_id: z.string().uuid(),
  demo_run_id: z.string().uuid(),
  created_by: z.string(),
  mode: ReviewModeSchema,
  input: ReviewInputSchema,
  output: ReviewOutputSchema.nullable(),
  status: ReviewStatusSchema,
  review_time: z.string(),
  decision_revision: z.number().int(),
  metadata: z.record(z.any()).default({}),
  created_at: z.string(),
});
export type ReviewRun = z.infer<typeof ReviewRunSchema>;

// ---------------------------------------------------------------------------
// Memory jobs
// ---------------------------------------------------------------------------

export const MemoryJobStatusSchema = z.enum(["queued", "running", "retained", "ready", "retry_wait", "failed"]);
export type MemoryJobStatus = z.infer<typeof MemoryJobStatusSchema>;

export const MemoryJobSchema = z.object({
  id: z.string().uuid(),
  event_id: z.string(),
  demo_run_id: z.string().uuid(),
  operation_id: z.string(),
  status: MemoryJobStatusSchema,
  attempt_count: z.number().int(),
  last_error: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type MemoryJob = z.infer<typeof MemoryJobSchema>;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type ErrorCode =
  | "INVALID_INPUT"
  | "TOO_LARGE"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "REVIEW_CONTEXT_CHANGED"
  | "MISSING_EXPIRY_OR_SOURCE"
  | "MEMORY_UNAVAILABLE"
  | "PROVIDER_UNAVAILABLE"
  | "INTERNAL";

export interface ApiError {
  code: ErrorCode;
  message: string;
  field_errors?: Record<string, string>;
  retryable: boolean;
}

export function apiError(code: ErrorCode, message: string, opts: Partial<Omit<ApiError, "code" | "message">> = {}): ApiError {
  return { code, message, retryable: false, ...opts };
}

export const HTTP_STATUS_FOR_CODE: Record<ErrorCode, number> = {
  INVALID_INPUT: 400,
  TOO_LARGE: 413,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  REVIEW_CONTEXT_CHANGED: 409,
  MISSING_EXPIRY_OR_SOURCE: 422,
  MEMORY_UNAVAILABLE: 200, // handled as a labelled degraded state, not a hard failure
  PROVIDER_UNAVAILABLE: 502,
  INTERNAL: 500,
};

// ---------------------------------------------------------------------------
// Events (append-only)
// ---------------------------------------------------------------------------

export const EventSchema = z.object({
  id: z.string(),
  repo_id: z.string().uuid(),
  actor_id: z.string(),
  type: z.string(),
  payload: z.record(z.any()),
  occurred_at: z.string(),
  recorded_at: z.string(),
});
export type Event = z.infer<typeof EventSchema>;
