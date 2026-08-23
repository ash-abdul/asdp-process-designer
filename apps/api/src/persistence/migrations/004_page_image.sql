-- ASDP migration 004 — page images (V3).
--
-- ADR-0035: plain, explicit, PostgreSQL-compatible SQL.
--
-- One row per stored image. An image source has a single page 1; a paginated
-- source rasterised by V2-PDF will have one row per page. Same table either way,
-- so the vision path does not care which produced it.
--
-- INSERT-ONLY (ADR-0016, invariant D8). An image is never edited: a corrected
-- screenshot is a NEW source, so anchors over the old bytes stay valid.
--
-- The checksum is the load-bearing column. ADR-0038 target verification for an
-- image_region anchor is: the image exists, its checksum matches, and the cited
-- rectangle lies within width × height. Without sha256, width and height, that
-- verification cannot be performed at all — so all three are NOT NULL, and the
-- dimensions are constrained positive.

create table if not exists page_image (
  id                    text primary key,
  project_id            text not null references project(id) on delete restrict,
  source_id             text not null references source(id) on delete restrict,
  -- 1-based, matching how a human refers to a page.
  page_no               integer not null,
  -- Opaque BlobStore key. Never a filesystem path (A6).
  blob_ref              text not null,
  sha256                char(64) not null,
  width                 integer not null,
  height                integer not null,
  media_type            text not null,
  byte_size             bigint not null,
  created_at            timestamptz not null,

  constraint page_image_page_unique   unique (source_id, page_no),
  constraint page_image_page_positive check (page_no > 0),
  constraint page_image_sha_hex       check (sha256 ~ '^[0-9a-f]{64}$'),
  -- Zero or negative dimensions would make every bounds check vacuously true,
  -- which would silently disable ADR-0038 target verification.
  constraint page_image_dims_positive check (width > 0 and height > 0),
  constraint page_image_size_sane     check (byte_size >= 0)
);

create index if not exists page_image_source_idx  on page_image (source_id, page_no);
create index if not exists page_image_project_idx on page_image (project_id);
