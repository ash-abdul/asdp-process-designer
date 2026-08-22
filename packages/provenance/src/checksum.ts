/**
 * Span checksums.
 *
 * PURITY NOTE: this pure package imports `node:crypto`. Hashing is a
 * deterministic computation over its inputs, not I/O — it performs no
 * filesystem, network, clock or randomness access, so it preserves the purity
 * guarantee in module-map.md §2. The architecture checker permits `node:crypto`
 * in pure packages for exactly this reason and forbids every other host module.
 */

import { createHash } from 'node:crypto';

/**
 * Checksum of an anchored span.
 *
 * Computed over the NFC form so that an equivalent representation of the same
 * Arabic text yields one checksum (ADR-0023, ADR-0016 §3).
 */
export function spanChecksum(text: string): string {
  return createHash('sha256').update(text.normalize('NFC'), 'utf8').digest('hex').slice(0, 32);
}

/** Full SHA-256 of arbitrary content, for artifact and baseline hashing. */
export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
