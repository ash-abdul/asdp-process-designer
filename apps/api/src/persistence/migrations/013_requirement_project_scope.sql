-- ASDP migration 013 — project-scoped requirement identity (H4).
--
-- ADR-0035: plain, explicit, PostgreSQL-compatible SQL.
--
-- Closes limitation 77. `requirement.id` was `text primary key` — GLOBALLY
-- unique — while `nextRequirementNumber` allocated from the project's high-water
-- mark, exactly as invariant D15 requires ("a per-project monotonic sequence").
-- The key and the allocator disagreed, so the second project in a database to run
-- POPULATE_FRAME collided on REQ-0001 and a second project could never reach G1.
--
-- The identifier does not change. What changes is the SCOPE OF ITS UNIQUENESS,
-- from global to per project — which is what D15 always said. REQ-0007 is still
-- REQ-0007 (D15, versioning-and-baselines.md §23), and a baseline member still
-- names `REQ-0007` and `REQ-0007@2`, so NO EXISTING ADR-0017 SIGNATURE MOVES.
-- That is decision K5, and it is proved by test rather than asserted here.
--
-- Approved boundary: docs/60-plan/h4-proposal.md, decisions K1-K6 and K8.
-- K7 is NOT approved and is not implemented here (limitation 79 / H6).
-- H5 (limitation 78) is NOT implemented here, by decision K8.
--
-- ---------------------------------------------------------------------------
-- THIS MIGRATION IS A ONE-WAY DOOR, AND IT IS ONLY SAFE BEFORE THE CHANGE LANDS.
-- ---------------------------------------------------------------------------
--
-- The backfill below recovers `project_id` for child rows by joining through
-- `requirement(id)`. That join is unambiguous only while requirement ids are
-- still globally unique — which is precisely the property this migration
-- removes. Run it against a database that already holds two projects' REQ-0001
-- and the join is ambiguous and the backfill is wrong.
--
-- It is safe on every database that exists today, because no such database can
-- exist: the collision it fixes is what prevented one from being created.
--
-- ADDITIVE ONLY (K6). No row is deleted. No id is renumbered. No baseline,
-- approval or audit record is touched. D15, ADR-0016 and ADR-0032 are preserved.

-- ---------------------------------------------------------------------------
-- 1. requirement_evidence — gains project_id
-- ---------------------------------------------------------------------------
--
-- The link table that carries invariant D2. It had no project_id at all, because
-- under a global key it did not need one.

alter table requirement_evidence
  add column if not exists project_id text;

update requirement_evidence re
   set project_id = r.project_id
  from requirement r
 where re.requirement_id = r.id
   and re.project_id is null;

alter table requirement_evidence
  alter column project_id set not null;

alter table requirement_evidence
  add constraint requirement_evidence_project_fk
  foreign key (project_id) references project(id) on delete restrict;

-- ---------------------------------------------------------------------------
-- 2. canonical_entity_alias — gains project_id
-- ---------------------------------------------------------------------------
--
-- The other child table with no project_id. Its parent canonical_entity has one,
-- but an alias names a REQUIREMENT, and that is the reference being re-scoped.

alter table canonical_entity_alias
  add column if not exists project_id text;

update canonical_entity_alias a
   set project_id = r.project_id
  from requirement r
 where a.requirement_id = r.id
   and a.project_id is null;

alter table canonical_entity_alias
  alter column project_id set not null;

alter table canonical_entity_alias
  add constraint canonical_entity_alias_project_fk
  foreign key (project_id) references project(id) on delete restrict;

-- ---------------------------------------------------------------------------
-- 3. Drop every foreign key that points at requirement(id)
-- ---------------------------------------------------------------------------
--
-- They have to go before the primary key can move. Named explicitly rather than
-- discovered dynamically: a migration that guesses at constraint names is a
-- migration nobody can read.

