/**
 * The document view — the source viewer, with its evidence inspector.
 *
 * **Y9, Y10, Y20.** The reading surface is the working area; everything *about*
 * the document — direction, language, highlight counts, the verification legend
 * — is in the inspector, which is where the mockup puts it and where a reviewer
 * looks for it.
 *
 * **What did NOT change, and must not:** the highlight geometry is
 * **server-computed**, this component does no searching, no normalisation and no
 * direction inference, and the rendered text length still equals the
 * `textLength` the server reported
 * ([ADR-0039](../../../../docs/adr/ADR-0039-react-presentation-layer.md) §5).
 * `highlight-model.ts` is untouched by this slice.
 */

import type { ReactNode } from 'react';
import { SourceViewer } from './SourceViewer.tsx';
import { countByResolution, brokenRanges, type HighlightRange, type TextDirection } from './highlight-model.ts';
import { Loading, Empty, Failed } from '../components/states.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Card } from '../components/ui/Card.tsx';
import { StateBadge, Chip } from '../components/ui/Badge.tsx';
import { Inspector, InspectorSection } from '../components/shell/Inspector.tsx';
import { InspectorRow } from '../components/ui/Card.tsx';
import type { Remote } from '../app/state.ts';

interface DocumentPayload {
  readonly content: unknown;
  readonly highlights: unknown;
}

interface Narrowed {
  readonly text: string;
  readonly direction: TextDirection;
  readonly language?: string;
  readonly ranges: readonly HighlightRange[];
  readonly reportedLength?: number;
}

/** Narrow the validated payloads. No inference: every field is the server's. */
function narrow(value: DocumentPayload): Narrowed {
  const content = value.content as {
    source: { direction?: string; primaryLanguage?: string; textLength?: number };
    text: string;
  };
  const highlights = value.highlights as { ranges: readonly HighlightRange[] };
  const d = content.source.direction;
  return {
    text: content.text,
    direction: d === 'rtl' ? 'rtl' : d === 'neutral' ? 'neutral' : 'ltr',
    ...(content.source.primaryLanguage === undefined ? {} : { language: content.source.primaryLanguage }),
    ranges: highlights.ranges,
    ...(content.source.textLength === undefined ? {} : { reportedLength: content.source.textLength }),
  };
}

export function DocumentView({
  state,
  sourceName,
  onBack,
  onRetry,
}: {
  state: Remote<DocumentPayload>;
  sourceName: string;
  onBack: () => void;
  onRetry: () => void;
}): ReactNode {
  return (
    <>
      <header className="workspace__head">
        <Button onClick={onBack} glyph="←" testId="back-to-sources">
          Back to sources
        </Button>
        <div>
          <h1>{sourceName}</h1>
          <p>Read-only. Evidence is highlighted from server-computed offsets.</p>
        </div>
      </header>

      {state.kind === 'idle' || state.kind === 'loading' ? <Loading what="the document" lines={6} /> : null}
      {state.kind === 'error' ? <Failed error={state.error} retry={onRetry} /> : null}
      {state.kind === 'ready' ? <Body value={narrow(state.value)} /> : null}
    </>
  );
}

function Body({ value }: { value: Narrowed }): ReactNode {
  if (value.text.length === 0) {
    return <Empty what="text" hint="This source has no extracted text — it may have failed to parse." />;
  }
  return (
    <Card title="Document" flush>
      <div style={{ padding: 'var(--asdp-space-4)' }}>
        <SourceViewer
          text={value.text}
          ranges={value.ranges}
          documentDirection={value.direction}
          {...(value.language === undefined ? {} : { language: value.language })}
        />
      </div>
    </Card>
  );
}

/**
 * The inspector for a document — **Y6**'s fixed section order, and **Y20**.
 *
 * The verification legend is here because the two states it distinguishes must
 * never be confused: *"the target exists"* is not *"the content says what we
 * claim"* ([ADR-0038](../../../../docs/adr/ADR-0038-target-versus-content-verification.md)).
 */
export function DocumentInspector({
  state,
  sourceName,
  overlay,
  onClose,
}: {
  state: Remote<DocumentPayload>;
  sourceName: string;
  overlay: boolean;
  onClose: () => void;
}): ReactNode {
  if (state.kind !== 'ready') {
    return (
      <Inspector title={sourceName} overlay={overlay} onClose={onClose}>
        <p className="state__hint">Evidence and context appear once the document has loaded.</p>
      </Inspector>
    );
  }

  const value = narrow(state.value);
  const counts = countByResolution(value.ranges);
  const broken = brokenRanges(value.ranges);
  const rendered = [...value.text].length;

  return (
    <Inspector title={sourceName} subtitle="Evidence and context" overlay={overlay} onClose={onClose}>
      <InspectorSection title="Identity">
        <InspectorRow label="Direction">
          <Chip>{value.direction.toUpperCase()}</Chip>
        </InspectorRow>
        <InspectorRow label="Language">
          {value.language === undefined ? <Chip>not stated</Chip> : <Chip>{value.language}</Chip>}
        </InspectorRow>
        <InspectorRow label="Length">
          <span className="table__num" data-testid="inspector-length">
            {rendered} code points
          </span>
          {value.reportedLength === undefined ? null : (
            <span className="table__sub">
              {' '}
              · server reported {value.reportedLength}
              {value.reportedLength === rendered ? ' — equal' : ' — DIFFERENT, which is a defect'}
            </span>
          )}
        </InspectorRow>
      </InspectorSection>

      <InspectorSection title="Evidence">
        {counts.map((c) => (
          <InspectorRow key={c.resolution} label={<StateBadge family="verification" value={c.resolution} />}>
            <span className="count">{c.count}</span>
          </InspectorRow>
        ))}
        {counts.length === 0 ? <p className="state__hint">No highlights on this document.</p> : null}
        {broken.length > 0 ? (
          <InspectorRow label={<StateBadge family="verification" value="broken" />}>
            <span className="count">{broken.length}</span>
            <span className="table__sub"> — listed above the text, never painted over it</span>
          </InspectorRow>
        ) : null}
      </InspectorSection>

      <InspectorSection title="How to read the highlights">
        <div className="legend">
          <p className="state__hint">
            Colour is never the only cue: each state also differs in its underline and carries a text
            badge.
          </p>
          <span className="legend__row">
            <span className="legend__swatch" style={{ background: 'var(--asdp-hl-resolved)' }} aria-hidden="true" />
            <StateBadge family="verification" value="resolved" />
          </span>
          <span className="legend__row">
            <span className="legend__swatch" style={{ background: 'var(--asdp-hl-unverified)' }} aria-hidden="true" />
            <StateBadge family="verification" value="content_unverified" />
          </span>
          <span className="legend__row">
            <span className="legend__swatch" style={{ background: 'var(--asdp-hl-drifted)' }} aria-hidden="true" />
            <StateBadge family="verification" value="drifted" />
          </span>
        </div>
      </InspectorSection>

      <InspectorSection title="Actions">
        <p className="state__hint">
          Read-only by construction (ADR-0015). There is no write path in this view and none to add.
        </p>
      </InspectorSection>
    </Inspector>
  );
}
