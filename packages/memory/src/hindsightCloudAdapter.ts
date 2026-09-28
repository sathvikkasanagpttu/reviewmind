import type {
  HindsightAdapter,
  RetainRequest,
  RetainResult,
  RecallRequest,
  RecallResult,
  ReflectRequest,
  ReflectResult,
  OperationStatusResult,
} from "./types";

/**
 * Real Hindsight Cloud adapter — STUB.
 *
 * This repository does not vendor the official Hindsight TypeScript/JavaScript
 * client [T6], because doing so from this environment would mean guessing at
 * package name/version and API shape rather than pinning something verified.
 *
 * To wire a real account:
 *   1. `npm install <official-hindsight-client>` in this package.
 *   2. Set HINDSIGHT_BASE_URL / HINDSIGHT_API_KEY in your server .env.
 *   3. Replace the TODOs below with calls into the pinned client, per
 *      Hindsight's retain / recall / reflect / operations docs [T1-T5].
 *   4. Set MEMORY_ADAPTER=hindsight in apps/api/.env.
 *
 * Until then, apps/api defaults to InMemoryHindsightAdapter so the full P0
 * demo loop (retain -> reflect -> approve -> recall in a fresh session) runs
 * offline and deterministically.
 */
export class HindsightCloudAdapter implements HindsightAdapter {
  constructor(private baseUrl: string, private apiKey: string) {
    if (!baseUrl || !apiKey) {
      throw new Error(
        "HindsightCloudAdapter requires HINDSIGHT_BASE_URL and HINDSIGHT_API_KEY. " +
          "Set MEMORY_ADAPTER=inmemory to run without a live Hindsight account."
      );
    }
  }

  async createBank(_seedLabel: string): Promise<{ bankId: string }> {
    throw new Error("TODO: call the pinned Hindsight client to create a bank namespace. See file header.");
  }

  async retain(_req: RetainRequest): Promise<RetainResult> {
    throw new Error("TODO: call Hindsight retain API [T5]. See file header.");
  }

  async recall(_req: RecallRequest): Promise<RecallResult> {
    throw new Error("TODO: call Hindsight recall API [T2]. See file header.");
  }

  async reflect(_req: ReflectRequest): Promise<ReflectResult> {
    throw new Error("TODO: call Hindsight reflect API [T4]. See file header.");
  }

  async operationStatus(_operationId: string): Promise<OperationStatusResult> {
    throw new Error("TODO: call Hindsight operations API [T3]. See file header.");
  }
}
