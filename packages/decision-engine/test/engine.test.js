const test = require("node:test");
const assert = require("node:assert");
const { evaluateApplicability } = require("../dist");

const base = {
  id: "11111111-1111-1111-1111-111111111111", repo_id: "r", version: 1, kind: "temporary_exception",
  rule_key: "transport-wrapper", rationale: "vendor issue", source_event_ids: [], status: "approved",
  scope: { path_glob: "src/adapters/legacy/**", dependency_name: "bridge-client", version_range: ">=1.8.0 <2.0.0" },
  effective_from: "2026-09-16T00:00:00Z", expires_at: "2026-09-30T00:00:00Z", created_at: "2026-09-16T00:00:00Z",
};
const ctx = (o = {}) => ({ filePath: "src/adapters/legacy/status.ts", ruleKey: "transport-wrapper",
  dependencyVersions: { "bridge-client": "1.8.0" }, reviewTime: "2026-09-29T12:00:00Z", ...o });

test("applies inside scope", () => assert.equal(evaluateApplicability(base, [base], ctx()).status, "applicable"));
test("expiry boundary is exclusive", () => {
  assert.equal(evaluateApplicability(base, [base], ctx({ reviewTime: "2026-09-29T23:59:59Z" })).status, "applicable");
  assert.equal(evaluateApplicability(base, [base], ctx({ reviewTime: "2026-09-30T00:00:00Z" })).status, "expired");
});
test("other path is out of scope", () =>
  assert.equal(evaluateApplicability(base, [base], ctx({ filePath: "src/adapters/new/status.ts" })).status, "out_of_scope"));
test("version outside range is out of scope", () =>
  assert.equal(evaluateApplicability(base, [base], ctx({ dependencyVersions: { "bridge-client": "2.1.0" } })).status, "out_of_scope"));
test("missing version needs context", () =>
  assert.equal(evaluateApplicability(base, [base], ctx({ dependencyVersions: {} })).status, "needs_context"));
test("prerelease needs context", () =>
  assert.equal(evaluateApplicability(base, [base], ctx({ dependencyVersions: { "bridge-client": "1.9.0-beta.1" } })).status, "needs_context"));
test("draft cannot waive", () =>
  assert.notEqual(evaluateApplicability({ ...base, status: "draft" }, [base], ctx()).status, "applicable"));
test("revoked cannot waive", () =>
  assert.notEqual(evaluateApplicability({ ...base, status: "revoked" }, [base], ctx()).status, "applicable"));
test("superseded by approved successor", () => {
  const succ = { ...base, id: "22222222-2222-2222-2222-222222222222", supersedes_id: base.id, effective_from: "2026-09-20T00:00:00Z" };
  assert.equal(evaluateApplicability(base, [base, succ], ctx()).status, "superseded");
});
