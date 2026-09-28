# ReviewMind

**Code review with a memory for decisions and their limits.**
Remember why an exception was approved. Apply it only where it belongs. Flag it when its conditions change.

HackwithHyderabad 3.0 · 48-hour prototype · implementation of *ReviewMind Implementation PRD v1.0*.
All data (repo `democart-integrations`, dependency `bridge-client`, decisions, dates) is **SYNTHETIC**.

## What is real vs. stubbed (read this first)

| Piece | State in this repo |
| --- | --- |
| Decision engine (path glob, semver, exclusive expiry, supersession, conflict) | Real, deterministic, unit-tested (`npm test -w packages/decision-engine`) |
| API (all PRD routes, roles, idempotency, revision conflict, 403/409/422) | Real, runs on an **in-memory ledger** (`apps/api/src/db.ts`) |
| Ledger schema for Supabase | Provided in `supabase/migrations/0001_init.sql`; **not wired** — `db.ts` is the swap point |
| Auth | Seeded demo bearer tokens (`demo-viewer`, `demo-contributor`, `demo-maintainer`). Replace `auth.ts` with Supabase Auth |
| Hindsight memory | `InMemoryHindsightAdapter` (offline simulation of retain→ready→recall→reflect). `HindsightCloudAdapter` is a **stub with TODOs** — plug in the official client from Hindsight's docs |
| LLM reviewer | Default `RuleBasedReviewerProvider` (offline, fixture-scoped). `AnthropicReviewerProvider` calls the real Messages API when `REVIEWER_PROVIDER=llm` + `LLM_API_KEY` |
| Async workers / job leases | Simplified: reviews run synchronously; memory job status is polled |
| Frontend | React + Vite + TS: Reviews, Decisions, Evaluation pages |

Nothing here claims benchmark results. The PRD's rule stands: report only behaviour shown in saved runs.

## Run

```bash
npm install
npm run build -w packages/contracts -w packages/decision-engine -w packages/memory -w packages/reviewer
cp .env.example apps/api/.env
npm run dev:api      # http://localhost:8787 (seeds the demo repo on boot)
npm run dev:web      # http://localhost:5173 (proxies /api)
```

Terminal 1 (leave it running):

```bash
cd ~/Downloads/reviewmind
npm run dev:api
```

Wait for listening on <http://localhost:8787>.

Terminal 2:

```bash
cd ~/Downloads/reviewmind
npm run dev:web
```

Then reload <http://localhost:5173>. To check the API on its own, open <http://localhost:8787/api/health> in the browser. It should return {"status":"ok",...}.

Switch role from the top-bar dropdown (viewer / contributor / maintainer).

## Demo journeys (verified against the running API)

| PR | Setup | Result |
| --- | --- | --- |
| A | legacy path, bridge-client 1.8.0, 29 Sep | exception **applicable** |
| B | new path, same version | **out_of_scope** (exception does not transfer) |
| C | legacy path, 1 Oct | **expired** (exclusive boundary) |
| D | legacy path, timeout removed | wrapper waived, **timeout finding remains (high)** |
| E | version missing | **needs_context**, asks for version |

Learning loop: PR-B → feedback `temporary_exception` with scope → *Save and draft decision* (reflect) → maintainer approves → fresh review of PR-B is now **applicable**. A contributor attempting approval gets **403**.

## Architecture

```text
apps/web  ─►  apps/api (Express) ─► packages/decision-engine  (pure, no LLM)
                    │            ─► packages/memory           (Hindsight adapter)
                    │            ─► packages/reviewer         (prompt + provider)
                    └────────────► packages/contracts         (zod schemas, error codes)
fixtures/  synthetic repo, seed events, PR-A..E, 12 held-out eval cases (server-only)
```

Key rules implemented: the model never grants a waiver (engine decides); canonical status is checked on every review; unapproved feedback cannot waive; `explicit-timeout-baseline` is never waivable; revision recheck returns `REVIEW_CONTEXT_CHANGED`; feedback is idempotent per `(actor, Idempotency-Key)`.

## Known gaps versus the PRD (next steps)

- Wire Supabase (ledger, Auth, RLS) and the real Hindsight client; add the transactional outbox worker and lease recovery.
- Line-anchor and evidence-ID validation of LLM output (schema validation exists; anchor checks do not).
- Reviewer line numbers in the rule-based provider are fixture-approximate.
- Evaluation labels: `E10`/`E11`/`E12` use loose expected statuses and are not strictly scored; run and record results yourself.
- Demo-clock UI, side-by-side Generic/Static/Memory comparison view, rate limiting, and Markdown export (P1) are not built.
- Submission items (video, article, social post per member, content-guide check) are yours to produce.

## Research caveats (from the PRD)

ReviewMind does not claim to be the first reviewer with memory (CodeRabbit and Greptile learn from feedback). Benefits (fewer repeated comments, faster evidence lookup) are hypotheses until measured.
