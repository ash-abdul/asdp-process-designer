-- ASDP migration 006 — AI interaction records (V4a).
--
-- ADR-0035: plain, explicit, PostgreSQL-compatible SQL.
--
-- Invariant I8: every AI call is recorded. The broker has produced this record
-- since Phase 1 and handed it to the caller to persist; until V4a there was no
-- caller, so nothing persisted it (V3 limitation 42, deferred by D6).
--
-- APPEND-ONLY (ADR-0032, invariant D8). An interaction is history: it records
-- what was sent outside the enterprise, to whom, under which classification, and
-- what came back. Editing it would make the AI-disclosure report a story rather
-- than an audit. `human_verdict` is the ONE mutable column — a reviewer's verdict
-- arrives later — and it is constrained to a closed vocabulary.
--
-- The columns exist so that "what exactly was sent outside, and why?" is
-- answerable from one row: provider and model, the capabilities the answer rested
-- on, the prompt version, the source classification, the egress decision, the
-- degradation state, tokens and cost where the provider reports them, timestamps,
-- and the correlation id that joins it to the request and audit events.

create table if not exists ai_interaction (
  id                        text primary key,
  project_id                text not null references project(id) on delete restrict,
  -- When the provider was invoked, not when the row was written.
  at                        timestamptz not null,

  task_type                 text not null,
  task_version              text not null,
  prompt_version            text not null,

  provider_id               text not null,
  model_id                  text not null,
  deployment_class          text not null,
  capability_tier           text not null,
  -- Capabilities the ANSWER rested on: the task's required and preferred set
  -- intersected with what the selected model declares (ADR-0022).
  capabilities_used         text[] not null default '{}',

  -- The routing decision in full: eligible and rejected providers with reasons,
  -- the selection, and the degradation plan. jsonb because its shape is a record
  -- of a decision, not a queryable entity.
  routing_json              jsonb not null,
  content_classification    text not null,
  egress_decision           text not null,
  egress_reason             text,

  -- E4. `full` is stored rather than assumed: a chunked read that looks full is
  -- the silent degradation E4 exists to forbid.
  context_mode              text not null default 'full',
  chunk_count               integer,
  chunk_ranges_json         jsonb not null default '[]'::jsonb,
  chunk_strategy_version    text,

  -- A7: whether a provider was actually called, or a recording replayed. Normal
  -- CI is entirely `replay`, and this is what makes that auditable.
  mode                      text not null default 'replay',
  source_id                 text references source(id) on delete restrict,
  correlation_id            text,

  -- Usage as the provider reported it. Zero is honest when a provider reports
  -- nothing; NULL would be indistinguishable from "we did not look".
  input_units               bigint not null default 0,
  cached_input_units        bigint not null default 0,
  output_units              bigint not null default 0,
  cost_estimate             numeric(12,6) not null default 0,
  latency_ms                integer not null default 0,

  proposal_id               text,
  -- The one mutable column: a human verdict arrives after the fact.
  human_verdict             text not null default 'pending',

  constraint ai_interaction_mode_valid    check (mode in ('live','replay')),
  constraint ai_interaction_egress_valid  check (egress_decision in ('permitted','refused')),
  constraint ai_interaction_context_valid check (context_mode in ('full','chunked')),
  constraint ai_interaction_verdict_valid
    check (human_verdict in ('accepted','edited','rejected','pending')),
  constraint ai_interaction_class_valid
    check (content_classification in ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED','PROHIBITED')),
  -- ADR-0021, in SQL: RESTRICTED and PROHIBITED content must never have reached
  -- an externally hosted provider. If such a row could exist, the egress
  -- guarantee would rest entirely on code being correct.
  --
  -- This encodes the PERMANENT approved policy, not E1. E1's development ceiling
  -- is stricter still — INTERNAL and below to an external provider — and it is
  -- enforced at the transport boundary and in configuration, because a
  -- development ceiling is a setting and this constraint is forever.
  constraint ai_interaction_egress_ceiling
    check (
      deployment_class <> 'external_hosted'
      or content_classification in ('PUBLIC','INTERNAL','CONFIDENTIAL')
    ),
  -- E4 rule 2/3: a chunked read must say how many chunks it used.
  constraint ai_interaction_chunk_count
    check (context_mode <> 'chunked' or (chunk_count is not null and chunk_count > 0)),
  constraint ai_interaction_usage_sane
    check (input_units >= 0 and output_units >= 0 and cached_input_units >= 0
           and cost_estimate >= 0 and latency_ms >= 0)
);

create index if not exists ai_interaction_project_idx on ai_interaction (project_id, at desc);
create index if not exists ai_interaction_source_idx  on ai_interaction (source_id);
create index if not exists ai_interaction_task_idx    on ai_interaction (task_type, at desc);
create index if not exists ai_interaction_mode_idx    on ai_interaction (mode);
