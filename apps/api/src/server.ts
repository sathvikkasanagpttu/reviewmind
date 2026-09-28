import "dotenv/config";
import express from "express";
import cors from "cors";
import { createMemoryAdapter } from "@reviewmind/memory";
import { createReviewerProvider } from "@reviewmind/reviewer";
import { seedDemoRepo } from "./seed";
import { reviewsRouter } from "./routes/reviews";
import { decisionsRouter } from "./routes/decisions";
import { memoryJobsRouter } from "./routes/memoryJobs";
import { demoRouter } from "./routes/demo";
import { evaluationsRouter } from "./routes/evaluations";
import { miscRouter } from "./routes/misc";

async function main() {
  const app = express();
  app.use(cors({ origin: process.env.APP_ORIGIN ?? "http://localhost:5173" }));
  app.use(express.json({ limit: "1mb" }));

  const memory = createMemoryAdapter(process.env);
  const reviewer = createReviewerProvider(process.env);

  app.use("/api", miscRouter());
  app.use("/api", reviewsRouter(memory, reviewer));
  app.use("/api", decisionsRouter(memory));
  app.use("/api", memoryJobsRouter(memory));
  app.use("/api", demoRouter(memory));
  app.use("/api", evaluationsRouter(memory, reviewer));

  // Generic error handler — never leaks provider secrets or stack traces.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: { code: "INTERNAL", message: "Unexpected server error.", retryable: true } });
  });

  const port = Number(process.env.PORT ?? 8787);

  console.log(`[ReviewMind API] seeding synthetic demo repository (memory adapter: ${process.env.MEMORY_ADAPTER ?? "inmemory"}, reviewer: ${process.env.REVIEWER_PROVIDER ?? "rulebased"})...`);
  const seeded = await seedDemoRepo(memory);
  console.log(`[ReviewMind API] seeded repo ${seeded.repoId} (bank ${seeded.bankId}). Demo bearer tokens: demo-viewer / demo-contributor / demo-maintainer`);

  app.listen(port, () => {
    console.log(`[ReviewMind API] listening on http://localhost:${port}`);
  });
}

main().catch((err) => {
  console.error("[ReviewMind API] failed to start:", err);
  process.exit(1);
});
