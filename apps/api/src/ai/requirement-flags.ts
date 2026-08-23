/**
 * Requirement quality flags — deterministic, rule-raised — **J6**.
 *
 * RAF §3 derives the `ambiguities` slot from `RequirementFlag` records whose kind
 * is one of `ambiguous`, `vague_quantifier`, `actor_unknown`, `untestable` or
 * `unverifiable`. That is why these are **flags rather than catalogue rules**:
 * G1's criterion is "0 blocking flags", so blocking-ness belongs to the flag, and
 * the derived slot is an aggregation over flags rather than over findings.
 *
 * ## Deterministic on purpose
 *
 * Nothing here asks a model whether a proposition is vague. A model asked to grade
 * its own output will grade it well, and an ambiguity report that depends on the
 * model's mood is not a report. These are string tests: crude, reproducible, and
 * measurable against human-marked spans (`Ambiguity agreement`, evaluation
 * framework §3.1).
 *
 * ## They flag, they never reject
 *
 * A vague requirement is still a **grounded** requirement, and **J1** is explicit
 * that a grounded-but-vague proposal is persisted *with* its flags rather than
 * discarded. Rejection is for propositions with no evidence; flags are for
 * propositions whose evidence is real and whose wording is weak.
 *
 * V5 raises `warning` and `info` only. Nothing here blocks, because the gate that
 * blocking would serve is V7's.
 */

import type { RequirementFlagKind } from '@asdp/schemas';
import type { AcceptedProposal, EligibleEvidence } from './proposal-gate.ts';

export interface DerivedFlag {
  readonly kind: RequirementFlagKind;
  readonly severity: 'warning' | 'info';
  readonly detail: string;
}

/**
 * Quantifiers that promise a threshold and do not supply one.
 *
 * Each of these becomes a question at specification time — "promptly" cannot be
 * compiled into a timer, and nobody notices it is missing until the timer is
 * needed. Both scripts, because a bilingual document flags in whichever language
 * the clause was written.
 */
const VAGUE_QUANTIFIERS: readonly { readonly pattern: RegExp; readonly term: string }[] = [
  { pattern: /\bpromptly\b/i, term: 'promptly' },
  { pattern: /\bas soon as possible\b/i, term: 'as soon as possible' },
  { pattern: /\bin a timely manner\b/i, term: 'in a timely manner' },
  { pattern: /\bas (?:appropriate|required|needed)\b/i, term: 'as appropriate' },
  { pattern: /\bwhere possible\b/i, term: 'where possible' },
  { pattern: /\breasonabl[ey]\b/i, term: 'reasonable' },
  { pattern: /\bsufficient(?:ly)?\b/i, term: 'sufficient' },
  { pattern: /\bregularly\b/i, term: 'regularly' },
  { pattern: /\bseveral\b/i, term: 'several' },
  { pattern: /\bminimal\b/i, term: 'minimal' },
  { pattern: /في الوقت المناسب/, term: 'في الوقت المناسب' },
  { pattern: /عند الحاجة/, term: 'عند الحاجة' },
  { pattern: /بشكل منتظم/, term: 'بشكل منتظم' },
];

/** A number, a duration or a currency amount — anything a threshold could be. */
const HAS_THRESHOLD = /\d|[٠-٩]/u;

/**
 * An obligation with nobody attached to it.
 *
 * The test is deliberately narrow: an obligation marker with no capitalised noun,
 * no role word and no Arabic actor word before it. It catches the passive
 * construction that hides the actor — "the request must be approved" — which is
 * the case that reaches BPMN as a task with no assignee.
 */
const OBLIGATION = /\b(?:must|shall|is required to|has to)\b|يجب|يُشترط/iu;
const PASSIVE_OBLIGATION = /\b(?:must|shall)\s+be\s+\w+ed\b/i;
const ROLE_WORDS =
  /\b(?:officer|applicant|manager|reviewer|approver|administrator|analyst|supervisor|department|team|system|customer|citizen|establishment|authority|inspector|owner)\b/i;
const ARABIC_ROLE_WORDS = /الموظف|مقدم الطلب|المدير|المراجع|النظام|الجهة|القسم|المفتش/;

/**
 * A proposition nobody could write a test for.
 *
 * "Should be user-friendly" is a preference, not a requirement, and the failure it
 * causes appears at G4 when a test scenario cannot be authored for it — far too
 * late to ask the business what they meant.
 */
const UNTESTABLE =
  /\b(?:user[- ]friendly|easy to use|intuitive|efficient|robust|scalable|modern|seamless|best practice|state of the art|as needed)\b/i;

/**
 * Derive every flag that applies to an accepted proposal.
 *
 * Takes the accepted proposal rather than the model's output, so a flag can never
 * be raised against something that was rejected — a flag on a non-existent
 * requirement would be a finding about nothing.
 */
export function deriveFlags(
  accepted: AcceptedProposal,
  evidence: readonly EligibleEvidence[],
): readonly DerivedFlag[] {
  const flags: DerivedFlag[] = [];
  const text = accepted.text;

  for (const { pattern, term } of VAGUE_QUANTIFIERS) {
    if (pattern.test(text) && !HAS_THRESHOLD.test(text)) {
      flags.push({
        kind: 'vague_quantifier',
        severity: 'warning',
        detail:
          `the proposition says '${term}' and states no threshold; a specification cannot ` +
          'compile a duration nobody has given',
      });
      break;
    }
  }

  if (
    OBLIGATION.test(text) &&
    (PASSIVE_OBLIGATION.test(text) || (!ROLE_WORDS.test(text) && !ARABIC_ROLE_WORDS.test(text)))
  ) {
    flags.push({
      kind: 'actor_unknown',
      severity: 'warning',
      detail:
        'the proposition states an obligation without naming who carries it; an unassigned ' +
        'obligation becomes a task with no assignee',
    });
  }

  if (UNTESTABLE.test(text)) {
    flags.push({
      kind: 'untestable',
      severity: 'warning',
      detail:
        'the proposition is not stated in terms a test scenario could be written against ' +
        '(test-scenario-model.md); it reads as a preference rather than a requirement',
    });
  }

  // Provenance-shaped signals. Informational: they say something true about how
  // well-supported the proposition is, and neither is a defect in the proposition.
  const distinctSources = new Set(evidence.map((e) => e.item.sourceId));
  if (distinctSources.size === 1) {
    flags.push({
      kind: 'single_source',
      severity: 'info',
      detail:
        'every citation comes from one source; nothing corroborates it, and V5 compares nothing ' +
        '(cross-source reconciliation is V6)',
    });
  }

  // ADR-0038: visual evidence is target-verified, never content-verified. A
  // proposition resting only on it inherits that limit and must say so rather
  // than presenting itself as read from text.
  const allVisual = evidence.length > 0 && evidence.every((e) => e.item.anchor.target.kind === 'image_region');
  if (allVisual) {
    flags.push({
      kind: 'content_unverified_evidence',
      severity: 'info',
      detail:
        'every citation is an image region, which is target-verified but never content-verified ' +
        '(ADR-0038); the proposition rests on a reading of a picture',
    });
  }

  return flags;
}
