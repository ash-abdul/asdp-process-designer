-- ASDP migration 010 — the human requirements workspace and G1 (V7).
--
-- ADR-0035: plain, explicit, PostgreSQL-compatible SQL.
--
-- This migration OPENS DOORS THAT V5 AND V6 DELIBERATELY LOCKED, and each one is
-- opened exactly as wide as its approved decision allows and no wider:
--
--   V5 refused every status but `draft`      → V7 permits the review states, and
--                                              still refuses `approved` unless the
--                                              G1 approval transaction wrote it (U1)
--   V5 refused `inferred` and L3             → V7 permits them for HUMAN-authored
--                                              requirements carrying a rationale (U8-a)
--   V6 refused a decided conflict            → V7 permits a decision, and requires
--                                              a decider, a timestamp and a rationale
--   V6 refused a confirmed canonical entity  → V7 permits confirmation
--
-- Every one of those was a check constraint, and a forward-only migration replaces
-- a constraint rather than editing it. The old names are dropped explicitly so a
-- reader of the schema sees the succession rather than a mystery.

-- ---------------------------------------------------------------------------
-- requirement — versions, review states, approval, human inference
-- ---------------------------------------------------------------------------

alter table requirement
  -- U2-a: an edit creates a NEW VERSION. The id stays (D15: REQ-0007 is REQ-0007
  -- forever); the version is what changes, and (id, version) is what a baseline
  -- member names. An in-place edit would silently change what a signed hash
  -- covered, which is the one thing ADR-0017 exists to prevent.
  add column if not exists version            integer not null default 1,
  add column if not exists supersedes_id      text,
  add column if not exists superseded_by_id   text,
  -- Mandatory on any version after the first: governance §2.3 requires a change
  -- reason on every new entity version, and "why did this wording change?" is the
  -- question a reviewer of a baseline diff actually asks.
  add column if not exists change_reason      text,
  -- U8-a. REQUIRED when derivation = 'inferred' (invariant D2). A recommendation
  -- with no stated reasoning cannot be persisted.
  add column if not exists inference_rationale text,
  -- U1: written ONLY by the G1 approval transaction.
  add column if not exists approved_by         text,
  add column if not exists approved_at         timestamptz,
  add column if not exists approval_baseline_id text references baseline(id) on delete restrict,
  -- Set when a LOW-confidence inferred requirement is explicitly confirmed —
  -- G1 precondition 6, which the gate has always named and nothing could satisfy.
  add column if not exists inference_confirmed_by text,
  add column if not exists inference_confirmed_at timestamptz;

-- The identity of a requirement is now (id, version). The primary key stays on
-- `id` for the CURRENT version; superseded versions live in requirement_version.
alter table requirement drop constraint if exists requirement_status_draft_only;

-- U1, and the successor to V5's draft-only rule. The review states are permitted;
-- `approved` is permitted ONLY with an approver, a timestamp and a baseline — none
-- of which any route but the G1 transaction can supply. An edit, an accept or a
-- status change cannot reach it, and neither can a direct connection.
alter table requirement
  add constraint requirement_status_valid
  check (status in ('draft','needs_clarification','in_review','approved','rejected',
                    'superseded','deferred'));

alter table requirement
  add constraint requirement_approved_requires_signature
  check (
    status <> 'approved'
    or (approved_by is not null and approved_by <> ''
        and approved_at is not null
        and approval_baseline_id is not null)
  );

-- The converse, so an approval cannot be recorded on something not approved.
alter table requirement
  add constraint requirement_signature_requires_approved
  check (approved_by is null or status = 'approved');

-- U8-a: `inferred` becomes legal, and ONLY for a human author carrying a
-- rationale. An AI-authored inference is refused in SQL, not merely discouraged
-- in a prompt — which is what keeps J1's refusal intact where it still applies.
alter table requirement drop constraint if exists requirement_derivation_valid;
alter table requirement
  add constraint requirement_derivation_valid
  check (derivation in ('extracted','interpreted','inferred'));

