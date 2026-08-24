-- ASDP migration 011 — persisted validation runs (V7 correction).
--
-- ADR-0035: plain, explicit, PostgreSQL-compatible SQL.
--
-- ## Why this table exists
--
-- [ADR-0017](../../../../../docs/adr/ADR-0017-approval-as-baseline-signature.md)
-- makes an approval a signature over **`(baselineContentHash, validationRunId)`**,
-- and explicitly rejects "approval without a validation-run binding" because
-- *"an approver could approve content whose validation evidence has since
-- changed"*.
--
-- V7 as first implemented minted a `vr-` identifier at approval time and signed
-- over it without recording anything. The signature's second limb therefore
-- referenced nothing: "what did that run find?" was unanswerable, and the
-- validation-run branch of `reopenIfInvalidated` could never fire because no code
-- could ever produce a different current run. This table closes that gap.
--
-- `validateIntake` already carried the note that *"validation-run storage arrives
-- with G1 in V7"*. This is that storage.
--
-- INSERT-ONLY (ADR-0016, invariant D8). A validation run is evidence of what the
-- rules said at a moment; re-running validation produces a NEW run, never an edit
-- of an old one.

create table if not exists validation_run (
  id                          text primary key,
  project_id                  text not null references project(id) on delete restrict,
  -- Null for a project-wide intake run; set for a run over a requirement set.
  requirement_set_id          text references requirement_set(id) on delete restrict,
  -- Which gate this run is evidence for. Null when it is not gate evidence.
  gate                        text,
  -- The baseline content hash the run covered, when it covered one.
  baseline_hash               text,
  rule_pack_version           text not null,
  camunda_target_profile_id   text not null,
  standards_profile_id        text not null,
  started_at                  timestamptz not null,
  finished_at                 timestamptz,
  status                      text not null,
  -- The findings themselves, so a signed run remains answerable forever
  -- (ADR-0032: retain everything).
  findings                    jsonb not null default '[]'::jsonb,

  constraint validation_run_status_valid
    check (status in ('running','completed','failed')),
  constraint validation_run_gate_valid
    check (gate is null or gate in ('G0','G1','G2','G3','G4'))
);

create index if not exists validation_run_set_idx
  on validation_run (requirement_set_id, gate, started_at desc);

create index if not exists validation_run_project_idx
  on validation_run (project_id, started_at desc);
