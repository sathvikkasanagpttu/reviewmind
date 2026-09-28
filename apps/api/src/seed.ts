import fs from "fs";
import path from "path";
import { db, newId, nowIso, appendEvent } from "./db";
import type { Decision } from "@reviewmind/contracts";
import type { HindsightAdapter } from "@reviewmind/memory";

const FIXTURES_DIR = path.resolve(__dirname, "../../../fixtures");

export const DEMO_USERS = [
  { id: "demo-viewer", name: "Vikram (Viewer)", role: "viewer" as const },
  { id: "demo-contributor", name: "Asha (Contributor)", role: "contributor" as const },
  { id: "demo-maintainer", name: "Dr. Madhuri (Maintainer)", role: "maintainer" as const },
];

export function loadFixtureRepoFiles(): { path: string; content: string }[] {
  const root = path.join(FIXTURES_DIR, "repo", "src");
  const out: { path: string; content: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push({ path: path.relative(path.join(FIXTURES_DIR, "repo"), full).replace(/\\/g, "/"), content: fs.readFileSync(full, "utf8") });
    }
  };
  walk(root);
  return out;
}

export function loadPrFixtures(): Record<string, any> {
  const dir = path.join(FIXTURES_DIR, "prs");
  const out: Record<string, any> = {};
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const data = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    out[data.id] = data;
  }
  return out;
}

export function loadEvaluationCases(): any[] {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, "evaluation-cases.json"), "utf8"));
}

export function loadSeedEvents(): any[] {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, "seed-events.json"), "utf8"));
}

/**
 * Seed a fresh demo run: workspace, repo, seeded users/memberships, seed
 * history events retained into the memory adapter, and the one pre-approved
 * decision (014) the demo journeys rely on.
 */
export async function seedDemoRepo(memory: HindsightAdapter) {
  db.reset();

  for (const u of DEMO_USERS) db.users.set(u.id, u);

  const workspaceId = newId();
  db.workspaces.set(workspaceId, { id: workspaceId, name: "democart", created_at: nowIso() });
  for (const u of DEMO_USERS) db.memberships.push({ workspace_id: workspaceId, user_id: u.id, role: u.role });

  const repoId = newId();
  const { bankId } = await memory.createBank("democart-integrations");
  const demoRunId = newId();
  db.demoRuns.set(demoRunId, { id: demoRunId, repo_id: repoId, bank_id: bankId, is_demo: true, created_at: nowIso() });
  db.repositories.set(repoId, { id: repoId, workspace_id: workspaceId, name: "democart-integrations", active_run_id: demoRunId, decision_revision: 1 });

  // Retain seed history (pre-existing context, all timestamped in the past).
  const seedEvents = loadSeedEvents();
  for (const se of seedEvents) {
    const ev = appendEvent(repoId, "demo-maintainer", se.type, se, se.occurred_at);
    const op = await memory.retain({ bankId, eventId: ev.id, kind: "decision_approved", content: se, tags: [se.rule_key].filter(Boolean) });
    db.memoryJobs.set(op.operationId, {
      id: newId(),
      event_id: ev.id,
      demo_run_id: demoRunId,
      operation_id: op.operationId,
      status: op.status,
      attempt_count: 1,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
  }

  // Force ingestion to "ready" for seed history so PR-A works immediately
  // (a live judge-added decision still goes through the real queued->ready
  // path and readiness probe — see routes/decisions.ts).
  await new Promise((r) => setTimeout(r, 450));

  // Decision 014: the approved temporary exception the whole demo hinges on.
  const decisionEvent = appendEvent(repoId, "demo-maintainer", "decision_approved", { rule_key: "transport-wrapper" }, "2026-09-16T09:00:00Z");
  const decision: Decision = {
    id: newId(),
    repo_id: repoId,
    version: 1,
    kind: "temporary_exception",
    rule_key: "transport-wrapper",
    scope: { path_glob: "src/adapters/legacy/**", dependency_name: "bridge-client", version_range: ">=1.8.0 <2.0.0" },
    rationale:
      "bridge-client 1.8.0's legacy status endpoint is incompatible with the wrapper's tracing header (fixture compatibility note, 2026-09-15). Direct request retained; explicit 2s timeout still required.",
    source_event_ids: [decisionEvent.id],
    status: "approved",
    approved_by: "demo-maintainer",
    approved_at: "2026-09-16T09:00:00Z",
    effective_from: "2026-09-16T00:00:00Z",
    expires_at: "2026-09-30T00:00:00Z",
    supersedes_id: null,
    draft_payload: null,
    draft_status: "ready",
    created_at: "2026-09-16T09:00:00Z",
  };
  db.decisions.set(decision.id, decision);

  // Retain the approved decision itself as a first-class memory fact too,
  // so recall() can surface "decision 014" by content, not only by rule tag.
  const opDecision = await memory.retain({
    bankId,
    eventId: decisionEvent.id,
    kind: "decision_approved",
    content: { ...decision, note: "Decision 014" },
    tags: ["transport-wrapper"],
  });
  db.memoryJobs.set(opDecision.operationId, {
    id: newId(),
    event_id: decisionEvent.id,
    demo_run_id: demoRunId,
    operation_id: opDecision.operationId,
    status: opDecision.status,
    attempt_count: 1,
    created_at: nowIso(),
    updated_at: nowIso(),
  });
  await new Promise((r) => setTimeout(r, 450));

  return { workspaceId, repoId, demoRunId, bankId };
}
