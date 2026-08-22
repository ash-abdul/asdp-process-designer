/**
 * Request-parsing helpers.
 *
 * Extracted because both intake controllers need them and because ADR-0034 N3
 * caps controller size — the `controller-thinness` rule fired on the first
 * controller that carried its own copies, which is the rule working rather than
 * the rule being inconvenient.
 *
 * These are transport concerns: turning untyped JSON into typed values and
 * rejecting what does not fit. No business rule lives here; a value that parses
 * is still validated by the command layer.
 */

import { BadRequestException } from '@nestjs/common';

export function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new BadRequestException(`'${field}' must be a string`);
  return value;
}

export function requiredString(value: unknown, field: string): string {
  const parsed = optionalString(value, field);
  if (parsed === undefined || parsed.length === 0) {
    throw new BadRequestException(`'${field}' is required and must be a non-empty string`);
  }
  return parsed;
}

export function optionalInteger(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new BadRequestException(`'${field}' must be an integer`);
  }
  return value;
}

/**
 * Include a key only when its value is defined.
 *
 * Spreading an explicit `undefined` would set the property, and an optional
 * field present-but-undefined behaves differently from an absent one once it
 * reaches a zod schema or a JSON column.
 */
export function maybe<K extends string, V>(
  key: K,
  value: V | undefined,
): Record<K, V> | Record<string, never> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

/** Parse a non-negative integer from a query string. */
export function parseOffset(raw: string | undefined, field: string): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new BadRequestException(`'${field}' must be a non-negative integer`);
  }
  return n;
}

export interface ContentBody {
  readonly text?: unknown;
  readonly contentBase64?: unknown;
}

/**
 * Decode an upload body into bytes.
 *
 * Two accepted forms and no multipart parser: multipart would be a new
 * dependency, and A4 says avoid unnecessary ones. `text` is encoded to UTF-8
 * here so the ingest guard always sees bytes and applies exactly one code path —
 * a text shortcut that bypassed the guard would be a hole in it.
 */
export function decodeContent(body: ContentBody): Uint8Array {
  const text = optionalString(body.text, 'text');
  const base64 = optionalString(body.contentBase64, 'contentBase64');

  if (text !== undefined && base64 !== undefined) {
    throw new BadRequestException("supply either 'text' or 'contentBase64', not both");
  }
  if (text !== undefined) return new TextEncoder().encode(text);
  if (base64 !== undefined) {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
      throw new BadRequestException("'contentBase64' is not valid base64");
    }
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  throw new BadRequestException("either 'text' or 'contentBase64' is required");
}
