import { randomUUID } from "crypto";
import type { Decision, Event, Feedback, MemoryJob, ReviewRun, Role } from "@reviewmind/contracts";

/**
 * In-memory ledger for the prototype run.
 *
 * This mirrors supabase/migrations/0001_init.sql column-for-column so moving
 * to real Supabase later is a drop-in swap of this module for a Postgres
 * client, not a redesign. Kept in-memory here so the whole demo loop runs
 * with zero external services when MEMORY_ADAPTER=inmemory and
 * REVIEWER_PROVIDER=rulebased (the defaults).
 */

export interface Workspace {
  id: string;
  name: string;
  created_at: string;
}

export interface Membership {
  workspace_id: string;
  user_id: string;
  role: Role;
}

export interface Repository {
  id: string;
  workspace_id: string;
  name: string;
  active_run_id: string;
  decision_revision: number;
}

export interface DemoRun {
  id: string;
  repo_id: string;
  bank_id: string;
  is_demo: boolean;
  created_at: string;
}

export interface DemoUser {
  id: string;
  name: string;
  role: Role;
}

class Store {
  workspaces = new Map<string, Workspace>();
  memberships: Membership[] = [];
  repositories = new Map<string, Repository>();
  demoRuns = new Map<string, DemoRun>();
  reviewRuns = new Map<string, ReviewRun>();
  feedback = new Map<string, Feedback>();
  decisions = new Map<string, Decision>();
  events = new Map<string, Event>();
  memoryJobs = new Map<string, MemoryJob>();
  users = new Map<string, DemoUser>();
  /** actor_id -> idempotency_key -> feedback id, per unique constraint in the PRD DB spec */
  feedbackIdempotency = new Map<string, string>();

  reset() {
    this.workspaces.clear();
    this.memberships = [];
    this.repositories.clear();
    this.demoRuns.clear();
    this.reviewRuns.clear();
    this.feedback.clear();
    this.decisions.clear();
    this.events.clear();
    this.memoryJobs.clear();
    this.feedbackIdempotency.clear();
    // users persist across a data reset (seeded accounts)
  }
}

export const db = new Store();

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return randomUUID();
}

export function appendEvent(repoId: string, actorId: string, type: string, payload: Record<string, unknown>, occurredAt?: string): Event {
  const id = `event:${newId()}`;
  const event: Event = {
    id,
    repo_id: repoId,
    actor_id: actorId,
    type,
    payload,
    occurred_at: occurredAt ?? nowIso(),
    recorded_at: nowIso(),
  };
  db.events.set(id, event);
  return event;
}

export function getRepoDecisions(repoId: string): Decision[] {
  return [...db.decisions.values()].filter((d) => d.repo_id === repoId);
}

export function getUserRole(userId: string): Role {
  return db.users.get(userId)?.role ?? "viewer";
}

export function requireRole(userId: string, min: Role): boolean {
  const order: Role[] = ["viewer", "contributor", "maintainer"];
  return order.indexOf(getUserRole(userId)) >= order.indexOf(min);
}
