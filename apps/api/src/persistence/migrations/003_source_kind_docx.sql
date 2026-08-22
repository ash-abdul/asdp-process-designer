-- ASDP migration 003 — admit 'docx' as a source kind.
--
-- ADR-0035: forward-only. Migration 002's check constraint enumerates the source
-- kinds, so admitting a new one means replacing that constraint. The vocabulary
-- itself is versioned in @asdp/schemas, which stays the single source of truth;
-- this constraint is the database-side half of the same fact.
--
-- Dropping and recreating a CHECK constraint is not a data migration: no row
-- changes, and the new constraint is strictly wider than the old one, so every
-- existing row still satisfies it.

alter table source drop constraint if exists source_kind_valid;

alter table source add constraint source_kind_valid
  check (kind in ('brd','srs','sop','policy','spreadsheet','screenshot','diagram_image',
                  'bpmn','dmn','form','email','transcript','freetext','markdown','docx','other'));
