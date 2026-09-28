import { Router } from "express";
import type { AuthedRequest } from "../auth";
import { requireAuth, requireRole } from "../auth";
import { db, newId, nowIso } from "../db";
import { apiError, HTTP_STATUS_FOR_CODE } from "@reviewmind/contracts";
import type { HindsightAdapter } from "@reviewmind/memory";
import { seedDemoRepo } from "../seed";

export function demoRouter(memory: HindsightAdapter) {
  const router = Router();

  // POST /api/demo/reset — maintainer only. Creates a NEW isolated demo run
  // (new bank namespace); it does not destroy the evidence from a prior
  // evaluation, per the PRD's race/integrity requirements.
  router.post("/demo/reset", requireAuth, requireRole("maintainer"), async (req: AuthedRequest, res) => {
    const { repo_id, fixture_set } = req.body as { repo_id?: string; fixture_set?: string };
    if (repo_id && !db.repositories.has(repo_id)) {
      return res.status(HTTP_STATUS_FOR_CODE.NOT_FOUND).json({ error: apiError("NOT_FOUND", "Unknown repo_id / fixture_set.") });
    }
    const seeded = await seedDemoRepo(memory);
    return res.status(202).json({
      demo_run_id: seeded.demoRunId,
      repo_id: seeded.repoId,
      seed_job_ids: [],
      fixture_set: fixture_set ?? "default",
    });
  });

  return router;
}
