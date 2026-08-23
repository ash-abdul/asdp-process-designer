-- ASDP migration 007 — computed confidence on evidence (V4b-core).
--
-- ADR-0035: plain, explicit, PostgreSQL-compatible SQL.
--
-- Acceptance criterion 3 of the Phase 2 plan: "epistemic level and computed
-- confidence are carried on every item. Confidence is COMPUTED, never
-- provider-reported." V4b-core is the first slice that produces AI evidence, so
-- it is the first slice with a confidence value to carry.
--
-- Three columns, and the third is the one that makes the other two auditable:
-- the function VERSION. A score without the version of the function that produced
-- it cannot be compared across time, and ADR-0011 makes confidence a versioned
-- deterministic function precisely so it can be.
--
-- Nullable, because evidence recorded by V1-V3 predates the value and rows are
-- insert-only (ADR-0016) — a backfill would mean inventing scores for items whose
-- inputs are no longer assembled. The check constraint therefore ties the
-- requirement to the case that HAS one: an AI-extracted item must carry it.

alter table evidence_item
  add column if not exists computed_confidence      numeric(4,3),
  add column if not exists confidence_band          text,
  add column if not exists confidence_function_version text;

alter table evidence_item
  add constraint evidence_confidence_band_valid
  check (confidence_band is null or confidence_band in ('HIGH','MEDIUM','LOW'));

alter table evidence_item
  add constraint evidence_confidence_range
  check (computed_confidence is null or (computed_confidence >= 0 and computed_confidence <= 1));

-- A score is meaningless without the function that produced it, and vice versa.
alter table evidence_item
  add constraint evidence_confidence_complete
  check (
    (computed_confidence is null and confidence_band is null and confidence_function_version is null)
    or (computed_confidence is not null and confidence_band is not null
        and confidence_function_version is not null and confidence_function_version <> '')
  );

-- AI-extracted evidence MUST carry computed confidence. A model's reading that
-- enters the requirements path without a confidence value would be indistinguishable
-- from a parser's verbatim extraction at the point it matters most.
alter table evidence_item
  add constraint evidence_ai_has_confidence
  check (extracted_by <> 'ai' or computed_confidence is not null);
