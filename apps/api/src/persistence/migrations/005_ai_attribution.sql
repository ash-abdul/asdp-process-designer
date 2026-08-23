-- ASDP migration 005 — AI attribution for vision-read content (V3 defect fix).
--
-- ADR-0035: plain, explicit, PostgreSQL-compatible SQL.
--
-- THE DEFECT THIS REPAIRS
--
-- V3 made vision-read image regions citable evidence, but `recordEvidence` still
-- wrote `extracted_by = 'parser'` for every item, because that had been true for
-- every slice up to V2. Evidence whose content came from a vision model was
-- therefore labelled as parser-extracted, and no interaction id was recorded —
-- so the AI-disclosure report would have had to be estimated rather than
-- computed (ADR-0004), and the epistemic ladder's L1/L2 distinction lost its
-- audit trail at exactly the point it matters (ADR-0007).
--
-- Two changes, and the constraints are the point: the guarantee has to survive a
-- direct database connection, not only the command layer.
--
--   1. source_unit gains the interaction that produced its content. Attribution
--      lives on the UNIT because the unit is what evidence cites, and from
--      V2-PDF onward one source carries several pages, each read by its own call.
--
--   2. evidence_item gains a check tying an image_region anchor to
--      `extracted_by = 'ai'`. Combined with the existing
--      `evidence_ai_interaction_present` constraint from migration 002, an
--      image-anchored row cannot be stored without naming its interaction.
--
-- DELIBERATE FAILURE MODE
--
-- Both constraints are validated against existing rows. A development database
-- that already holds image-anchored units or evidence written by the defective
-- code will make this migration FAIL rather than carry a false `parser` label
-- forward. That is intended: source units and evidence are insert-only
-- (ADR-0016, ADR-0032), so a mislabelled row cannot be repaired in place. The
-- remedy is to re-ingest the affected sources into a fresh database. No
-- environment outside development has ever run V3.

alter table source_unit
  add column if not exists ai_interaction_id text;

-- A vision-read unit MUST name the interaction that read it. Text, DOCX and
-- structural-model units are parser-read and correctly carry no interaction.
alter table source_unit
  add constraint source_unit_vision_attributed
  check (
    anchor_json->'target'->>'kind' <> 'image_region'
    or (ai_interaction_id is not null and ai_interaction_id <> '')
  );

-- Content read from pixels is AI-extracted by definition (ADR-0038: for an image
-- only the target is verifiable; the content is a model's interpretation). So an
-- image_region anchor and `extracted_by = 'parser'` is a contradiction, and it is
-- refused in SQL rather than trusted to the command layer.
alter table evidence_item
  add constraint evidence_vision_is_ai_extracted
  check (
    anchor_json->'target'->>'kind' <> 'image_region'
    or extracted_by = 'ai'
  );
