import { Router } from "express";
import type { AuthedRequest } from "../auth";
import { requireAuth } from "../auth";
import { db } from "../db";
import { apiError, HTTP_STATUS_FOR_CODE } from "@reviewmind/contracts";
import type { HindsightAdapter } from "@reviewmind/memory";

export function memoryJobsRouter(memory: HindsightAdapter) {
  const router = Router();

  router.get("/memory-jobs/:id", requireAuth, async (req: AuthedRequest, res) => {
    const job = [...db.memoryJobs.values()].find((j) => j.operation_id === req.params.id || j.id === req.params.id);
    if (!job) return res.status(HTTP_STATUS_FOR_CODE.NOT_FOUND).json({ error: apiError("NOT_FOUND", "Memory job not found.") });
    const live = await memory.operationStatus(job.operation_id);
    job.status = live.status;
    job.updated_at = new Date().toISOString();
    db.memoryJobs.set(job.id, job);
    return res.json({ status: job.status, attempts: job.attempt_count, last_error: live.lastError ?? null });
  });

  return router;
}
