/**
 * The source viewer — the point of U1.
 *
 * [ADR-0015](../../../../docs/adr/ADR-0015-read-only-viewers.md): read-only.
 * There is no write path here and none to add.
 *
 * Every highlight is painted from **server-computed offsets**. This component
 * does no searching, no normalisation and no direction inference; all of that
 * happened server-side, and `highlight-model.ts` turns the result into pieces.
 * See [ADR-0039](../../../../docs/adr/ADR-0039-react-presentation-layer.md) §5.
 */

import type { ReactNode } from 'react';
import {
  piecesFor,
  brokenRanges,
  pieceLabel,
  dirAttribute,
  resolutionName,
  type HighlightRange,
  type TextDirection,
} from './highlight-model.ts';

export function SourceViewer({
  text,
  ranges,
  documentDirection,
  language,
}: {
  text: string;
  ranges: readonly HighlightRange[];
  documentDirection: TextDirection;
  language?: string;
}): ReactNode {
  const pieces = piecesFor(text, ranges, documentDirection);
  const broken = brokenRanges(ranges);
  const painted = pieces.filter((p) => p.range !== undefined).length;

  return (
    <section className="viewer" aria-label="Source document">
      <p className="viewer__summary" role="status">
        {painted === 0
          ? 'No highlights on this document.'
          : `${painted} highlighted ${painted === 1 ? 'passage' : 'passages'}.`}
        {broken.length > 0 ? ` ${broken.length} anchor${broken.length === 1 ? '' : 's'} no longer resolve.` : ''}
      </p>

      {/*
        A broken anchor is shown in place and NEVER painted over the text.
        ADR-0039 §5: painting a best guess is the failure this prevents.
      */}
      {broken.length > 0 ? (
        <ul className="viewer__broken" aria-label="Anchors that no longer resolve">
          {broken.map((range, i) => (
            <li key={`broken-${i}`} className="broken">
              <strong>Broken anchor.</strong>{' '}
              {range.detail ?? 'The quote is no longer present in this source.'}{' '}
              <span className="broken__note">Not highlighted, because its position is no longer known.</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div
        className="viewer__text"
        dir={dirAttribute(documentDirection)}
        {...(language === undefined ? {} : { lang: language })}
      >
        {pieces.map((piece) =>
          piece.range === undefined ? (
            // Plain text. Rendered as TEXT, never as markup: an ingested document
            // is untrusted input and may contain anything.
            <span key={piece.key} dir={dirAttribute(piece.direction)}>
              {piece.text}
            </span>
          ) : (
            <mark
              key={piece.key}
              dir={dirAttribute(piece.direction)}
              {...(piece.segment?.language === undefined ? {} : { lang: piece.segment.language })}
              className={[
                'hl',
                `hl--${piece.range.resolution}`,
                piece.segment?.counterFlow === true ? 'hl--counterflow' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              // W8: never colour alone. A screen reader gets the whole story.
              aria-label={pieceLabel(piece)}
              title={pieceLabel(piece)}
            >
              {piece.text}
              {piece.range.resolution !== 'resolved' ? (
                <span className="hl__badge" aria-hidden="true">
                  {resolutionName(piece.range.resolution)}
                </span>
              ) : null}
            </mark>
          ),
        )}
      </div>
    </section>
  );
}
