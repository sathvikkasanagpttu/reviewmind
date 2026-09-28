import { randomUUID } from "crypto";
import type {
  HindsightAdapter,
  RetainRequest,
  RetainResult,
  RecallRequest,
  RecallResult,
  ReflectRequest,
  ReflectResult,
  OperationStatusResult,
  MemoryFact,
  MemoryOperationStatus,
} from "./types";

interface StoredOperation {
  operationId: string;
  bankId: string;
  status: MemoryOperationStatus;
  eventId: string;
  content: Record<string, unknown>;
  tags: string[];
  createdAtMs: number;
  readyAtMs: number; // simulated ingestion latency
}

/**
 * A deterministic, in-process stand-in for Hindsight Cloud.
 *
 * It intentionally simulates asynchronous ingestion (queued -> running ->
 * retained -> ready) with a short, fixed delay rather than pretending writes
 * are instantly recallable — the PRD is explicit that "a successful request
 * alone is not proof of retrieval readiness."
 *
 * This adapter is fully offline: no network calls, no external dependency.
 * It is a development/demo default, not a claim of Hindsight's real behaviour.
 */
export class InMemoryHindsightAdapter implements HindsightAdapter {
  private banks = new Map<string, boolean>();
  private operations = new Map<string, StoredOperation>();
  private readonly ingestDelayMs: number;

  constructor(opts: { ingestDelayMs?: number } = {}) {
    this.ingestDelayMs = opts.ingestDelayMs ?? 400;
  }

  async createBank(seedLabel: string): Promise<{ bankId: string }> {
    const bankId = `bank_${seedLabel}_${randomUUID().slice(0, 8)}`;
    this.banks.set(bankId, true);
    return { bankId };
  }

  async retain(req: RetainRequest): Promise<RetainResult> {
    if (!this.banks.has(req.bankId)) this.banks.set(req.bankId, true);
    const operationId = `op_${randomUUID()}`;
    const now = Date.now();
    this.operations.set(operationId, {
      operationId,
      bankId: req.bankId,
      status: "queued",
      eventId: req.eventId,
      content: req.content,
      tags: req.tags ?? [],
      createdAtMs: now,
      readyAtMs: now + this.ingestDelayMs,
    });
    // Advance synchronously to "running" so operationStatus() has something
    // meaningful immediately; readiness still depends on elapsed time.
    const op = this.operations.get(operationId)!;
    op.status = "running";
    return { operationId, status: op.status };
  }

  async operationStatus(operationId: string): Promise<OperationStatusResult> {
    const op = this.operations.get(operationId);
    if (!op) return { operationId, status: "failed", lastError: "unknown operation" };
    if (op.status === "running" && Date.now() >= op.readyAtMs) {
      op.status = "ready";
    }
    return { operationId, status: op.status };
  }

  async recall(req: RecallRequest): Promise<RecallResult> {
    const facts: MemoryFact[] = [];
    for (const op of this.operations.values()) {
      if (op.bankId !== req.bankId) continue;
      if (op.status !== "ready") continue; // canonical-status check happens again in the decision engine
      if (req.tags && req.tags.length > 0) {
        const hasTag = req.tags.some((t) => op.tags.includes(t));
        if (!hasTag) continue;
      }
      const haystack = JSON.stringify(op.content).toLowerCase();
      const needle = req.query.toLowerCase();
      const relevant = needle.split(/\s+/).some((word) => word.length > 2 && haystack.includes(word));
      if (!relevant && req.query.trim() !== "") continue;
      facts.push({
        factId: `fact_${op.operationId}`,
        sourceEventId: op.eventId,
        content: JSON.stringify(op.content),
        createdAt: new Date(op.createdAtMs).toISOString(),
      });
    }
    return { facts: facts.slice(0, req.limit ?? 20) };
  }

  async reflect(req: ReflectRequest): Promise<ReflectResult> {
    // Grounded synthesis: only draft from operations whose eventId is in the
    // supplied feedback set. Never invent a rule_key or scope out of thin air.
    const relevantOps = [...this.operations.values()].filter(
      (op) => req.feedbackEventIds.includes(op.eventId) && op.bankId
    );
    if (relevantOps.length === 0) {
      return { draft: null, validationFailed: true };
    }
    const latest = relevantOps[relevantOps.length - 1];
    const content = latest.content as Record<string, any>;
    const proposedScope = content.proposed_scope;
    if (!proposedScope || !proposedScope.path_glob) {
      return { draft: null, validationFailed: true, rawResponse: content };
    }
    return {
      draft: {
        rule_key: content.rule_key ?? content.finding_rule_key ?? "unknown-rule",
        kind: content.disposition === "temporary_exception" ? "temporary_exception" : "correction",
        rationale: content.reason ?? "No rationale supplied.",
        scope: {
          path_glob: proposedScope.path_glob,
          dependency_name: proposedScope.dependency_name,
          version_range: proposedScope.version_range,
        },
        expires_at: proposedScope.expires_at ?? null,
        source_event_ids: relevantOps.map((o) => o.eventId),
      },
      validationFailed: false,
    };
  }
}
