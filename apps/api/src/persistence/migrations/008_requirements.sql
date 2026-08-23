-- ASDP migration 008 — structured requirement proposals (V5).
--
-- ADR-0035: plain, explicit, PostgreSQL-compatible SQL.
--
-- V5 is the first slice whose AI output is NOT verbatim. V4b could verify itself
-- completely — a quote is in the source or it is not — and V5 cannot. So the
-- constraints below carry more weight than usual: they are the part of the
-- boundary that survives a direct connection, a future refactor, and a command
-- written by someone who has not read the proposal.
--
-- Four tables, all INSERT-ONLY (ADR-0016, ADR-0032). A corrected proposal is a
-- NEW proposal; the old one remains, exactly as evidence does one level down.

-- ---------------------------------------------------------------------------
-- requirement_set — the unit a future baseline will freeze
-- ---------------------------------------------------------------------------

create table if not exists requirement_set (
  id            text primary key,
  project_id    text not null references project(id) on delete restrict,
  -- Monotonic per project. Each POPULATE_FRAME pass produces a new set rather
  -- than mutating the last one, because the last one may already be cited.
  version       integer not null,
  status        text not null default 'draft',
  -- The frame version the set was populated against. A set populated under
  -- raf-1.1 and read under a later frame must be legible as the older thing it
  -- is, which is impossible if the version is not recorded.
  raf_version   text not null,
  created_by    text not null,
  created_at    timestamptz not null,

  constraint requirement_set_version_positive check (version > 0),
  constraint requirement_set_version_unique   unique (project_id, version),
  -- J4: V5 creates draft sets only. `baselined` is a V7 act.
  constraint requirement_set_status_valid
    check (status in ('draft','in_review','baselined','superseded'))
);

create index if not exists requirement_set_project_idx on requirement_set (project_id, version desc);

-- ---------------------------------------------------------------------------
-- requirement — the proposal itself
-- ---------------------------------------------------------------------------

