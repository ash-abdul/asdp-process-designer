/**
 * Canonical serialisation and content hashing.
 *
 * ADR-0016 §3: canonicalisation is MANDATORY before hashing. Without it,
 * cosmetic reserialisation churns hashes, every diff shows noise, and approvers
 * stop reading diffs — which silently destroys the governance model.
 *
 * Rules for JSON payloads:
 *   - object keys sorted
 *   - no insignificant whitespace
 *   - numbers in canonical form
 *   - all text NFC-normalised, so the same Arabic label yields ONE hash
 *     regardless of the input document's normalisation form
 */

import { sha256 } from '@asdp/provenance';

/**
 * Canonicalise a JSON-serialisable value.
 *
 * Deterministic: same logical value → identical string, in any process, in any
 * key insertion order.
 */
export function canonicalJson(value: unknown): string {
  return serialise(value);
}

function serialise(value: unknown): string {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'string':
      // NFC so an Arabic label supplied as NFD hashes identically.
      return JSON.stringify(value.normalize('NFC'));
    case 'number':
      if (!Number.isFinite(value)) {
        throw new Error(`non-finite number cannot be canonicalised: ${String(value)}`);
      }
      // Canonical form: integers without a decimal point, no exponent drift.
      return Number.isInteger(value) ? String(value) : JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'undefined':
      // Undefined is omitted by callers; reaching here means a bug.
      throw new Error('undefined cannot be canonicalised; omit the key instead');
    case 'bigint':
      return `"${value.toString()}"`;
    default:
      break;
  }

  if (Array.isArray(value)) {
    return `[${value.map(serialise).join(',')}]`;
  }

  if (value instanceof Date) {
    throw new Error('Date cannot be canonicalised; pass an ISO string');
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${serialise(v)}`).join(',')}}`;
}

/** Content hash of a JSON-serialisable value, over its canonical form. */
export function contentHash(value: unknown): string {
  return sha256(canonicalJson(value));
}

/**
 * Canonicalise text content (for XML artifacts and generated documents).
 *
 * LF line endings, no trailing whitespace, NFC, no BOM, single trailing newline.
 * The XML-specific rules (namespace prefixes, attribute ordering, element
 * ordering) belong to the compilers and are applied before this function.
 */
export function canonicalText(text: string): string {
  const normalised = text
    .replace(/^﻿/, '')
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '');
  return `${normalised}\n`;
}

/** Content hash of text content, over its canonical form. */
export function textContentHash(text: string): string {
  return sha256(canonicalText(text));
}
