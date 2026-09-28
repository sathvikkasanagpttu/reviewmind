-- ReviewMind schema (mirrors apps/api/src/db.ts). UUID PKs, UTC timestamptz.
create extension if not exists pgcrypto;

create table workspaces (id uuid primary key default gen_random_uuid(), name text not null, created_at timestamptz not null default now());

create table memberships (
  workspace_id uuid references workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null check (role in ('maintainer','contributor','viewer')),
  primary key (workspace_id, user_id)
);

create table repositories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  name text not null,
  active_run_id uuid,
  decision_revision int not null default 0
);

create table demo_runs (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references repositories(id),
  bank_id text not null unique,
  is_demo boolean not null default true,
  created_at timestamptz not null default now()
);

create table review_runs (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references repositories(id),
  demo_run_id uuid references demo_runs(id),
  created_by uuid,
  mode text not null check (mode in ('generic','static','memory')),
  input jsonb not null, input_hash text, output jsonb,
  status text not null, lease_until timestamptz,
  review_time timestamptz not null, decision_revision int not null,
  metadata jsonb not null default '{}'
);

create table events (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references repositories(id),
  actor_id uuid, type text not null, payload jsonb not null,
  occurred_at timestamptz not null, recorded_at timestamptz not null default now()
);
-- append-only
create rule events_no_update as on update to events do instead nothing;
create rule events_no_delete as on delete to events do instead nothing;

create table feedback (
  id uuid primary key default gen_random_uuid(),
  review_run_id uuid not null references review_runs(id),
  finding_id text not null, actor_id uuid not null,
  disposition text not null check (disposition in ('accepted','incorrect','already_handled','temporary_exception','preference')),
  reason text not null check (length(reason) > 0),
  proposed_scope jsonb, idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (actor_id, idempotency_key)
);

create table decisions (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references repositories(id),
  version int not null default 1,
  kind text not null check (kind in ('convention','temporary_exception','correction')),
  rule_key text not null, scope jsonb not null, rationale text not null,
  source_event_ids uuid[] not null default '{}',
  status text not null check (status in ('draft','approved','revoked','rejected')),
  approved_by uuid, approved_at timestamptz,
  effective_from timestamptz, expires_at timestamptz,
  supersedes_id uuid references decisions(id),
  draft_payload jsonb, draft_status text, lease_until timestamptz,
  check (kind <> 'temporary_exception' or status <> 'approved' or (expires_at is not null and effective_from is not null and expires_at > effective_from))
);

create table memory_jobs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references events(id),
  demo_run_id uuid references demo_runs(id),
  operation_id text, status text not null default 'queued',
  attempt_count int not null default 0, next_attempt_at timestamptz,
  last_error text, lease_until timestamptz
);

create index on review_runs (repo_id, review_time);
create index on decisions (repo_id, status);
create index on events (repo_id, occurred_at);
create index on memory_jobs (status, next_attempt_at);
create index on memberships (workspace_id, user_id);

-- RLS: client reads only for workspace members; writes go through the trusted server (service role).
alter table workspaces enable row level security;
alter table repositories enable row level security;
alter table review_runs enable row level security;
alter table decisions enable row level security;
alter table events enable row level security;

create policy member_read_repos on repositories for select using (
  exists (select 1 from memberships m where m.workspace_id = repositories.workspace_id and m.user_id = auth.uid()));
create policy member_read_decisions on decisions for select using (
  exists (select 1 from repositories r join memberships m on m.workspace_id = r.workspace_id
          where r.id = decisions.repo_id and m.user_id = auth.uid()));
create policy member_read_reviews on review_runs for select using (
  exists (select 1 from repositories r join memberships m on m.workspace_id = r.workspace_id
          where r.id = review_runs.repo_id and m.user_id = auth.uid()));
create policy member_read_events on events for select using (
  exists (select 1 from repositories r join memberships m on m.workspace_id = r.workspace_id
          where r.id = events.repo_id and m.user_id = auth.uid()));
