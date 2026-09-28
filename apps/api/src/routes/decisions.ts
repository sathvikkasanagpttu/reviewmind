import { Router } from "express";
import type { AuthedRequest } from "../auth";
import { requireAuth, requireRole } from "../auth";
import { db, newId, nowIso, appendEvent } from "../db";
import { apiError, HTTP_STATUS_FOR_CODE, type Decision } from "@reviewmind/contracts";
import type { HindsightAdapter } from "@reviewmind/memory";

export function decisionsRouter(memory: HindsightAdapter) {
  const router = Router();

  // POST /api/decision-drafts — reflect a draft decision from selected feedback events
  router.post("/decision-drafts", requireAuth, requireRole("contributor"), async (req: AuthedRequest, res) => {
    const { repo_id, feedback_ids } = req.body as { repo_id: string; feedback_ids: string[] };
    const repo = db.repositories.get(repo_id);
    if (!repo) return res.status(HTTP_STATUS_FOR_CODE.NOT_FOUND).json({ error: apiError("NOT_FOUND", "Repository not found.") });
    if (!Array.isArray(feedback_ids) || feedback_ids.length === 0) {
      return res.status(422).json({ error: apiError("MISSING_EXPIRY_OR_SOURCE", "At least one source feedback_id is required.") });
    }
    const feedbackRecords = feedback_ids.map((id) => db.feedback.get(id)).filter((f): f is NonNullable<typeof f> => !!f);
    if (feedbackRecords.length === 0) {
      return res.status(422).json({ error: apiError("MISSING_EXPIRY_OR_SOURCE", "None of the supplied feedback_ids were found.") });
    }

    const bankId = db.demoRuns.get(repo.active_run_id)!.bank_id;
    const eventIds = feedbackRecords.map((f) => {
      // The feedback route already retained an event for each feedback item;
      // we look it up again here to ground reflect() only in real sources.
      return [...db.events.values()].filter(
        (e) => e.type === "feedback_recorded" && e.payload.finding_id === f.finding_id && e.actor_id === f.actor_id
      ).pop()?.id;
    }).filter((x): x is string => !!x);

    const reflectResult = await memory.reflect({ bankId, feedbackEventIds: eventIds });

    const draftId = newId();
    if (reflectResult.validationFailed || !reflectResult.draft) {
      const decision: Decision = {
        id: draftId, repo_id, version: 1, kind: "correction", rule_key: "unknown",
        scope: { path_glob: "**" }, rationale: "", source_event_ids: eventIds,
        status: "draft", created_at: nowIso(),
        draft_payload: null, draft_status: "failed",
      } as unknown as Decision;
      db.decisions.set(draftId, decision);
      return res.status(422).json({ error: apiError("MISSING_EXPIRY_OR_SOURCE", "Reflect could not produce a structured draft from the supplied sources.") });
    }

    const draft = reflectResult.draft;
    const decision: Decision = {
      id: draftId,
      repo_id,
      version: 1,
      kind: draft.kind,
      rule_key: draft.rule_key,
      scope: draft.scope,
      rationale: draft.rationale,
      source_event_ids: draft.source_event_ids,
      status: "draft",
      approved_by: null,
      approved_at: null,
      effective_from: null,
      expires_at: draft.expires_at ?? null,
      supersedes_id: null,
      draft_payload: draft as any,
      draft_status: "ready",
      created_at: nowIso(),
    };
    db.decisions.set(draftId, decision);
    return res.status(202).json({ draft_id: draftId });
  });

  router.get("/decisions/:id", requireAuth, (req: AuthedRequest, res) => {
    const decision = db.decisions.get(req.params.id);
    if (!decision) return res.status(HTTP_STATUS_FOR_CODE.NOT_FOUND).json({ error: apiError("NOT_FOUND", "Decision not found.") });
    const timeline = [...db.events.values()].filter((e) => decision.source_event_ids.includes(e.id));
    return res.json({ ...decision, source_timeline: timeline });
  });

  router.post("/decisions/:id/approve", requireAuth, requireRole("maintainer"), async (req: AuthedRequest, res) => {
    const decision = db.decisions.get(req.params.id);
    if (!decision) return res.status(HTTP_STATUS_FOR_CODE.NOT_FOUND).json({ error: apiError("NOT_FOUND", "Decision not found.") });
    const { scope, rationale, expected_revision, effective_from, expires_at } = req.body as any;
    const repo = db.repositories.get(decision.repo_id)!;
    if (typeof expected_revision === "number" && expected_revision !== repo.decision_revision) {
      return res.status(HTTP_STATUS_FOR_CODE.CONFLICT).json({ error: apiError("CONFLICT", "Repository decisions changed since this draft was loaded; reload and retry.") });
    }
    const finalScope = scope ?? decision.scope;
    const finalRationale = rationale ?? decision.rationale;
    const finalExpiresAt = expires_at ?? decision.expires_at;
    if (!finalRationale || (decision.kind === "temporary_exception" && !finalExpiresAt)) {
      return res.status(422).json({ error: apiError("MISSING_EXPIRY_OR_SOURCE", "A temporary exception requires a rationale and an expiry before it can be approved.") });
    }

    decision.status = "approved";
    decision.scope = finalScope;
    decision.rationale = finalRationale;
    decision.approved_by = req.user!.id;
    decision.approved_at = nowIso();
    decision.effective_from = effective_from ?? nowIso();
    decision.expires_at = finalExpiresAt;
    decision.draft_status = "ready";
    db.decisions.set(decision.id, decision);

    const event = appendEvent(decision.repo_id, req.user!.id, "decision_approved", { decision_id: decision.id, rule_key: decision.rule_key, scope: decision.scope, rationale: decision.rationale });
    repo.decision_revision += 1;

    const bankId = db.demoRuns.get(repo.active_run_id)!.bank_id;
    const op = await memory.retain({ bankId, eventId: event.id, kind: "decision_approved", content: { ...decision }, tags: [decision.rule_key] });
    db.memoryJobs.set(op.operationId, {
      id: newId(), event_id: event.id, demo_run_id: repo.active_run_id, operation_id: op.operationId,
      status: op.status, attempt_count: 1, created_at: nowIso(), updated_at: nowIso(),
    });

    return res.json({ decision_id: decision.id, event_id: event.id, job_id: op.operationId, status: decision.status });
  });

  router.post("/decisions/:id/revoke", requireAuth, requireRole("maintainer"), async (req: AuthedRequest, res) => {
    const decision = db.decisions.get(req.params.id);
    if (!decision) return res.status(HTTP_STATUS_FOR_CODE.NOT_FOUND).json({ error: apiError("NOT_FOUND", "Decision not found.") });
    const { reason, expected_revision } = req.body as { reason: string; expected_revision?: number };
    const repo = db.repositories.get(decision.repo_id)!;
    if (typeof expected_revision === "number" && expected_revision !== repo.decision_revision) {
      return res.status(HTTP_STATUS_FOR_CODE.CONFLICT).json({ error: apiError("CONFLICT", "Repository decisions changed since this draft was loaded; reload and retry.") });
    }
    decision.status = "revoked";
    db.decisions.set(decision.id, decision);
    // Canonical status flips immediately even if Hindsight has not ingested
    // the revocation yet — the decision engine always checks canonical status.
    const event = appendEvent(decision.repo_id, req.user!.id, "decision_revoked", { decision_id: decision.id, reason });
    repo.decision_revision += 1;
    return res.json({ decision_id: decision.id, event_id: event.id, status: decision.status });
  });

  router.get("/repos/:id/decisions", requireAuth, (req: AuthedRequest, res) => {
    const status = req.query.status as string | undefined;
    let list = [...db.decisions.values()].filter((d) => d.repo_id === req.params.id);
    if (status) list = list.filter((d) => d.status === status);
    return res.json({ decisions: list.slice(0, 50) });
  });

  return router;
}
