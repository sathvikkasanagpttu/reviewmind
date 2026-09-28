import { Router } from "express";
import type { AuthedRequest } from "../auth";
import { requireAuth } from "../auth";
import { db } from "../db";
import { apiError, HTTP_STATUS_FOR_CODE } from "@reviewmind/contracts";
import { DEMO_USERS, loadFixtureRepoFiles, loadPrFixtures } from "../seed";

export function miscRouter() {
  const router = Router();

  router.get("/health", (_req, res) => res.json({ status: "ok", label: "SYNTHETIC DEMO — democart-integrations" }));

  // Not a documented provider dependency check in the strict sense (no
  // external services by default), but mirrors the PRD's "protected
  // dependency-check endpoint reports provider readiness."
  router.get("/health/dependencies", requireAuth, (_req, res) => {
    res.json({
      memory_adapter: process.env.MEMORY_ADAPTER ?? "inmemory",
      reviewer_provider: process.env.REVIEWER_PROVIDER ?? "rulebased",
    });
  });

  router.get("/bootstrap", (_req, res) => {
    const repo = [...db.repositories.values()][0];
    if (!repo) return res.status(HTTP_STATUS_FOR_CODE.NOT_FOUND).json({ error: apiError("NOT_FOUND", "No demo repository seeded yet.") });
    res.json({
      repo_id: repo.id,
      repo_name: repo.name,
      decision_revision: repo.decision_revision,
      demo_users: DEMO_USERS,
      pr_fixtures: Object.values(loadPrFixtures()),
    });
  });

  router.get("/repos/:id/files", requireAuth, (req: AuthedRequest, res) => {
    if (!db.repositories.has(req.params.id)) return res.status(HTTP_STATUS_FOR_CODE.NOT_FOUND).json({ error: apiError("NOT_FOUND", "Repository not found.") });
    res.json({ files: loadFixtureRepoFiles() });
  });

  return router;
}
