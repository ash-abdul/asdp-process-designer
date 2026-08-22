/**
 * Bidi-safe composition.
 *
 * ADR-0023 rule 9: mixed-direction text is never string-concatenated. All
 * composition goes through a formatter that inserts isolates, because
 * concatenating an Arabic value into an English sentence (or the reverse)
 * reorders punctuation and digits in ways that change the visible meaning.
 *
 * Used by validation message rendering (validation-architecture.md §5 rule M4)
 * and by every export that mixes languages.
 */

import { baseDirection, isMixedDirection } from './normalise.ts';

/** FIRST STRONG ISOLATE — direction inferred from the content. */
const FSI = '⁨';
/** POP DIRECTIONAL ISOLATE. */
const PDI = '⁩';
/** LEFT-TO-RIGHT MARK. */
const LRM = '‎';
/** RIGHT-TO-LEFT MARK. */
const RLM = '‏';

/**
 * Wrap an interpolated value in a first-strong isolate.
 *
 * Applied to every parameter substituted into a message, so an Arabic step name
 * inside an English finding renders correctly and vice versa.
 */
export function isolate(value: string): string {
  if (value.length === 0) return value;
  return `${FSI}${value}${PDI}`;
}

/** Isolate only when the value would actually disturb the surrounding run. */
export function isolateIfNeeded(value: string, surroundingDirection: 'ltr' | 'rtl'): string {
  if (value.length === 0) return value;
  const valueDirection = baseDirection(value);
  if (valueDirection === 'neutral') return value;
  if (valueDirection !== surroundingDirection || isMixedDirection(value)) {
    return isolate(value);
  }
  return value;
}

/**
 * Interpolate named parameters into a template, isolating every value.
 *
 * Named parameters only, never positional: a translation reorders placeholders,
 * which happens constantly between English and Arabic
 * (validation-architecture.md §5 rule M2).
 */
export function formatMessage(
  template: string,
  params: Readonly<Record<string, string | number>>,
  templateDirection: 'ltr' | 'rtl' = 'ltr',
): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(params, key)) return whole;
    const raw = params[key];
    const value = typeof raw === 'number' ? String(raw) : (raw ?? '');
    return isolateIfNeeded(value, templateDirection);
  });
}

/** Mark a neutral-looking string so it renders with an explicit direction. */
export function markDirection(value: string, direction: 'ltr' | 'rtl'): string {
  const mark = direction === 'rtl' ? RLM : LRM;
  return `${mark}${value}${mark}`;
}

/** Strip all bidi control characters — for comparison and hashing only. */
export function stripBidiControls(s: string): string {
  return s.replace(/[؜‎‏‪-‮⁦-⁩]/g, '');
}
