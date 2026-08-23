/**
 * Epistemic ceilings — the highest level evidence of a given kind may support.
 *
 * **D4 (approved):** ceilings are deterministic FUNCTIONS of evidence kind and
 * extraction method, **not stored columns.** A stored ceiling can drift from the
 * source it describes and can be edited; a function over facts already recorded
 * cannot.
 *
 * ## This introduces no new epistemic meaning
 *
 * The ladder stays exactly four levels
 * ([epistemic-model.md](../../../docs/20-domain/epistemic-model.md) §1). The
 * ceiling is not a new level and not a new state — it is a cap on which existing
 * level content may reach.
 *
 * ## Why visual evidence is capped, and why the obvious reason is wrong
 *
 * L1 is defined as *"a verbatim fact with a resolvable anchor"*, created by
 * *"**AI extraction** or deterministic parser"*. So the cap **cannot** rest on
 * "an AI read it" — the approved model explicitly permits AI extraction to
 * produce L1.
 *
 * What disqualifies visual evidence is the **anchor**, not the author: L1 requires
 * a *resolvable* anchor, and for an image only the target resolves — the content
 * does not ([ADR-0038](../../../docs/adr/ADR-0038-target-versus-content-verification.md)).
 *
 * And the cap is not invented here. provenance-and-anchoring.md §5 already states
 * that `page` and `document` precision are *"permitted only for L2/L3 content,
 * never for L1 evidence"*, and `image_region` anchors are `page` precision. This
 * module implements an approved rule.
 *
 * ## Human confirmation does not raise the ceiling to L1
 *
 * The promotion graph is `L1 → L2 → L4` and `L3 → L4`. **There is no L2 → L1
 * transition** and none is created here. Confirming a diagram region does not
 * turn an interpretation into an extracted fact; it satisfies the confirmation
 * requirement that lets L2 content proceed toward L4.
 */

import type { EpistemicLevel } from '@asdp/schemas';

/** How the content was obtained. Mirrors `Source.extractionMethod`. */
export type ExtractionMethod = 'text' | 'vision' | 'mixed';

/**
 * Evidence kinds a ceiling is defined for.
 *
 * A subset of `SourceKind`: the ceiling depends on how the content was *read*,
 * not on the document's business role, so `brd` and `sop` do not appear —
 * a BRD read as text and a BRD read by vision have different ceilings.
 */
export type CeilingInput = {
  /** The source's `kind`. */
  readonly kind: string;
  readonly extractionMethod: ExtractionMethod;
};

export interface EpistemicCeiling {
  /** The highest level content from this evidence may reach before human acts. */
  readonly ceiling: EpistemicLevel;
  /**
   * True when each extracted item must be confirmed individually by a human
   * before it may support a requirement.
   *
   * Diagram images only. Risk R5: confident wrong extraction from a diagram is a
   * named high risk, and a whole-document acknowledgement would not catch a
   * single mis-read gateway label.
   */
  readonly requiresElementWiseConfirmation: boolean;
  /** One sentence, for the UI and the disclosure report. */
  readonly reason: string;
}

/** Source kinds whose content is read from pixels. */
const IMAGE_KINDS = new Set(['screenshot', 'diagram_image']);

/** Source kinds that are structured model files, parsed deterministically. */
const MODEL_KINDS = new Set(['bpmn', 'dmn', 'form']);

/**
 * The ceiling for a source.
 *
 * Pure and total: every input yields a ceiling, and the conservative branch is the
 * default. An unrecognised kind read by vision is capped like any other vision
 * source rather than falling through to L1.
 */
export function ceilingFor(input: CeilingInput): EpistemicCeiling {
  const visionRead = input.extractionMethod === 'vision' || input.extractionMethod === 'mixed';

  if (input.kind === 'diagram_image') {
    return {
      ceiling: 'L2',
      requiresElementWiseConfirmation: true,
      reason:
        'a diagram image is read from pixels, so its content has no independently verifiable ' +
        'anchor; each extracted element must be confirmed individually (risk R5)',
    };
  }

  if (IMAGE_KINDS.has(input.kind) || visionRead) {
    return {
      ceiling: 'L2',
      requiresElementWiseConfirmation: false,
      reason:
        'content read from pixels carries a page-precision anchor, which provenance-and-anchoring ' +
        '§5 permits only for L2/L3 content and never for L1 evidence',
    };
  }

  if (MODEL_KINDS.has(input.kind)) {
    return {
      ceiling: 'L1',
      requiresElementWiseConfirmation: false,
      reason:
        'a deterministic parser read a structured model file, so the element identity and its ' +
        'recorded name are both verifiable against the stored bytes',
    };
  }

  return {
    ceiling: 'L1',
    requiresElementWiseConfirmation: false,
    reason:
      'a deterministic parser read a text layer, so the quote is verifiable against the stored ' +
      'canonical text',
  };
}

/**
 * Whether content at a proposed level is permitted by the ceiling.
 *
 * L4 is always permitted by a ceiling, because L4 is a **human act**: a person may
 * approve a requirement resting on an L2 interpretation. The ceiling limits what
 * the *system* may assert unaided, not what a human may decide. Conflating the two
 * would make the product unable to approve anything derived from a screenshot.
 */
export function permittedByCeiling(
  proposed: EpistemicLevel,
  ceiling: EpistemicCeiling,
): boolean {
  if (proposed === 'L4') return true;
  // Claim STRENGTH, not the ladder's flow direction: L1 is the strongest claim
  // (verbatim fact), so a ceiling of L2 forbids L1 while permitting L2 and L3.
  const strength: Readonly<Record<EpistemicLevel, number>> = { L1: 3, L2: 2, L3: 1, L4: 0 };
  return strength[proposed] <= strength[ceiling.ceiling];
}
