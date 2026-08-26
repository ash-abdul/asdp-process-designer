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
import { StateBadge, Chip } from '../components/ui/Badge.tsx';
import { Inspector, InspectorSection } from '../components/shell/Inspector.tsx';
import { InspectorRow } from '../components/ui/Card.tsx';
import type { Remote } from '../app/state.ts';
import type { ApiClient } from '../api/client.ts';
import type { DevIdentity } from '../lib/dev-auth.ts';
import { CiteEvidence } from '../features/evidence/CiteEvidence.tsx';
import type { UnitOption } from '../features/evidence/evidence-model.ts';

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
  /** The units the server parsed. U3-b cites one of these, and nothing else. */
  readonly units: readonly UnitOption[];
  /** The document's own filename, so a heading need not be passed in. */
  readonly filename?: string;
}

/** Narrow the validated payloads. No inference: every field is the server's. */
function narrow(value: DocumentPayload): Narrowed {
  const content = value.content as {
    source: { direction?: string; primaryLanguage?: string; textLength?: number; filename?: string };
    text: string;
    units: readonly UnitOption[];
  };
  const highlights = value.highlights as { ranges: readonly HighlightRange[] };
  const d = content.source.direction;
  return {
    text: content.text,
    direction: d === 'rtl' ? 'rtl' : d === 'neutral' ? 'neutral' : 'ltr',
    ...(content.source.primaryLanguage === undefined ? {} : { language: content.source.primaryLanguage }),
    ranges: highlights.ranges,
    ...(content.source.textLength === undefined ? {} : { reportedLength: content.source.textLength }),
    units: content.units,
    ...(content.source.filename === undefined ? {} : { filename: content.source.filename }),
  };
}

export function DocumentView({
  state,
  sourceName,
  backLabel,
  evidenceId,
  onBack,
  onRetry,
}: {
  state: Remote<DocumentPayload>;
  sourceName: string;
  /** Where "back" goes. Two workspaces reach this view since U3-c. */
  backLabel?: string;
  /**
   * Present when the document was opened by **following a citation**.
   *
   * The heading then names the **document**, and the evidence id becomes
   * secondary traceability text. It previously *was* the heading — a raw
   * `ev-01M0Y…` at page-title scale, which is debug output, not hierarchy.
   * Found by visual review; the id is kept because a citation must stay
   * traceable, and only its prominence changed.
   */
  evidenceId?: string;
  onBack: () => void;
  onRetry: () => void;
}): ReactNode {
  // The document's own filename when it has loaded; the caller's label until
  // then. No new read: `GET …/content` already returns the source.
  const heading = state.kind === 'ready' ? narrow(state.value).filename ?? sourceName : sourceName;

  return (
    <>
      <header className="workspace__head">
        <Button onClick={onBack} glyph="←" testId="back-to-sources">
          {backLabel ?? 'Back to sources'}
        </Button>
        <div>
          {evidenceId === undefined ? null : (
            // The existing label style, reused: no new CSS, and `section-title`
            // is already the shell's small uppercase label.
            <p className="section-title" data-testid="document-eyebrow">
              Evidence
            </p>
          )}
          <h1 data-testid="document-heading">{heading}</h1>
          <p>
            {evidenceId === undefined ? null : (
              <>
                Showing the region cited by <code className="id" data-testid="document-evidence-id">{evidenceId}</code>.{' '}
              </>
            )}
            Read-only. Evidence is highlighted from server-computed offsets.
          </p>
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
  // The document is a SHEET on the page, not content inside a titled card. A
  // card header above a centred reading column left a wide empty band beside the
  // text and made the page feel like a form rather than something to read.
  return (
    <SourceViewer
      text={value.text}
      ranges={value.ranges}
      documentDirection={value.direction}
      {...(value.language === undefined ? {} : { language: value.language })}
    />
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
  sourceId,
  client,
  projectId,
  identity,
  onClose,
  onEvidenceRecorded,
}: {
  state: Remote<DocumentPayload>;
  sourceName: string;
  sourceId: string;
  client: ApiClient;
  projectId: string;
  identity: DevIdentity;
  onClose: () => void;
  onEvidenceRecorded: () => void;
}): ReactNode {
  if (state.kind !== 'ready') {
    return (
      <Inspector title={sourceName} onClose={onClose}>
        <p className="state__hint">Evidence and context appear once the document has loaded.</p>
      </Inspector>
    );
  }

  const value = narrow(state.value);
  const counts = countByResolution(value.ranges);
  const broken = brokenRanges(value.ranges);
  const rendered = [...value.text].length;

  return (
    <Inspector title={sourceName} subtitle="Evidence and context" onClose={onClose}>
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
        {/*
          resolved and content_unverified are reported as SEPARATE numbers. One
          combined "12 highlights" figure is the conflation ADR-0038 forbids, and
          a single total is the easiest way to commit it by accident.
        */}
        {counts.map((c) => (
          <div className="inspector__stat" key={c.resolution}>
            <span className="count">{c.count}</span>
            <StateBadge family="verification" value={c.resolution} />
          </div>
        ))}
        {counts.length === 0 ? <p className="state__hint">No highlights on this document.</p> : null}
        {broken.length > 0 ? (
          <div className="inspector__stat">
            <span className="count">{broken.length}</span>
            <StateBadge family="verification" value="broken" />
            <span className="table__sub">listed above the text, never painted over it</span>
          </div>
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
        {/*
          **This sentence was narrowed at U3-b, not deleted.** It read: "Read-only
          by construction (ADR-0015). There is no write path in this view and none
          to add." The claim it was protecting still holds and is restated below;
          what changed is that citing a passage is not a write to the document.

          The source is immutable after ingest, an EvidenceItem is immutable too
          (D1, D8), and ADR-0015 governs ARTIFACT viewers — BPMN, DMN, forms —
          which must not be editable. Recording a citation is not editing the
          thing cited, and evidence is on the editable side of the product
          boundary (ADR-0002).
        */}
        <p className="state__hint">
          <strong>The document itself is not editable</strong>, here or anywhere: a source is
          immutable after ingest, and so is a citation of one (D1, D8). What this panel adds is a
          citation <em>about</em> the document.
        </p>
        <CiteEvidence
          client={client}
          projectId={projectId}
          sourceId={sourceId}
          units={value.units}
          identity={identity}
          onRecorded={onEvidenceRecorded}
        />
        <p className="state__hint">
          Citation is <strong>unit-level only</strong>. The API accepts a character range and this
          UI does not send one: offsets minted from a browser selection are the failure ADR-0039 §5
          exists to prevent.
        </p>
      </InspectorSection>
    </Inspector>
  );
}