alter table requirement
  add constraint requirement_inferred_is_human_with_rationale
  check (
    derivation <> 'inferred'
    or (generated_by = 'human'
        and inference_rationale is not null and inference_rationale <> '')
  );

-- L3 becomes representable; L4 does NOT, because L4 is a property of an approved
-- requirement and is derived from `status`, never stored as a claim of its own.
alter table requirement drop constraint if exists requirement_level_valid;
alter table requirement
  add constraint requirement_level_valid
  check (epistemic_level in ('L1','L2','L3'));

-- An inferred requirement is L3; an evidenced one is not. Stated here so the two
-- columns cannot drift apart.
alter table requirement
  add constraint requirement_level_matches_derivation
  check ((derivation = 'inferred') = (epistemic_level = 'L3'));

alter table requirement
  add constraint requirement_version_positive check (version > 0);

-- A version after the first must say why it exists.
alter table requirement
  add constraint requirement_revision_has_reason
  check (version = 1 or (change_reason is not null and change_reason <> ''));

-- ---------------------------------------------------------------------------
-- requirement_version — the superseded history
-- ---------------------------------------------------------------------------
--
-- `requirement` holds the CURRENT version of each id; every superseded version is
-- copied here on revision. Two tables rather than one because every foreign key in
-- the system points at `requirement(id)` — evidence links, conflict participants,
-- flags — and re-pointing them at a composite key would ripple through four
-- migrations to gain nothing a reader wants.
--
-- INSERT-ONLY. A superseded version is history (ADR-0016, ADR-0032).

create table if not exists requirement_version (
  requirement_id     text not null,
  version            integer not null,
  requirement_set_id text not null references requirement_set(id) on delete restrict,
  project_id         text not null references project(id) on delete restrict,
  text               text not null,
  original_ai_text   text not null,
  category           text not null,
  raf_slot           text not null,
  epistemic_level    text not null,
  derivation         text not null,
  status             text not null,
  change_reason      text,
  inference_rationale text,
  classification     text not null,
  language           text not null,
  created_by         text not null,
  created_at         timestamptz not null,
  superseded_at      timestamptz not null,
  superseded_by      text not null,

  primary key (requirement_id, version)
);

create index if not exists requirement_version_req_idx
  on requirement_version (requirement_id, version desc);

-- ---------------------------------------------------------------------------
-- requirement_flag — resolution
-- ---------------------------------------------------------------------------
--
-- The columns already exist from migration 008, unwritten. This adds the rule that
-- makes them meaningful: a resolution needs a resolver and a timestamp, and none of
-- the three may appear without the others.

alter table requirement_flag
  add constraint requirement_flag_resolution_complete
  check (
    (resolution is null and resolved_by is null and resolved_at is null)
    or (resolution is not null and resolution <> ''
        and resolved_by is not null and resolved_at is not null)
  );

-- ---------------------------------------------------------------------------
-- conflict — the decision V6 refused
-- ---------------------------------------------------------------------------

alter table conflict
  add column if not exists decision_rationale text;

alter table conflict drop constraint if exists conflict_v6_undecided;

-- A decision needs a decider, a timestamp AND a rationale. The rationale is not
-- optional courtesy: ADR-0012 requires the decision to be defensible in audit, and
-- "the analyst chose the SOP" is not an answer to "why?".
alter table conflict
  add constraint conflict_decision_complete
  check (
    (decision is null and decided_by is null and decided_at is null)
    or (decision is not null and decision <> ''
        and decided_by is not null and decided_by <> ''
        and decided_at is not null
        and decision_rationale is not null and decision_rationale <> '')
  );

alter table conflict
  add constraint conflict_decision_valid
  check (decision is null
         or decision in ('accepted_recommendation','chose_alternative','not_a_conflict'));

