-- ASDP migration 002 — source intake and evidence.
--
-- ADR-0035: plain, explicit, PostgreSQL-compatible SQL. No PGlite-specific
-- syntax; these are the files a container will run unchanged.
--
-- ADR-0023 / ADR-0035: no database collation is declared or relied upon. Spike
-- S7 showed ICU collation is accepted in DDL but INERT in PGlite, so bilingual
-- ordering and comparison use application-side match forms from @asdp/text.
-- Text columns are plain text; ordering is the application's business.
--
-- IMMUTABILITY (ADR-0016, invariant D8). Three of the four tables here are
-- insert-only, and that is enforced in SQL as well as in the repository ports so
-- it holds even against a direct connection:
--
--   source_text    the bytes' canonical text form never changes. A corrected
--                  document is a NEW source that supersedes the old one, so old
--                  anchors stay valid against the old text
--   source_unit    units are re-extracted under a new extractor version, never
--                  edited in place
--   evidence_item  invariant D1/D8: immutable, never edited, only re-extracted
--
-- `source` is the one mutable table, and only in three columns: authority_rank
-- (a human ranking that is expected to change), status, and parse_error. Its
-- content-identifying columns — sha256, blob_ref, byte_size — are fixed at
-- insert by a trigger-free discipline the repository port enforces by exposing
-- no method that writes them.

-- ---------------------------------------------------------------------------
-- source
-- ---------------------------------------------------------------------------

