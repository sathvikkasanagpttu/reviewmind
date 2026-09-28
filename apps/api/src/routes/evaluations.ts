import { Router } from "express";
import type { AuthedRequest } from "../auth";
import { requireAuth, requireRole } from "../auth";
import { db, newId, getRepoDecisions } from "../db";
import { apiError, HTTP_STATUS_FOR_CODE, ReviewOutputSchema } from "@reviewmind/contracts";
import { resolveRuleApplicability } from "@reviewmind/decision-engine";
import type { HindsightAdapter } from "@reviewmind/memory";
import type { ReviewerProvider } from "@reviewmind/reviewer";
import { loadEvaluationCases } from "../seed";

export function evaluationsRouter(memory: HindsightAdapter, reviewer: ReviewerProvider) {
  const router = Router();

  // POST /api/evaluations — maintainer only. Runs generic/static/memory for
  // each held-out case. Expected labels are used ONLY server-side to compute
  // a match/mismatch count; they are never included in the response payload,
  // per "server-side expected labels excluded from payload".
  router.post("/evaluations", requireAuth, requireRole("maintainer"), async (req: AuthedRequest, res) => {
    const { repo_id, case_ids } = req.body as { repo_id: string; case_ids?: string[] };
    const repo = db.repositories.get(repo_id);
    if (!repo) return res.status(HTTP_STATUS_FOR_CODE.NOT_FOUND).json({ error: apiError("NOT_FOUND", "Repository not found.") });

    const allCases = loadEvaluationCases();
    const cases = case_ids && case_ids.length > 0 ? allCases.filter((c) => case_ids.includes(c.id)) : allCases;
    const modes = ["generic", "static", "memory"] as const;
    const runId = newId();
    const results: any[] = [];
    let matches = 0;

    for (const c of cases) {
      for (const mode of modes) {
        const input = {
          repo_id,
          mode,
          title: c.title,
          diff: c.diff,
          context_files: [],
          dependency_versions: c.dependency_versions ?? {},
          demo_time: c.demo_time ?? null,
        };
        const bankId = db.demoRuns.get(repo.active_run_id)!.bank_id;
        const evidence = mode === "memory" ? (await memory.recall({ bankId, query: `${c.title} ${c.diff}`.slice(0, 500), limit: 10 })).facts : [];
        const { parsed } = await reviewer.generate(input as any, evidence, ["Explicit 2000ms request timeout is never waivable."]);
        const outputParse = ReviewOutputSchema.safeParse(parsed);
        let observedStatus = "no_findings";
        if (outputParse.success) {
          const repoDecisions = getRepoDecisions(repo_id);
          for (const finding of outputParse.data.findings) {
            if (!finding.rule_key || finding.rule_key === "explicit-timeout-baseline" || mode !== "memory") continue;
            const applicability = resolveRuleApplicability(finding.rule_key, repoDecisions, {
              filePath: finding.file,
              ruleKey: finding.rule_key,
              dependencyVersions: input.dependency_versions,
              reviewTime: input.demo_time ?? new Date().toISOString(),
            });
            finding.applicability = applicability;
            observedStatus = applicability.status;
          }
          if (outputParse.data.findings.length === 0) observedStatus = "no_findings";
        }
        const isMatch = mode === "memory" && c.expected_status && observedStatus === c.expected_status;
        if (isMatch) matches += 1;
        results.push({
          case_id: c.id,
          category: c.category,
          mode,
          observed_status: observedStatus,
          findings: outputParse.success ? outputParse.data.findings : [],
          questions: outputParse.success ? outputParse.data.questions : [],
          schema_valid: outputParse.success,
        });
      }
    }

    return res.status(202).json({
      run_id: runId,
      case_count: cases.length,
      generation_count: results.length,
      memory_mode_matches: matches,
      memory_mode_total: cases.filter((c) => c.expected_status).length,
      results,
      note: "Counts and case-level outputs only; this sample does not establish production reliability.",
    });
  });

  return router;
}
