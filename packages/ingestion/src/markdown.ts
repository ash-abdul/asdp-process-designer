/**
 * Markdown adapter.
 *
 * Recognises the block constructs that carry meaning in a requirements document:
 * ATX headings, paragraphs, list items, fenced code blocks and block quotes.
 * Deliberately NOT a full CommonMark implementation — it is a block segmenter
 * with exact anchors, and it does not interpret inline markup, because a unit's
 * text must remain the verbatim source span for its checksum to mean anything.
 *
 * Where a marker is stripped (headings, list items) the anchor spans the CONTENT
 * only, not the marker. That keeps the invariant that a unit's text equals the
 * slice at its own offsets, which is what makes round-trip resolution a real
 * test rather than a tautology.
 *
 * Known limitations, declared rather than hidden:
 *   - setext headings (underlined with `===` / `---`) are read as paragraphs
 *   - table rows become paragraphs; per-cell units arrive with the spreadsheet
 *     work in V2
 *   - a list item is one line; lazy continuation lines become their own units
 */

import { toCodePoints } from '@asdp/text';
import type { SourceUnitType } from '@asdp/schemas';
import { buildUnit, isBlank, toLines, type ExtractedUnit, type ExtractionResult, type Line } from './units.ts';

export const MARKDOWN_EXTRACTOR_VERSION = 'markdown@1';

const ATX_HEADING = /^(#{1,6})\s+(.*)$/;
const LIST_ITEM = /^(\s*)(?:[-*+]|\d{1,9}[.)])\s+(.*)$/;
const FENCE = /^\s*(```+|~~~+)/;
const THEMATIC_BREAK = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const BLOCKQUOTE = /^\s*>/;

/** Code-point length of a string, without importing UTF-16 assumptions. */
function cpLength(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}

export function extractMarkdown(sourceId: string, normalisedText: string): ExtractionResult {
  const cps = toCodePoints(normalisedText);
  const lines = toLines(cps);
  const units: ExtractedUnit[] = [];

  const push = (
    start: number,
    end: number,
    type: SourceUnitType,
    depth?: number,
  ): void => {
    const unit = buildUnit({
      sourceId,
      cps,
      start,
      end,
      ordinal: units.length,
      type,
      ...(depth === undefined ? {} : { depth }),
      extractorVersion: MARKDOWN_EXTRACTOR_VERSION,
    });
    if (unit !== null) units.push(unit);
  };

  let i = 0;

  // YAML front matter is document metadata, not content. Skipping it keeps it
  // out of the evidence pool; emitting it as a paragraph would make `title: x`
  // citable as a business statement.
  if (lines.length > 0 && (lines[0] as Line).text.trim() === '---') {
    let close = -1;
    for (let j = 1; j < lines.length; j++) {
      const t = (lines[j] as Line).text.trim();
      if (t === '---' || t === '...') {
        close = j;
        break;
      }
    }
    // An unterminated `---` is a thematic break, not front matter.
    if (close !== -1) i = close + 1;
  }

  let paragraphStart: number | null = null;
  let paragraphEnd = 0;

  const flushParagraph = (): void => {
    if (paragraphStart === null) return;
    push(paragraphStart, paragraphEnd, 'paragraph');
    paragraphStart = null;
  };

  for (; i < lines.length; i++) {
    const line = lines[i] as Line;

    if (isBlank(line)) {
      flushParagraph();
      continue;
    }

    // --- fenced code block -------------------------------------------------
    const fence = FENCE.exec(line.text);
    if (fence !== null) {
      flushParagraph();
      const marker = (fence[1] as string).slice(0, 3);
      let contentStart = -1;
      let contentEnd = -1;
      let j = i + 1;
      for (; j < lines.length; j++) {
        const inner = lines[j] as Line;
        if (inner.text.trimStart().startsWith(marker)) break;
        if (contentStart === -1) contentStart = inner.start;
        contentEnd = inner.end;
      }
      if (contentStart !== -1) push(contentStart, contentEnd, 'codeBlock');
      // An unterminated fence consumes the rest of the document, which is what
      // a Markdown renderer does too.
      i = j;
      continue;
    }

    // --- thematic break ----------------------------------------------------
    if (THEMATIC_BREAK.test(line.text)) {
      flushParagraph();
      continue;
    }

    // --- ATX heading -------------------------------------------------------
    const heading = ATX_HEADING.exec(line.text);
    if (heading !== null) {
      flushParagraph();
      const hashes = (heading[1] as string).length;
      // Offset of the content within the line, in code points.
      const contentOffset = cpLength(line.text) - cpLength(heading[2] as string);
      push(line.start + contentOffset, line.end, 'heading', hashes);
      continue;
    }

    // --- block quote -------------------------------------------------------
    if (BLOCKQUOTE.test(line.text)) {
      flushParagraph();
      const start = line.start;
      let end = line.end;
      let j = i + 1;
      for (; j < lines.length; j++) {
        const inner = lines[j] as Line;
        if (isBlank(inner) || !BLOCKQUOTE.test(inner.text)) break;
        end = inner.end;
      }
      // The span keeps its `>` markers: they are part of the verbatim source,
      // and stripping them from a multi-line quote would make the text differ
      // from the slice at its own offsets.
      push(start, end, 'blockQuote');
      i = j - 1;
      continue;
    }

    // --- list item ---------------------------------------------------------
    const item = LIST_ITEM.exec(line.text);
    if (item !== null) {
      flushParagraph();
      const indent = cpLength(item[1] as string);
      const contentOffset = cpLength(line.text) - cpLength(item[2] as string);
      push(line.start + contentOffset, line.end, 'listItem', Math.floor(indent / 2));
      continue;
    }

    // --- paragraph ---------------------------------------------------------
    if (paragraphStart === null) paragraphStart = line.start;
    paragraphEnd = line.end;
  }

  flushParagraph();

  return { extractorVersion: MARKDOWN_EXTRACTOR_VERSION, units };
}