create table if not exists requirement (
  -- REQ-####, per project, monotonic, NEVER REUSED (invariant D15). Allocated by
  -- the command from the project's high-water mark, inside the transaction.
  id                          text primary key,
  requirement_set_id          text not null references requirement_set(id) on delete restrict,
  project_id                  text not null references project(id) on delete restrict,

  text                        text not null,
  -- The model's wording before any human edit. V5 never edits, so the two are
  -- equal today; retaining it now means the audit answer exists the moment a
  -- workspace can change `text`.
  original_ai_text            text not null,
  category                    text not null,
  -- One of the 27 RAF slots. The application checks membership against
  -- @asdp/raf; this constraint only guarantees something was recorded.
  raf_slot                    text not null,

  epistemic_level             text not null,
  derivation                  text not null,

  -- Computed by us (ADR-0011), never provider-reported, and stored WITH the
  -- version of the function that produced it — a score whose function is unknown
  -- cannot be compared to another.
  computed_confidence         numeric(4,3) not null,
  confidence_band             text not null,
  confidence_function_version text not null,
  human_confirmation_required boolean not null,

  status                      text not null default 'draft',

  generated_by                text not null,
  ai_interaction_id           text references ai_interaction(id) on delete restrict,
  prompt_version              text,
  provider_id                 text,
  model_id                    text,
  capability_tier             text,
  degradations                text[] not null default '{}',
  -- Which of the six passes proposed it. Prompting provenance, recorded because
  -- per-pass measurement is the point of the partition (J7). It is NOT domain
  -- structure: nothing reads it to decide anything.
  frame_pass                  text,

  classification              text not null,
  language                    text not null,
  created_by                  text not null,
  created_at                  timestamptz not null,

  constraint requirement_id_format check (id ~ '^REQ-[0-9]{4,}$'),

  -- J4, and the single most important line in this file. V5 has no route to any
  -- other status, and this is what makes that true against a direct connection
  -- rather than only against the command layer. An AI-created proposal cannot be
  -- made to LOOK human-approved.
  constraint requirement_status_draft_only check (status = 'draft'),

  -- J1. `inferred` is absent by decision, not by omission: an inferred
  -- proposition has no direct source, and its only correct disposition —
  -- explicit human confirmation — does not exist until V7.
  constraint requirement_derivation_valid check (derivation in ('extracted','interpreted')),

  -- L4 is a HUMAN act (ADR-0007, epistemic-model.md §2 rule 1). No row written by
  -- V5 may claim it, and L3 is refused with `inferred` above.
  constraint requirement_level_valid check (epistemic_level in ('L1','L2')),

  constraint requirement_band_valid check (confidence_band in ('HIGH','MEDIUM','LOW')),
  constraint requirement_confidence_range
    check (computed_confidence >= 0 and computed_confidence <= 1),
  constraint requirement_confidence_versioned check (confidence_function_version <> ''),

  constraint requirement_generated_by_valid check (generated_by in ('ai','human','parser')),
  -- The V4b pattern (migration 005), one level up: an AI-authored proposition
  -- that cannot be traced to the call that produced it is undisclosable.
  constraint requirement_ai_interaction_present
    check (generated_by <> 'ai' or (ai_interaction_id is not null and ai_interaction_id <> '')),

  constraint requirement_class_valid
    check (classification in ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED','PROHIBITED')),
  constraint requirement_category_valid
    check (category in ('functional','business_rule','data','integration','nfr','security',
                        'constraint','assumption','dependency','sla','notification','role'))
);

create index if not exists requirement_set_idx     on requirement (requirement_set_id, id);
create index if not exists requirement_project_idx on requirement (project_id, created_at);
create index if not exists requirement_slot_idx    on requirement (requirement_set_id, raf_slot);

-- ---------------------------------------------------------------------------
-- requirement_evidence — the traceability edge (invariant D2)
-- ---------------------------------------------------------------------------
--
-- The reason a requirement may exist at all. A row here means an EvidenceItem
-- whose anchor RE-RESOLVED at write time supports the proposition. The foreign
-- key makes the chain unbreakable in the direction that matters: evidence cannot
-- be removed (it is insert-only and there is no delete path), and a requirement
-- cannot name evidence that was never written.
--
-- "At least one link per requirement" cannot be a row-level check, because a
-- check constraint cannot see a child table. It is enforced by the command inside
-- the transaction, by the gate before that, and by rule L1-REQ-001 after it —
-- three places, because this is the invariant the whole slice rests on.

create table if not exists requirement_evidence (
  requirement_id   text not null references requirement(id) on delete restrict,
  evidence_item_id text not null references evidence_item(id) on delete restrict,
  contribution     text not null,

  primary key (requirement_id, evidence_item_id),
  constraint requirement_evidence_contribution_valid
    check (contribution in ('primary','supporting'))
);

create index if not exists requirement_evidence_item_idx on requirement_evidence (evidence_item_id);

-- ---------------------------------------------------------------------------
-- requirement_flag — quality signals on a GROUNDED proposal
-- ---------------------------------------------------------------------------
--
-- RAF §3 derives the `ambiguities` slot from exactly these kinds, and G1's
-- criterion is "0 blocking flags" — so blocking-ness lives here rather than in the
-- validation catalogue (J6). V5 raises `warning` and `info` only: the gate that
-- blocking would serve is V7's.
--
-- The resolution columns are nullable and unwritten in V5. They exist because a
-- flag is resolved by a human, and adding the columns later would mean migrating
-- rows that already matter.

create table if not exists requirement_flag (
  id             text primary key,
  requirement_id text not null references requirement(id) on delete restrict,
  project_id     text not null references project(id) on delete restrict,
  kind           text not null,
  severity       text not null,
  detail         text not null,
  raised_by      text not null,
  created_at     timestamptz not null,

  resolution     text,
  resolved_by    text,
  resolved_at    timestamptz,

  constraint requirement_flag_kind_valid
    check (kind in ('ambiguous','vague_quantifier','actor_unknown','untestable','unverifiable',
                    'single_source','content_unverified_evidence')),
  constraint requirement_flag_severity_valid check (severity in ('blocking','warning','info')),
  constraint requirement_flag_raised_by_valid check (raised_by in ('ai','human','rule'))
);

create index if not exists requirement_flag_req_idx on requirement_flag (requirement_id);

-- ---------------------------------------------------------------------------
-- requirement_rejection — J9, and ADR-0032 taken literally
-- ---------------------------------------------------------------------------
--
-- ADR-0032 requires the append-only record to retain "rejected proposals and
-- rejected requirements". This is that record, and it keeps THE TEXT, not a
-- checksum.
--
-- That is a deliberate difference from V4b's F2, not a reversal of it. F2 keeps a
-- checksum because a rejected QUOTE is unanchored source content and the audit
-- store is not a content store. A rejected proposal is model-authored text about
-- which ADR-0032 is explicit — and, with limitation 62 outstanding (no prompt or
-- response payload is retained anywhere), a checksum here would mean the rejected
-- proposal is retained NOWHERE.
--
-- It carries a classification because a proposition may paraphrase classified
-- source material, so it is read under the same controls as its evidence.

create table if not exists requirement_rejection (
  id                 text primary key,
  project_id         text not null references project(id) on delete restrict,
  requirement_set_id text not null references requirement_set(id) on delete restrict,
  reason             text not null,
  detail             text not null,
  proposed_text      text not null,
  proposed_slot      text,
  cited_evidence_ids text[] not null default '{}',
  frame_pass         text not null,
  ai_interaction_id  text references ai_interaction(id) on delete restrict,
  classification     text not null,
  created_at         timestamptz not null,

  constraint requirement_rejection_reason_valid
    check (reason in ('no_evidence_cited','evidence_not_in_batch','evidence_not_found',
                      'anchor_unresolved','slot_not_in_pass','disjointness_violation',
                      'classification_violation','empty_text','duplicate')),
  constraint requirement_rejection_class_valid
    check (classification in ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED','PROHIBITED'))
);

create index if not exists requirement_rejection_set_idx on requirement_rejection (requirement_set_id);
