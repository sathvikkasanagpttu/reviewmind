/**
 * packages/memory — pinned Hindsight adapter interface, provenance mapping,
 * ingestion readiness.
 *
 * IMPORTANT (read this before wiring a real Hindsight account):
 * This interface mirrors Hindsight's documented concepts — retain, recall,
 * reflect — per the PRD's technical references [T1-T6]. This repository ships
 * an `InMemoryHindsightAdapter` (deterministic, offline, good enough to run
 * the full demo loop without network access) and a thin `HindsightCloudAdapter`
 * stub that shows exactly where to plug in the pinned official client.
 *
 * Swap adapters with the MEMORY_ADAPTER env var ("inmemory" | "hindsight").
 * Never accept a client-supplied bank ID — bank identifiers stay server-side.
 */

export type MemoryOperationStatus = "queued" | "running" | "retained" | "ready" | "retry_wait" | "failed";

export interface RetainRequest {
  bankId: string;
  eventId: string; // immutable event:<uuid> — retries must not create independent logical events
  kind: "feedback" | "decision_approved" | "decision_revoked";
  content: Record<string, unknown>;
  tags?: string[];
}

export interface RetainResult {
  operationId: string;
  status: MemoryOperationStatus;
}

export interface RecallRequest {
  bankId: string;
  query: string;
  tags?: string[];
  limit?: number;
}

export interface MemoryFact {
  factId: string;
  sourceEventId: string;
  content: string;
  createdAt: string;
}

export interface RecallResult {
  facts: MemoryFact[];
}

export interface ReflectRequest {
  bankId: string;
  feedbackEventIds: string[];
  /** Optional recalled history to ground the draft in, per PRD "Reflect drafts ... from selected feedback and recalled history" */
  recalledFactIds?: string[];
}

export interface ReflectDraft {
  rule_key: string;
  kind: "convention" | "temporary_exception" | "correction";
  rationale: string;
  scope: { path_glob: string; dependency_name?: string; version_range?: string };
  expires_at?: string | null;
  source_event_ids: string[];
}

export interface ReflectResult {
  draft: ReflectDraft | null;
  validationFailed: boolean;
  rawResponse?: unknown;
}

export interface OperationStatusResult {
  operationId: string;
  status: MemoryOperationStatus;
  lastError?: string | null;
}

export interface HindsightAdapter {
  retain(req: RetainRequest): Promise<RetainResult>;
  recall(req: RecallRequest): Promise<RecallResult>;
  reflect(req: ReflectRequest): Promise<ReflectResult>;
  operationStatus(operationId: string): Promise<OperationStatusResult>;
  /** Create a fresh, isolated bank namespace for a demo run without destroying prior evidence. */
  createBank(seedLabel: string): Promise<{ bankId: string }>;
}
