/**
 * @asdp/provenance — anchors, resolution and quote location.
 *
 * PURE package. Imports `node:crypto` for deterministic hashing only; see the
 * purity note in checksum.ts.
 */

export {
  type AnchorPrecision,
  type AnchorKind,
  type AnchorTarget,
  type ProvenanceAnchor,
  type Rect,
  hasTextOffsets,
  textOffsetsOf,
  describeAnchor,
} from './anchor.ts';

export { spanChecksum, sha256 } from './checksum.ts';

export {
  type Resolution,
  type ResolutionStatus,
  resolveTextAnchor,
  assertAnchorResolvable,
} from './resolve.ts';

export {
  type LocateOutcome,
  type LocateRequest,
  locateQuote,
  mayBecomeEvidence,
} from './locate.ts';
