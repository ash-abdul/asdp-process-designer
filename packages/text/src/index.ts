/**
 * @asdp/text — the single owner of text normalisation and offset arithmetic.
 *
 * PURE package: no filesystem, network, clock or randomness (module-map.md §2).
 * No other component may normalise text or compute an offset (ADR-0023 rule 1).
 */

export {
  type Direction,
  type TextRun,
  type NormalisedText,
  normalise,
  baseDirection,
  isMixedDirection,
  toCodePoints,
  codePointLength,
  sliceByCodePoints,
  codePointToUtf16Index,
} from './normalise.ts';

export {
  foldPresentationForm,
  foldPresentationForms,
  hasPresentationForms,
  stripDiacritics,
  foldDigits,
  foldLetters,
} from './arabic.ts';

export {
  type MatchForm,
  buildMatchForm,
  buildMatchFormCollapsed,
  toMatchText,
} from './matchform.ts';

export {
  type IdentifierStrategy,
  type MintedIdentifier,
  type MintOptions,
  mintIdentifier,
  transliterate,
  slugify,
  isNcNameSafe,
  isAscii,
  isVariableNameSafe,
  isJobTypeSafe,
} from './identifiers.ts';

export {
  isolate,
  isolateIfNeeded,
  formatMessage,
  markDirection,
  stripBidiControls,
} from './bidi.ts';