alter table requirement_evidence   drop constraint if exists requirement_evidence_requirement_id_fkey;
alter table requirement_flag       drop constraint if exists requirement_flag_requirement_id_fkey;
alter table canonical_entity_alias drop constraint if exists canonical_entity_alias_requirement_id_fkey;
alter table conflict               drop constraint if exists conflict_recommended_requirement_id_fkey;
alter table requirement_relation   drop constraint if exists requirement_relation_from_id_fkey;
alter table requirement_relation   drop constraint if exists requirement_relation_to_id_fkey;

-- ---------------------------------------------------------------------------
-- 4. requirement — the primary key becomes (project_id, id)
-- ---------------------------------------------------------------------------
--
-- K1. The whole defect, in two statements.

alter table requirement drop constraint if exists requirement_pkey;
alter table requirement add  constraint requirement_pkey primary key (project_id, id);

-- The format check (requirement_id_format, migration 008) is unchanged and still
-- in force: REQ-#### survives exactly as it was.
--
-- Lookup by id alone is no longer unique, but it is still the shape of a
-- traceability question ("where is REQ-0007?"), so it keeps an index.
create index if not exists requirement_id_idx on requirement (id);

-- ---------------------------------------------------------------------------
-- 5. Re-point every foreign key at the composite
-- ---------------------------------------------------------------------------
--
-- K4's structural half. After this, a child row in project B CANNOT reference a
-- requirement in project A: the pair does not exist. Cross-project linkage stops
-- being a convention the command layer enforces and becomes something the
-- database refuses.

alter table requirement_evidence
  add constraint requirement_evidence_requirement_fk
  foreign key (project_id, requirement_id) references requirement(project_id, id)
  on delete restrict;

alter table requirement_flag
  add constraint requirement_flag_requirement_fk
  foreign key (project_id, requirement_id) references requirement(project_id, id)
  on delete restrict;

alter table canonical_entity_alias
  add constraint canonical_entity_alias_requirement_fk
  foreign key (project_id, requirement_id) references requirement(project_id, id)
  on delete restrict;

alter table conflict
  add constraint conflict_recommended_requirement_fk
  foreign key (project_id, recommended_requirement_id) references requirement(project_id, id)
  on delete restrict;

alter table requirement_relation
  add constraint requirement_relation_from_fk
  foreign key (project_id, from_id) references requirement(project_id, id)
  on delete restrict;

alter table requirement_relation
  add constraint requirement_relation_to_fk
  foreign key (project_id, to_id) references requirement(project_id, id)
  on delete restrict;

-- ---------------------------------------------------------------------------
-- 6. Composite primary keys and uniqueness on the child tables
-- ---------------------------------------------------------------------------

-- requirement_evidence: (requirement_id, evidence_item_id) was unique globally.
alter table requirement_evidence drop constraint if exists requirement_evidence_pkey;
alter table requirement_evidence
  add constraint requirement_evidence_pkey
  primary key (project_id, requirement_id, evidence_item_id);

-- requirement_version: the superseded history. (requirement_id, version) was
-- global, so two projects each revising their own REQ-0001 to v2 would have
-- collided — the same defect one layer down, and the one easiest to overlook
-- because migration 010 deliberately kept this table free of foreign keys.
alter table requirement_version drop constraint if exists requirement_version_pkey;
alter table requirement_version
  add constraint requirement_version_pkey
  primary key (project_id, requirement_id, version);

drop index if exists requirement_version_req_idx;
create index if not exists requirement_version_req_idx
  on requirement_version (project_id, requirement_id, version desc);

-- requirement_relation: the same pair of ids may legitimately exist in two
-- projects, so the uniqueness that prevents a duplicate relation must be scoped
-- to one.
alter table requirement_relation drop constraint if exists requirement_relation_unique;
alter table requirement_relation
  add constraint requirement_relation_unique unique (project_id, from_id, to_id, kind);

-- ---------------------------------------------------------------------------
-- 7. Indexes that carried an unscoped requirement id
-- ---------------------------------------------------------------------------

create index if not exists requirement_evidence_project_idx
  on requirement_evidence (project_id, requirement_id);

create index if not exists canonical_alias_project_idx
  on canonical_entity_alias (project_id, requirement_id);
