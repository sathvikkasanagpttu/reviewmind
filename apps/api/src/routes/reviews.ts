import { Router } from "express";
import type { AuthedRequest } from "../auth";
import { requireAuth, requireRole } from "../auth";
import { db, newId, nowIso, appendEvent, getRepoDecisions } from "../db";
import {
  ReviewInputSchema,
  ReviewOutputSchema,
  FeedbackInputSchema,
  apiError,
  HTTP_STATUS_FOR_CODE,
  type ReviewRun,
  type ReviewOutput,
} from "@reviewmind/contracts";
import { resolveRuleApplicability, requiresExplicitTimeout } from "@reviewmind/decision-engine";
import type { HindsightAdapter, MemoryFact } from "@reviewmind/memory";
import type { ReviewerProvider } from "@reviewmind/reviewer";

const BASELINE_RULES = ["Every outgoing request must set an explicit timeout (2000ms) — never waivable by a team decision."];

export function reviewsRouter(memory: HindsightAdapter, reviewer: ReviewerProvider) {
  const router = Router();

  router.post("/reviews", requireAuth, requireRole("contributor"), async (req: AuthedRequest, res) => {
    const parsed = ReviewInputSchema.safeParse(req.body);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".") || "input"] = issue.message;
      const err = apiError("INVALID_INPUT", "Review input failed validation.", { field_errors: fieldErrors });
      return res.status(HTTP_STATUS_FOR_CODE.INVALID_INPUT).json({ error: err });
    }
    const input = parsed.data;
    const repo = db.repositories.get(input.repo_id);
    if (!repo) return res.status(HTTP_STATUS_FOR_CODE.NOT_FOUND).json({ error: apiError("NOT_FOUND", "Repository not found.") });

    const reviewId = newId();
    const reviewTime = input.demo_time ?? nowIso();
    const frozenRevision = repo.decision_revision;
    const bankId = db.demoRuns.get(repo.active_run_id)!.bank_id;

    // --- Recall step (skipped entirely in generic mode; static mode is a
    // fixed convention list rather than a live recall, per PRD) ---
    let evidencePacket: MemoryFact[] = [];
    if (input.mode === "memory") {
      const recall = await memory.recall({ bankId, query: `${input.title} ${input.diff}`.slice(0, 500), limit: 10 }).catch(() => null);
      evidencePacket = recall?.facts ?? [];
    }

    // --- Generate ---
    const { raw, parsed: rawParsed } = await reviewer.generate(input, evidencePacket, BASELINE_RULES);
    const outputParse = ReviewOutputSchema.safeParse(rawParsed);
    if (!outputParse.success) {
      const run: ReviewRun = {
        id: reviewId, repo_id: repo.id, demo_run_id: repo.active_run_id, created_by: req.user!.id,
        mode: input.mode, input, output: null, status: "failed", review_time: reviewTime,
        decision_revision: frozenRevision, metadata: { raw, error: "schema_validation_failed" }, created_at: nowIso(),
      };
      db.reviewRuns.set(reviewId, run);
      return res.status(202).json({ review_id: reviewId, status: "failed" });
    }
    const output: ReviewOutput = outputParse.data;

    // --- Deterministic applicability resolution (decision engine only; the
    // model never grants a waiver) — only meaningful in "memory" mode. ---
    const repoDecisions = getRepoDecisions(repo.id);
    for (const finding of output.findings) {
      if (!finding.rule_key) continue;
      if (finding.rule_key === "explicit-timeout-baseline") {
        // Non-waivable baseline: always surfaced regardless of mode/memory.
        continue;
      }
      if (input.mode !== "memory") continue;
      const filePath = finding.file;
      const depVersions = input.dependency_versions;
      const applicability = resolveRuleApplicability(finding.rule_key, repoDecisions, {
        filePath,
        ruleKey: finding.rule_key,
        dependencyVersions: depVersions,
        reviewTime,
      });
      finding.applicability = applicability;
      finding.disposition = applicability.status === "applicable" ? "used" : finding.disposition;
      if (applicability.status === "applicable") {
        finding.message = `${finding.message} Resolved: ${applicability.reason}`;
        finding.disposition = "used";
        // An applicable exception waives THIS finding's underlying concern —
        // but never the separately-generated timeout baseline finding.
        finding.severity = "low";
      } else {
        finding.message = `${finding.message} Memory check: ${applicability.reason}`;
        finding.disposition = "rejected";
      }
    }

    // --- Recheck revision before publishing ---
    const currentRepo = db.repositories.get(repo.id)!;
    if (currentRepo.decision_revision !== frozenRevision) {
      return res.status(HTTP_STATUS_FOR_CODE.REVIEW_CONTEXT_CHANGED).json({
        error: apiError("REVIEW_CONTEXT_CHANGED", "Decisions changed while this review was generating. Please rerun.", { retryable: true }),
      });
    }

    const run: ReviewRun = {
      id: reviewId,
      repo_id: repo.id,
      demo_run_id: repo.active_run_id,
      created_by: req.user!.id,
      mode: input.mode,
      input,
      output,
      status: "complete",
      review_time: reviewTime,
      decision_revision: frozenRevision,
      metadata: { evidence_count: evidencePacket.length, model: reviewer.constructor.name },
      created_at: nowIso(),
    };
    db.reviewRuns.set(reviewId, run);

    return res.status(202).json({ review_id: reviewId, status: "complete" });
  });

  router.get("/reviews/:id", requireAuth, (req: AuthedRequest, res) => {
    const run = db.reviewRuns.get(req.params.id);
    if (!run) return res.status(HTTP_STATUS_FOR_CODE.NOT_FOUND).json({ error: apiError("NOT_FOUND", "Review not found.") });
    return res.json(run);
  });

  router.post("/reviews/:id/feedback", requireAuth, requireRole("contributor"), async (req: AuthedRequest, res) => {
    const run = db.reviewRuns.get(req.params.id);
    if (!run) return res.status(HTTP_STATUS_FOR_CODE.NOT_FOUND).json({ error: apiError("NOT_FOUND", "Review not found.") });

    const idempotencyKey = req.header("idempotency-key");
    if (!idempotencyKey) {
      return res.status(HTTP_STATUS_FOR_CODE.INVALID_INPUT).json({ error: apiError("INVALID_INPUT", "Idempotency-Key header is required.") });
    }
    const parsed = FeedbackInputSchema.safeParse(req.body);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".") || "input"] = issue.message;
      return res.status(HTTP_STATUS_FOR_CODE.INVALID_INPUT).json({ error: apiError("INVALID_INPUT", "Feedback failed validation.", { field_errors: fieldErrors }) });
    }
    const input = parsed.data;

    const idKey = `${req.user!.id}:${idempotencyKey}`;
    const existingId = db.feedbackIdempotency.get(idKey);
    if (existingId) {
      const existing = db.feedback.get(existingId)!;
      if (existing.finding_id !== input.finding_id || existing.disposition !== input.disposition) {
        return res.status(HTTP_STATUS_FOR_CODE.CONFLICT).json({ error: apiError("CONFLICT", "Idempotency key reused with a different payload.") });
      }
      return res.status(201).json({ feedback_id: existing.id, event_id: null, reused: true });
    }

    const feedbackId = newId();
    const feedback = {
      id: feedbackId,
      review_run_id: run.id,
      finding_id: input.finding_id,
      actor_id: req.user!.id,
      disposition: input.disposition,
      reason: input.reason,
      proposed_scope: input.proposed_scope ?? null,
      idempotency_key: idempotencyKey,
      created_at: nowIso(),
    };
    db.feedback.set(feedbackId, feedback);
    db.feedbackIdempotency.set(idKey, feedbackId);

    const finding = run.output?.findings.find((f) => f.id === input.finding_id);
    const event = appendEvent(run.repo_id, req.user!.id, "feedback_recorded", {
      finding_id: input.finding_id,
      disposition: input.disposition,
      reason: input.reason,
      rule_key: finding?.rule_key ?? null,
      proposed_scope: input.proposed_scope ?? null,
    });

    const bankId = db.demoRuns.get(run.demo_run_id)!.bank_id;
    const op = await memory.retain({
      bankId,
      eventId: event.id,
      kind: "feedback",
      content: { ...event.payload, source_event_id: event.id },
      tags: [finding?.rule_key].filter((x): x is string => !!x),
    });
    db.memoryJobs.set(op.operationId, {
      id: newId(), event_id: event.id, demo_run_id: run.demo_run_id, operation_id: op.operationId,
      status: op.status, attempt_count: 1, created_at: nowIso(), updated_at: nowIso(),
    });

    return res.status(201).json({ feedback_id: feedbackId, event_id: event.id, memory_job_operation_id: op.operationId });
  });

  return router;
}
