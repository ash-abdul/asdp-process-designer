/**
 * Provenance anchor model.
 *
 * ADR-0008: every EvidenceItem and SourceUnit MUST carry a resolvable anchor.
 * An unresolvable anchor is a hard error (L0-ING-002 / L0-ING-003), never stored
 * silently and never downgraded to a document-level reference to make it pass.
 *
 * Offsets are Unicode code-point indices over NFC, logical-order text.
 */

import type { Direction } from '@asdp/text';

/** How precisely the anchor locates its content. Feeds computed confidence. */
export type AnchorPrecision = 'exact' | 'cell' | 'page' | 'document';

/** A rectangle in page or image coordinates. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * Anchor targets, by source kind. Additive: new kinds may be added, existing
 * kinds are never redefined.
 */
export type AnchorTarget =
  | { readonly kind: 'text_range'; readonly charStart: number; readonly charEnd: number }
  | {
      readonly kind: 'docx_block';
      readonly blockPath: string;
      readonly runStart: number;
      readonly runEnd: number;
      /** Code-point offsets into the source's canonical text, so a DOCX anchor is
       *  verifiable by the same resolver as every other text anchor. Optional for
       *  the same reason `pdf_region` carries them optionally: the block address
       *  is the primary identity, the offsets make it checkable. */
      readonly charStart?: number;
      readonly charEnd?: number;
    }
  | {
      readonly kind: 'pdf_region';
      readonly page: number;
      /** A LIST: one logical range may wrap into several rectangles, which is
       *  common in RTL and mixed-direction text (provenance-and-anchoring.md §2). */
      readonly rects: readonly Rect[];
      readonly charStart?: number;
      readonly charEnd?: number;
    }
  | { readonly kind: 'image_region'; readonly imageId: string; readonly rect: Rect }
  | { readonly kind: 'sheet_cell'; readonly sheet: string; readonly a1Range: string }
  | { readonly kind: 'bpmn_element'; readonly fileId: string; readonly elementId: string }
  | {
      readonly kind: 'dmn_rule';
      readonly fileId: string;
      readonly decisionId: string;
      readonly ruleId?: string;
    }
  | { readonly kind: 'form_field'; readonly fileId: string; readonly fieldId: string }
  | { readonly kind: 'transcript'; readonly sessionId: string; readonly turnId: string };

export type AnchorKind = AnchorTarget['kind'];

/** The full anchor envelope. */
export interface ProvenanceAnchor {
  readonly sourceId: string;
  readonly target: AnchorTarget;
  /** Verbatim quote of the anchored span, in its source language. */
  readonly quote: string;
  /** Checksum of the anchored span, so drift is detectable rather than silent. */
  readonly quoteChecksum: string;
  readonly language: string;
  readonly direction: Direction;
  readonly precision: AnchorPrecision;
  /** Which adapter version minted this anchor, for selective re-verification. */
  readonly extractorVersion: string;
}

/**
 * Code-point offsets carried by a target, or null when it addresses something
 * other than text.
 *
 * One function rather than a per-kind check, because resolution and highlighting
 * both need the same answer and must never disagree about which anchors are
 * verifiable against stored text.
 */
export function textOffsetsOf(
  target: AnchorTarget,
): { readonly start: number; readonly end: number } | null {
  switch (target.kind) {
    case 'text_range':
      return { start: target.charStart, end: target.charEnd };
    case 'pdf_region':
    case 'docx_block':
      return target.charStart !== undefined && target.charEnd !== undefined
        ? { start: target.charStart, end: target.charEnd }
        : null;
    default:
      return null;
  }
}

/** True when a target can be verified against stored text. */
export function hasTextOffsets(target: AnchorTarget): boolean {
  return textOffsetsOf(target) !== null;
}

/** Human-readable rendering of an anchor, for the traceability matrix. */
export function describeAnchor(anchor: ProvenanceAnchor): string {
  const t = anchor.target;
  switch (t.kind) {
    case 'text_range':
      return `chars ${t.charStart}–${t.charEnd}`;
    case 'docx_block':
      return t.charStart !== undefined
        ? `${t.blockPath} runs ${t.runStart}–${t.runEnd} (chars ${t.charStart}–${t.charEnd})`
        : `${t.blockPath} runs ${t.runStart}–${t.runEnd}`;
    case 'pdf_region':
      return t.charStart !== undefined
        ? `p.${t.page} chars ${t.charStart}–${t.charEnd}`
        : `p.${t.page}`;
    case 'image_region':
      return `image ${t.imageId} region`;
    case 'sheet_cell':
      return `${t.sheet}!${t.a1Range}`;
    case 'bpmn_element':
      return `element ${t.elementId}`;
    case 'dmn_rule':
      return t.ruleId !== undefined
        ? `decision ${t.decisionId} rule ${t.ruleId}`
        : `decision ${t.decisionId}`;
    case 'form_field':
      return `field ${t.fieldId}`;
    case 'transcript':
      return `turn ${t.turnId}`;
  }
}