create table if not exists source (
  id                        text primary key,
  project_id                text not null references project(id) on delete restrict,
  filename                  text not null,
  -- Determined by content sniffing, never by the client's claim.
  mime_type                 text not null,
  byte_size                 bigint not null,
  -- SHA-256 of the RAW bytes. Also the deduplication key within a project.
  sha256                    char(64) not null,
  -- Opaque BlobStore key. Never a filesystem path (A6).
  blob_ref                  text not null,
  uploaded_by               text not null,
  uploaded_at               timestamptz not null,
  kind                      text not null,
  -- Human-set; the deterministic input to conflict precedence (ADR-0012).
  authority_rank            integer not null default 0,
  effective_date            timestamptz,
  supersedes_source_id      text references source(id) on delete restrict,
  primary_language          text not null,
  direction                 text not null,
  language_runs_json        jsonb not null default '[]'::jsonb,
  classification            text not null,
  status                    text not null,
  parse_error               text,
  -- Length of the normalised text in CODE POINTS, not UTF-16 units.
  text_length               integer not null default 0,
  text_sha256               char(64),
  extractor_version         text,
  extraction_method         text not null default 'text',
  vision_page_count         integer not null default 0,
  arabic_reordering_confidence double precision,

  -- Deduplication: the same bytes are ingested once per project. Enforced here
  -- rather than only in the command, so a concurrent double upload cannot slip
  -- between a check and an insert.
  constraint source_project_sha_unique unique (project_id, sha256),

  constraint source_sha_hex        check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint source_text_sha_hex   check (text_sha256 is null
                                          or text_sha256 ~ '^[0-9a-f]{64}$'),
  constraint source_byte_size_sane check (byte_size >= 0),
  constraint source_rank_range     check (authority_rank between 0 and 1000),
  constraint source_status_valid   check (status in ('parsing','parsed','parse_failed','superseded')),
  constraint source_direction_valid check (direction in ('ltr','rtl','neutral')),
  constraint source_classification_valid
    check (classification in ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED','PROHIBITED')),
  constraint source_kind_valid
    check (kind in ('brd','srs','sop','policy','spreadsheet','screenshot','diagram_image',
                    'bpmn','dmn','form','email','transcript','freetext','markdown','other')),
  constraint source_extraction_method_valid
    check (extraction_method in ('text','vision','mixed')),
  constraint source_vision_pages_sane check (vision_page_count >= 0),
  constraint source_arabic_confidence_range
    check (arabic_reordering_confidence is null
           or (arabic_reordering_confidence >= 0 and arabic_reordering_confidence <= 1)),
  -- A parse failure must say why. L0-ING-001 refuses to tolerate a silent one,
  -- and this makes "silent" unrepresentable rather than merely discouraged.
  constraint source_parse_error_present
    check (status <> 'parse_failed' or (parse_error is not null and parse_error <> '')),
  -- A source cannot supersede itself.
  constraint source_no_self_supersede check (supersedes_source_id is null
                                             or supersedes_source_id <> id)
);

create index if not exists source_project_idx  on source (project_id, uploaded_at);
create index if not exists source_sha_idx      on source (project_id, sha256);
-- The inventory is ordered by authority rank, so it gets its own index.
create index if not exists source_rank_idx     on source (project_id, authority_rank desc);

-- ---------------------------------------------------------------------------
-- source_text — INSERT-ONLY
--
-- The canonical NFC, logical-order text every anchor resolves against. Kept in
-- its own table rather than a column on `source` for two reasons: it is
-- immutable while `source` is not, and it is the largest value in the row and is
-- not needed by the inventory listing.
-- ---------------------------------------------------------------------------

create table if not exists source_text (
  source_id                 text primary key references source(id) on delete restrict,
  -- NFC, logical order. The authoritative stored form (ADR-0023).
  text                      text not null,
  sha256                    char(64) not null,
  -- Length in CODE POINTS. Recorded because SQL length() counts characters and
  -- the application counts code points; storing it removes the ambiguity.
  code_point_length         integer not null,
  constraint source_text_sha_hex_ck check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint source_text_length_sane check (code_point_length >= 0)
);

-- ---------------------------------------------------------------------------
-- source_unit — INSERT-ONLY
-- ---------------------------------------------------------------------------

create table if not exists source_unit (
  id                        text primary key,
  source_id                 text not null references source(id) on delete restrict,
  project_id                text not null references project(id) on delete restrict,
  ordinal                   integer not null,
  type                      text not null,
  -- Null for pure-image units. Not defaulted to '': absent text and empty text
  -- are different facts.
  text                      text,
  language                  text not null,
  direction                 text not null,
  depth                     integer,
  -- The full ProvenanceAnchor envelope, including quote and checksum.
  anchor_json               jsonb not null,

  constraint source_unit_ordinal_unique unique (source_id, ordinal),
  constraint source_unit_ordinal_sane   check (ordinal >= 0),
  constraint source_unit_direction_valid check (direction in ('ltr','rtl','neutral')),
  constraint source_unit_type_valid
    check (type in ('heading','paragraph','listItem','tableCell','codeBlock','blockQuote',
                    'image','sheetRange','bpmnElement','dmnRule','formField','transcriptTurn')),
  -- ADR-0008: an anchor without a quote and a checksum is not verifiable, so it
  -- is not storable. This is the SQL-level half of that guarantee.
  constraint source_unit_anchor_verifiable
    check (anchor_json ? 'quote' and anchor_json ? 'quoteChecksum' and anchor_json ? 'target')
);

create index if not exists source_unit_source_idx on source_unit (source_id, ordinal);
create index if not exists source_unit_project_idx on source_unit (project_id);

-- ---------------------------------------------------------------------------
-- evidence_item — INSERT-ONLY (invariant D1, D8)
--
-- The ONLY bridge between raw sources and requirements. Nothing may skip it,
-- which is what makes the traceability guarantee structural.
-- ---------------------------------------------------------------------------

create table if not exists evidence_item (
  id                        text primary key,
  project_id                text not null references project(id) on delete restrict,
  source_id                 text not null references source(id) on delete restrict,
  source_unit_id            text references source_unit(id) on delete restrict,
  anchor_json               jsonb not null,
  verbatim_text             text not null,
  language                  text not null,
  raf_slot_hint             text,
  extracted_by              text not null,
  ai_interaction_id         text,
  citation_mode             text not null,
  anchor_verified           boolean not null,
  classification            text not null,
  created_by                text not null,
  created_at                timestamptz not null,

  constraint evidence_extracted_by_valid check (extracted_by in ('parser','ai')),
  constraint evidence_citation_mode_valid check (citation_mode in ('none','native','post_hoc')),
  constraint evidence_classification_valid
    check (classification in ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED','PROHIBITED')),
  constraint evidence_text_present check (verbatim_text <> ''),
  -- Invariant D1, in SQL: an unverified anchor cannot be persisted at all. Not
  -- "should not" — cannot. This is the constraint that makes the traceability
  -- guarantee survive a direct database connection.
  constraint evidence_anchor_verified check (anchor_verified = true),
  constraint evidence_anchor_verifiable
    check (anchor_json ? 'quote' and anchor_json ? 'quoteChecksum' and anchor_json ? 'target'),
  -- An AI-extracted item must name the interaction that produced it, so the
  -- AI-disclosure report can be computed rather than estimated (ADR-0004).
  constraint evidence_ai_interaction_present
    check (extracted_by <> 'ai' or (ai_interaction_id is not null and ai_interaction_id <> ''))
);

create index if not exists evidence_project_idx on evidence_item (project_id, created_at);
create index if not exists evidence_source_idx  on evidence_item (source_id);
create index if not exists evidence_unit_idx    on evidence_item (source_unit_id);
