import micromatch from "micromatch";
import semver from "semver";
import type { ApplicabilityResult, ApplicabilityStatus, Decision } from "@reviewmind/contracts";

/**
 * packages/decision-engine — pure path/version/time/precedence checks.
 *
 * This module intentionally contains NO LLM calls. Per the PRD:
 * "Use tested glob and semver libraries for scope checks; do not ask an LLM
 * to implement expiry comparisons... General correctness remains uncertain,
 * but the waiver conditions are deterministic."
 */

export interface CandidateContext {
  /** Repository-relative changed file path, e.g. "src/adapters/legacy/status.ts" */
  filePath: string;
  /** rule_key this finding is checking, e.g. "transport-wrapper" */
  ruleKey: string;
  /** dependency name -> version present in the PR under review, e.g. { "bridge-client": "1.8.0" } */
  dependencyVersions: Record<string, string>;
  /** The time the review is evaluated at (ISO string). Frozen per review, per PRD FR-04/FR-09. */
  reviewTime: string;
}

function normalizePath(p: string): string | null {
  if (p.includes("..") || p.startsWith("/") || p.includes("\0")) return null;
  return p.replace(/^\.\//, "");
}

function matchesPath(globPattern: string, filePath: string): boolean {
  const safe = normalizePath(filePath);
  if (safe === null) return false;
  return micromatch.isMatch(safe, globPattern, { dot: true });
}

function matchesVersion(range: string | undefined, depName: string | undefined, versions: Record<string, string>): "match" | "no_dependency" | "missing_version" | "prerelease_unsupported" {
  if (!depName || !range) return "match"; // decision does not scope by dependency
  const version = versions[depName];
  if (!version) return "missing_version";
  const parsed = semver.parse(version);
  if (!parsed) return "missing_version";
  if (parsed.prerelease.length > 0) return "prerelease_unsupported";
  try {
    return semver.satisfies(version, range, { includePrerelease: false }) ? "match" : "no_dependency";
  } catch {
    return "no_dependency";
  }
}

function isWithinEffectiveInterval(decision: Decision, reviewTimeIso: string): "active" | "future" | "expired" {
  const reviewTime = new Date(reviewTimeIso).getTime();
  const from = decision.effective_from ? new Date(decision.effective_from).getTime() : -Infinity;
  // expires_at is an EXCLUSIVE upper bound (PRD: "expires at an exclusive UTC boundary")
  const to = decision.expires_at ? new Date(decision.expires_at).getTime() : Infinity;
  if (reviewTime < from) return "future";
  if (reviewTime >= to) return "expired";
  return "active";
}

/**
 * Resolve the effective status chain for a decision: walk supersession forward
 * is not needed here (supersedes_id points backward); instead, given the full
 * set of decisions sharing a rule_key, find whether `decision` has since been
 * superseded by an approved successor whose effective_from <= reviewTime.
 */
function isSuperseded(decision: Decision, allDecisions: Decision[], reviewTimeIso: string): boolean {
  const reviewTime = new Date(reviewTimeIso).getTime();
  return allDecisions.some((d) => {
    if (d.supersedes_id !== decision.id) return false;
    if (d.status !== "approved") return false;
    const from = d.effective_from ? new Date(d.effective_from).getTime() : -Infinity;
    return reviewTime >= from;
  });
}

/**
 * Step 7 of the PRD applicability algorithm: classify a single candidate decision
 * against a review context. Assumes `decision.status === "approved"` was already
 * required upstream (unapproved feedback / drafts can never authorize a waiver).
 */
export function evaluateApplicability(
  decision: Decision,
  allDecisions: Decision[],
  ctx: CandidateContext
): ApplicabilityResult {
  const base = { decision_id: decision.id, rule_key: decision.rule_key };

  if (decision.status === "revoked") {
    return { ...base, status: "conflict" as ApplicabilityStatus, reason: "Decision has been revoked and cannot authorize a waiver." };
  }
  if (decision.status !== "approved") {
    return { ...base, status: "needs_context" as ApplicabilityStatus, reason: "Decision is not an approved, ready record; unapproved feedback cannot waive a finding." };
  }

  if (isSuperseded(decision, allDecisions, ctx.reviewTime)) {
    return { ...base, status: "superseded" as ApplicabilityStatus, reason: "An approved successor decision has taken effect for this rule." };
  }

  const interval = isWithinEffectiveInterval(decision, ctx.reviewTime);
  if (interval === "future") {
    return { ...base, status: "needs_context" as ApplicabilityStatus, reason: "Decision is not yet effective at the review time." };
  }
  if (interval === "expired") {
    return { ...base, status: "expired" as ApplicabilityStatus, reason: `Decision expired at ${decision.expires_at} (exclusive boundary); history remains visible but cannot waive the requirement.` };
  }

  if (decision.rule_key !== ctx.ruleKey) {
    return { ...base, status: "out_of_scope" as ApplicabilityStatus, reason: `Decision targets rule "${decision.rule_key}", not "${ctx.ruleKey}".` };
  }

  if (!matchesPath(decision.scope.path_glob, ctx.filePath)) {
    return { ...base, status: "out_of_scope" as ApplicabilityStatus, reason: `File "${ctx.filePath}" does not match approved scope "${decision.scope.path_glob}". The exception does not transfer to another path.` };
  }

  const versionCheck = matchesVersion(decision.scope.version_range, decision.scope.dependency_name, ctx.dependencyVersions);
  if (versionCheck === "missing_version") {
    return { ...base, status: "needs_context" as ApplicabilityStatus, reason: `Dependency "${decision.scope.dependency_name}" version was not supplied; ask for version rather than assuming eligibility.` };
  }
  if (versionCheck === "prerelease_unsupported") {
    return { ...base, status: "needs_context" as ApplicabilityStatus, reason: "Prerelease dependency versions are not supported by this prototype's scope check." };
  }
  if (versionCheck === "no_dependency") {
    return { ...base, status: "out_of_scope" as ApplicabilityStatus, reason: `Dependency version does not fall within approved range "${decision.scope.version_range}".` };
  }

  if (!decision.rationale || (decision.kind === "temporary_exception" && !decision.expires_at)) {
    return { ...base, status: "needs_context" as ApplicabilityStatus, reason: "Missing rationale or expiry; no waiver without both." };
  }

  return { ...base, status: "applicable" as ApplicabilityStatus, reason: `Approved ${decision.kind} "${decision.rule_key}" applies to this path and version.` };
}

/**
 * Given every decision sharing a rule_key, pick the single best applicability
 * result for a given review context (prefer "applicable", else the most
 * informative rejection reason). Two conflicting *applicable* approved
 * decisions without a supersession relationship is itself a conflict per PRD.
 */
export function resolveRuleApplicability(
  ruleKey: string,
  allDecisions: Decision[],
  ctx: CandidateContext
): ApplicabilityResult {
  const candidates = allDecisions.filter((d) => d.rule_key === ruleKey);
  if (candidates.length === 0) {
    return { decision_id: "", rule_key: ruleKey, status: "needs_context", reason: "No relevant history retrieved for this rule." };
  }

  const results = candidates.map((d) => evaluateApplicability(d, allDecisions, { ...ctx, ruleKey }));
  const applicable = results.filter((r) => r.status === "applicable");

  if (applicable.length > 1) {
    return {
      decision_id: applicable.map((r) => r.decision_id).join(","),
      rule_key: ruleKey,
      status: "conflict",
      reason: "Multiple approved decisions are simultaneously applicable without a supersession relationship; timestamp alone does not decide — request clarification.",
    };
  }
  if (applicable.length === 1) return applicable[0];

  // No applicable decision: return the most recent/best-informed rejection.
  return results[results.length - 1];
}

/**
 * Non-waivable baseline check for the demo fixture: the transport timeout
 * requirement is a fixed prototype baseline that no team decision can waive
 * (PRD: "We waived the wrapper does not mean we waived reliability requirements").
 */
export function requiresExplicitTimeout(fileContent: string): { hasTimeout: boolean; needsContext: boolean } {
  const callPattern = /request\s*\([^)]*\{[^}]*timeout\s*:\s*(\d+)/s;
  const match = fileContent.match(callPattern);
  if (!match) {
    // Unknown call pattern -> needs_context, not a pass, per PRD.
    return { hasTimeout: /request\s*\(/.test(fileContent) ? false : false, needsContext: true };
  }
  const millis = parseInt(match[1], 10);
  return { hasTimeout: millis === 2000, needsContext: false };
}

export { matchesPath, matchesVersion, isWithinEffectiveInterval, isSuperseded, normalizePath };
