-- ASDP migration 012 — recorded data-governance blocks on RAF slots (V7 correction).
--
-- ADR-0035: plain, explicit, PostgreSQL-compatible SQL.
--
-- ## Why this table exists
--
-- G1 precondition 7 (`L4-REQ-007`) requires every `blocked_by_policy` slot to be
-- explicitly acknowledged, because *"we were not permitted to read this"* is a
-- fundamentally different finding from *"the sources do not say"*
-- (data-governance.md §3.1).
--
-- `slotStatus` has always been able to return `blocked_by_policy`, and
-- `computeFrameCoverage` has always collected it — but **nothing could ever
-- produce one**. A populate pass refused on egress grounds reported its reason in
-- the response and then forgot it, so the slot came back `empty` on the next read
-- and the distinction the ADR draws was lost exactly where it mattered.
--
-- The consequence was a precondition that could not fail. `L4-REQ-007` reported
-- *met* on every project, whatever the egress policy had refused — which is the
-- same defect as the one migration 011 exists to close, in a different limb.
--
-- INSERT-ONLY, and the symmetric record to `policy_acknowledgement`: one records
-- that analysis was denied, the other that a human accepted the consequence.

create table if not exists slot_policy_block (
  id                 text primary key,
  project_id         text not null references project(id) on delete restrict,
  requirement_set_id text not null references requirement_set(id) on delete restrict,
  raf_slot           text not null,
  -- The classification that could not leave, and where it could not go. Both are
  -- part of the finding: "RESTRICTED may not reach provider X" is answerable,
  -- "analysis was refused" is not.
  classification     text not null,
  provider           text not null,
  reason             text not null,
  blocked_at         timestamptz not null,

  constraint slot_policy_block_reason_present check (reason <> ''),
  -- One block per slot per set. A pass that refuses twice for the same slot
  -- states one fact twice.
  constraint slot_policy_block_unique unique (requirement_set_id, raf_slot)
);

create index if not exists slot_policy_block_set_idx
  on slot_policy_block (requirement_set_id);
