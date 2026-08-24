-- ASDP migration 009 — canonicalisation, conflict candidates, precedence (V6).
--
-- ADR-0035: plain, explicit, PostgreSQL-compatible SQL.
--
-- V5 was the first slice whose AI output was not verbatim. V6 is the first whose
-- output is ABOUT other AI output: it compares propositions and says they may
-- disagree. So the constraints below defend two things at once — that nothing
-- here decides anything, and that nothing here silently erases a distinction.
--
-- Five tables, all INSERT-ONLY (ADR-0016, ADR-0032). A corrected candidate is a
-- NEW candidate; the old one remains, exactly as evidence and proposals do.

-- ---------------------------------------------------------------------------
-- canonical_entity — Q2 and Q3
-- ---------------------------------------------------------------------------
--
-- Scoped to RECONCILIATION, not the P3 Domain Model Registry (Q2). These rows
-- exist so two propositions can be compared, not so anyone can browse a glossary.
--
-- `origin` carries the whole of Q3: `deterministic` means exact match-form
-- equality, which is a fact about text that code may act on; `ai_proposed` means
-- a model claimed two surface forms mean the same thing, which is a claim about
-- the business and stays a candidate until a human confirms it in V7.

create table if not exists canonical_entity (
  id                  text primary key,
  project_id          text not null references project(id) on delete restrict,
  requirement_set_id  text not null references requirement_set(id) on delete restrict,
  kind                text not null,

  -- Bilingual by construction. A canonical entity with only an English label
  -- silently becomes an English concept, which ADR-0023 exists to prevent.
  label_en            text not null,
  label_ar            text not null,
  -- The folded form equality was actually tested on. DERIVED, never truth
  -- (ADR-0023 §2) — stored so a grouping decision is auditable, not so it
  -- becomes the canonical text.
  match_form          text not null,

  origin              text not null,
  classification      text not null,
  -- Ids this entity absorbed, so a merge is REVERSIBLE AND AUDITABLE. Over-merge
  -- is the silent failure of this slice; this column is what makes it undoable
  -- rather than merely regrettable.
  merged_from_ids     text[] not null default '{}',
  requirement_ids     text[] not null default '{}',
  ai_interaction_id   text references ai_interaction(id) on delete restrict,

  -- V7 fills these. Present rather than omitted, so a reader sees that they are
  -- deliberately empty rather than missing.
  confirmed_by        text,
  confirmed_at        timestamptz,

  created_at          timestamptz not null,

  constraint canonical_entity_kind_valid
    check (kind in ('term','actor','data_entity','business_rule','business_event')),
  constraint canonical_entity_origin_valid
    check (origin in ('deterministic','ai_proposed')),
  constraint canonical_entity_class_valid
    check (classification in ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED','PROHIBITED')),
  -- At least one label must say something. Both blank is a nameless concept.
  constraint canonical_entity_labelled check (label_en <> '' or label_ar <> ''),
  -- Q3, in SQL: an AI-proposed merge cannot arrive already confirmed. Confirmation
  -- is a human act in V7, and V6 has no route to it.
  constraint canonical_entity_v6_unconfirmed check (confirmed_by is null and confirmed_at is null),
  -- The V4b/V5 pattern: an AI-authored row that cannot be traced to the call that
  -- produced it is undisclosable.
  constraint canonical_entity_ai_interaction_present
    check (origin <> 'ai_proposed' or (ai_interaction_id is not null and ai_interaction_id <> ''))
);

create index if not exists canonical_entity_set_idx on canonical_entity (requirement_set_id, kind);

-- ---------------------------------------------------------------------------
-- canonical_entity_alias — every surface form, and where it was observed
-- ---------------------------------------------------------------------------
--
-- The traceability half of Q3: "preserve traceability back to every original
-- term". A merge that lost its aliases would be irreversible in practice even
-- with merged_from_ids, because nobody could say what was merged.

create table if not exists canonical_entity_alias (
  id                  text primary key,
  canonical_entity_id text not null references canonical_entity(id) on delete restrict,
  surface_form        text not null,
  match_form          text not null,
  language            text not null,
  origin              text not null,
  requirement_id      text not null references requirement(id) on delete restrict,
  ai_interaction_id   text references ai_interaction(id) on delete restrict,

  constraint canonical_alias_origin_valid check (origin in ('deterministic','ai_proposed'))
);

create index if not exists canonical_alias_entity_idx on canonical_entity_alias (canonical_entity_id);
create index if not exists canonical_alias_match_idx  on canonical_entity_alias (match_form);

-- ---------------------------------------------------------------------------
-- conflict — Q1, Q5, Q8, and the most important constraint in this file
-- ---------------------------------------------------------------------------

create table if not exists conflict (
  id                   text primary key,
  project_id           text not null references project(id) on delete restrict,
  requirement_set_id   text not null references requirement_set(id) on delete restrict,

  topic                text not null,
  -- Comparison is slot-scoped: two propositions in unrelated slots are not about
  -- the same thing, and comparing them inflates the false-conflict rate this
  -- slice can least afford.
  raf_slot             text not null,
  classification       text not null,
  explanation          text not null,
  detected_by          text not null,
  ai_interaction_id    text references ai_interaction(id) on delete restrict,

  -- Q5: a RECOMMENDATION. Named `proposed_resolution` rather than `resolution`
  -- because the name is part of the guarantee. Nothing applies it; no requirement
  -- is superseded, suppressed or reordered by anything in this table.
  recommended_requirement_id text references requirement(id) on delete restrict,
  proposed_resolution        text,
  -- Which ADR-0012 step decided, on what values. "The AI decided the policy
  -- outweighed the email" is not an acceptable audit answer, and neither is
  -- "precedence said so".
  precedence_rationale_json  jsonb,

  data_classification  text not null,

  -- Q1, AND THE SINGLE MOST IMPORTANT LINE IN THIS FILE.
  --
  -- ADR-0012: "a human MUST decide every conflict". The columns exist because V7
  -- fills them; the constraint refuses every one of them here, so the boundary
  -- survives a direct connection rather than only the command layer. An
  -- AI-detected candidate cannot be made to look human-settled.
  decision             text,
  decided_by           text,
  decided_at           timestamptz,

  created_at           timestamptz not null,

  constraint conflict_v6_undecided
    check (decision is null and decided_by is null and decided_at is null),

  -- Q8: five outcomes, and `true_conflict` is not writable by V6 at all —
  -- establishing one is a human act, and no V6 code path reaches this value.
  constraint conflict_classification_valid
    check (classification in ('duplicate','equivalent','complementary','potentially_contradictory')),

  constraint conflict_class_valid
    check (data_classification in ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED','PROHIBITED')),
  -- A recommendation with no rationale is a verdict. L1-CONF-003 repeats this
  -- after the fact.
  constraint conflict_recommendation_explained
    check (recommended_requirement_id is null or precedence_rationale_json is not null)
);

create index if not exists conflict_set_idx  on conflict (requirement_set_id, raf_slot);
create index if not exists conflict_class_idx on conflict (requirement_set_id, classification);

create table if not exists conflict_participant (
  conflict_id text not null references conflict(id) on delete restrict,
  role        text not null,
  entity_id   text not null,

  primary key (conflict_id, role, entity_id),
  constraint conflict_participant_role_valid check (role in ('requirement','evidence'))
);

create index if not exists conflict_participant_entity_idx on conflict_participant (entity_id);

-- ---------------------------------------------------------------------------
-- requirement_relation — the domain model's typed edge
-- ---------------------------------------------------------------------------

create table if not exists requirement_relation (
  id                text primary key,
  project_id        text not null references project(id) on delete restrict,
  from_id           text not null references requirement(id) on delete restrict,
  to_id             text not null references requirement(id) on delete restrict,
  kind              text not null,
  detected_by       text not null,
  ai_interaction_id text references ai_interaction(id) on delete restrict,
  created_at        timestamptz not null,

  constraint requirement_relation_kind_valid
    check (kind in ('refines','conflicts','depends_on','duplicates')),
  -- A relation from a requirement to itself is a defect, not a finding.
  constraint requirement_relation_distinct check (from_id <> to_id),
  constraint requirement_relation_unique unique (from_id, to_id, kind)
);

create index if not exists requirement_relation_from_idx on requirement_relation (from_id);

-- ---------------------------------------------------------------------------
-- reconciliation_rejection — J9 applied to V6's output
-- ---------------------------------------------------------------------------
--
-- ADR-0032 requires the append-only record to retain rejected proposals, and a
-- rejected merge or conflict candidate is one. THE PAYLOAD IS KEPT, not a
-- checksum: it is model-authored text rather than a copied source span, and with
-- limitation 62 outstanding there is no payload store to recover it from.

create table if not exists reconciliation_rejection (
  id                 text primary key,
  project_id         text not null references project(id) on delete restrict,
  requirement_set_id text not null references requirement_set(id) on delete restrict,
  task               text not null,
  reason             text not null,
  detail             text not null,
  proposed_payload   text not null,
  ai_interaction_id  text references ai_interaction(id) on delete restrict,
  classification     text not null,
  created_at         timestamptz not null,

  constraint reconciliation_rejection_task_valid
    check (task in ('CANONICALISE_ENTITIES','RECONCILE_SOURCES')),
  constraint reconciliation_rejection_reason_valid
    check (reason in ('surface_form_not_in_batch','merge_across_kinds',
                      'merge_across_classifications','merge_degenerate',
                      'requirement_not_in_batch','cross_slot_candidate',
                      'true_conflict_proposed_by_ai','classification_not_permitted',
                      'resolution_proposed_by_ai','degenerate_candidate')),
  constraint reconciliation_rejection_class_valid
    check (classification in ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED','PROHIBITED'))
);

create index if not exists reconciliation_rejection_set_idx
  on reconciliation_rejection (requirement_set_id);
