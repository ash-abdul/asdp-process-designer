-- ASDP migration 001 — governance tables.
--
-- ADR-0035: plain, explicit, PostgreSQL-compatible SQL. No PGlite-specific
-- syntax; these are the files a container will run unchanged.
--
-- ADR-0016 / invariant D8: baseline, approval and audit_event are INSERT-ONLY.
-- That is enforced here in SQL as well as in the repository ports, so it holds
-- even against a direct connection.
--
-- ADR-0023 / ADR-0035: no database collation is relied upon. Spike S7 showed
-- ICU collation is accepted in DDL but inert in PGlite, so bilingual ordering
-- and comparison use application-side match forms from @asdp/text. Columns are
-- plain text; ordering is the application's business.

-- ---------------------------------------------------------------------------
-- Enumerated domains. Declared as CHECK constraints rather than PostgreSQL
-- enums: adding a value to an enum type requires ALTER TYPE, and these
-- vocabularies are versioned in @asdp/schemas, which should stay the single
-- source of truth.
-- ---------------------------------------------------------------------------

create table if not exists project (
  id                       text primary key,
  key                      text not null unique,
  name_json                jsonb not null,
  description              text not null default '',
  settings_json            jsonb not null,
  created_by               text not null,
  created_at               timestamptz not null,
  constraint project_key_shape check (key ~ '^[a-z][a-z0-9-]{2,48}$')
);

create table if not exists gate (
  project_id               text not null references project(id) on delete restrict,
  code                     text not null,
  status                   text not null,
  policy_json              jsonb not null,
  approved_baseline_hash   char(64),
  version                  integer not null default 1,
  primary key (project_id, code),
  constraint gate_code_valid   check (code in ('G0','G1','G2','G3','G4')),
  constraint gate_status_valid check (status in ('not_ready','ready','approved','rejected','reopened')),
  constraint gate_hash_hex     check (approved_baseline_hash is null
                                      or approved_baseline_hash ~ '^[0-9a-f]{64}$')
);

-- INSERT-ONLY (D8). No update or delete path is granted.
create table if not exists baseline (
  id                       text primary key,
  project_id               text not null references project(id) on delete restrict,
  stage                    text not null,
  content_hash             char(64) not null,
  frozen_at                timestamptz not null,
  raf_version              text not null,
  rule_pack_version        text not null,
  camunda_target_profile_id text not null,
  constraint baseline_hash_hex check (content_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists baseline_project_idx on baseline (project_id);
create index if not exists baseline_hash_idx    on baseline (project_id, content_hash);

-- INSERT-ONLY (D8). Members are frozen with their baseline.
create table if not exists baseline_member (
  baseline_id              text not null references baseline(id) on delete restrict,
  artifact_id              text not null,
  version_id               text not null,
  content_hash             char(64) not null,
  primary key (baseline_id, artifact_id),
  constraint member_hash_hex check (content_hash ~ '^[0-9a-f]{64}$')
);

-- INSERT-ONLY (D8). An approval is a signature over (baseline hash, validation run).
create table if not exists approval (
  id                       text primary key,
  project_id               text not null references project(id) on delete restrict,
  gate_code                text not null,
  baseline_id              text not null references baseline(id) on delete restrict,
  signed_baseline_hash     char(64) not null,
  validation_run_id        text not null,
  approver                 text not null,
  role_at_approval         text not null,
  decision                 text not null,
  comment                  text not null default '',
  at                       timestamptz not null,
  constraint approval_gate_valid     check (gate_code in ('G0','G1','G2','G3','G4')),
  constraint approval_decision_valid check (decision in ('approve','reject')),
  constraint approval_hash_hex       check (signed_baseline_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists approval_gate_idx on approval (project_id, gate_code);

-- APPEND-ONLY (ADR-0032). No update path, no delete path, no purge.
create table if not exists audit_event (
  id                       text primary key,
  at                       timestamptz not null,
  project_id               text references project(id) on delete restrict,
  actor                    text not null,
  roles_at_time            text[] not null default '{}',
  token_issuer             text,
  action                   text not null,
  entity_type              text not null,
  entity_id                text,
  before_json              jsonb,
  after_json               jsonb,
  correlation_id           text,
  gate_context_json        jsonb
);

create index if not exists audit_project_idx on audit_event (project_id, at);
create index if not exists audit_action_idx  on audit_event (action);