-- ---------------------------------------------------------------------------
-- canonical_entity — the confirmation V6 refused
-- ---------------------------------------------------------------------------

alter table canonical_entity
  add column if not exists rejected_by text,
  add column if not exists rejected_at timestamptz;

alter table canonical_entity drop constraint if exists canonical_entity_v6_unconfirmed;

alter table canonical_entity
  add constraint canonical_entity_confirmation_complete
  check (
    (confirmed_by is null and confirmed_at is null)
    or (confirmed_by is not null and confirmed_by <> '' and confirmed_at is not null)
  );

-- Confirmed and rejected are mutually exclusive: a merge is one or the other, and
-- a row claiming both would make the reconciliation view unanswerable.
alter table canonical_entity
  add constraint canonical_entity_not_both
  check (confirmed_by is null or rejected_by is null);

-- A DETERMINISTIC entity is exact match-form equality — a fact about text. There
-- is nothing for a human to confirm, and offering it would invite confirmation of
-- something that was never a judgement.
alter table canonical_entity
  add constraint canonical_entity_only_ai_confirmed
  check (confirmed_by is null or origin = 'ai_proposed');

-- ---------------------------------------------------------------------------
-- open_question — U6, U7
-- ---------------------------------------------------------------------------
--
-- Every question names the DETERMINISTIC CAUSE that created it. A question with no
-- cause is refused, because the question SET is derived from flags, coverage gaps
-- and conflicts (ADR-0010's principle: a model that forgot a gap could otherwise
-- hide it). Only the WORDING may be AI-proposed.

create table if not exists open_question (
  id                   text primary key,
  project_id           text not null references project(id) on delete restrict,
  requirement_set_id   text not null references requirement_set(id) on delete restrict,

  -- What caused it, and the id of the thing that caused it. Both required.
  cause_kind           text not null,
  cause_id             text not null,
  raf_slot             text,

  question             text not null,
  why_it_matters       text not null,
  -- DERIVED, never chosen: a question is blocking when its cause blocks G1.
  blocking             boolean not null,

  -- Wording may be AI-proposed; the interaction is named when it was.
  ai_interaction_id    text references ai_interaction(id) on delete restrict,

  answer               text,
  answered_by          text,
  answered_at          timestamptz,
  -- U7: the answer becomes a SourceUnit in an interview transcript, so a
  -- requirement derived from a human answer has provenance exactly as strong as
  -- one derived from a document.
  became_source_unit_id text references source_unit(id) on delete restrict,

  created_at           timestamptz not null,

  constraint open_question_cause_valid
    check (cause_kind in ('flag','empty_required_slot','weak_required_slot',
                          'blocked_by_policy_slot','unresolved_conflict')),
  constraint open_question_cause_present check (cause_id <> ''),
  constraint open_question_answer_complete
    check (
      (answer is null and answered_by is null and answered_at is null)
      or (answer is not null and answer <> ''
          and answered_by is not null and answered_at is not null)
    )
);

create index if not exists open_question_set_idx on open_question (requirement_set_id, blocking);
create index if not exists open_question_cause_idx on open_question (cause_kind, cause_id);

-- ---------------------------------------------------------------------------
-- policy_acknowledgement — G1 precondition 7
-- ---------------------------------------------------------------------------
--
-- "We were not permitted to read this" is a fundamentally different finding from
-- "the sources do not say" (data-governance.md §3.1), and G1 requires the
-- difference to be ACKNOWLEDGED rather than silently passed over.

create table if not exists policy_acknowledgement (
  id                 text primary key,
  project_id         text not null references project(id) on delete restrict,
  requirement_set_id text not null references requirement_set(id) on delete restrict,
  raf_slot           text not null,
  acknowledged_by    text not null,
  acknowledged_at    timestamptz not null,
  rationale          text not null,

  constraint policy_ack_rationale_present check (rationale <> ''),
  constraint policy_ack_unique unique (requirement_set_id, raf_slot)
);
