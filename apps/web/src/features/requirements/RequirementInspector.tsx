/**
 * The requirement inspector — **Y6**'s fixed section order, proved on a
 * requirement for the first time.
 *
 * D-U2.5 recorded *"one inspector, one entity: the fixed section order is proved
 * on a source; requirements, conflicts and gates have no inspector because they
 * have no screen."* This is that limitation discharged for requirements.
 *
 * Order, unchanged from the accepted foundation:
 * **identity → provenance → confidence → actions → history.**
 *
 * ## What the Actions section says, and why it is not empty
 *
 * **U3-c is read-only.** Accept, reject, defer, send-for-clarification, revise
 * and confirm-inference are **U3-d/U3-e** and are not built. The section states
 * that rather than rendering nothing — an empty Actions panel reads as a page
 * that failed to load, and **Y7** is explicit that this inspector never becomes
 * an editor.
 *
 * ## History, bounded by G-e
 *
 * A predecessor is **named** and never fetched. No API returns a prior version,
 * **G-e is deliberately unfilled**, and U3 provides no version-history viewer.
 */

import type { ReactNode } from 'react';
import { Inspector, InspectorSection } from '../../components/shell/Inspector.tsx';
import { InspectorRow } from '../../components/ui/Card.tsx';
import { StateBadge, Chip } from '../../components/ui/Badge.tsx';
import { Button } from '../../components/ui/Button.tsx';
import {
  chipsFor,
  confidenceOf,
  evidenceExpectationOf,
  degradationsOf,
  derivationOf,
  provenanceOf,
  versionOf,
  type RequirementRow,
} from './requirement-model.ts';

export function RequirementInspector({
  row,
  sourceOf,
  onFollowEvidence,
  onClose,
}: {
  row: RequirementRow;
  sourceOf: (evidenceItemId: string) => string | undefined;
  onFollowEvidence: (evidenceItemId: string, sourceId: string) => void;
  onClose: () => void;
}): ReactNode {
  const confidence = confidenceOf(row);
  const version = versionOf(row);
  const derivation = derivationOf(row);
  const degradations = degradationsOf(row);
  const chips = chipsFor(row, sourceOf);
  // Whether having no evidence is legitimate depends on the DERIVATION. An
  // inferred requirement is supported by its mandatory rationale instead.
  const expectation = evidenceExpectationOf(row, chips.length);

  return (
    <Inspector title={row.id} subtitle="Requirement proposal" onClose={onClose}>
      <InspectorSection title="Identity">
        <InspectorRow label="Proposition">
          {/* Source-language content, in its own direction (ADR-0023). */}
          <span dir={row.language.startsWith('ar') ? 'rtl' : 'ltr'} lang={row.language} data-testid="req-text">
            {row.text}
          </span>
        </InspectorRow>
        <InspectorRow label="RAF slot">
          <Chip>{row.rafSlot}</Chip>
        </InspectorRow>
        <InspectorRow label="Category">
          <Chip>{row.category}</Chip>
        </InspectorRow>
        <InspectorRow label="Status">
          <StateBadge family="lifecycle" value={row.status} subject={row.id} testId="req-status" />
        </InspectorRow>
        <InspectorRow label="Classification">
          <Chip title="At least the maximum classification of its evidence (invariant D10)">{row.classification}</Chip>
        </InspectorRow>
      </InspectorSection>

      <InspectorSection title="Provenance">
        <InspectorRow label="Epistemic level">
          <StateBadge family="epistemic" value={row.epistemicLevel} subject={row.id} testId="req-level" />
        </InspectorRow>
        <InspectorRow label="Derivation">
          <Chip>{derivation.derivation}</Chip>
        </InspectorRow>
        {derivation.rationale === undefined ? null : (
          <InspectorRow label="Inference rationale">
            <span data-testid="req-rationale">{derivation.rationale}</span>
          </InspectorRow>
        )}
        {derivation.defect === undefined ? null : (
          // A broken invariant is reported, never rendered as a blank field.
          <InspectorRow label="Inference rationale">
            <strong data-testid="req-rationale-defect">{derivation.defect}</strong>
          </InspectorRow>
        )}
        {provenanceOf(row).map((entry) => (
          <InspectorRow key={entry.label} label={entry.label}>
            {entry.value === undefined ? (
              <Chip title="Not applicable, or the API did not state it">not stated</Chip>
            ) : (
              <code className="id">{entry.value}</code>
            )}
          </InspectorRow>
        ))}
        <InspectorRow label="Evidence">
          {expectation.kind === 'rationale_instead' ? (
            /*
              **Legitimate, and it must not read as a defect.** An inferred
              requirement is supported by the rationale above rather than by a
              citation — `insertInferred` stores no links on purpose. Saying
              "none" here without saying why is how a correct row gets reported
              as broken.
            */
            <span className="table__sub" data-testid="req-evidence-rationale">
              None, and that is correct for an inferred requirement: it rests on the rationale above
              rather than on a citation. Invariant D2 is satisfied by the rationale.
            </span>
          ) : expectation.kind === 'defect' ? (
            <strong data-testid="req-no-evidence">{expectation.detail}</strong>
          ) : (
            <span className="row" data-testid="req-evidence">
              {chips.map((chip) =>
                chip.followable ? (
                  <Button
                    key={chip.evidenceItemId}
                    small
                    glyph="“”"
                    testId={`evidence-chip-${chip.evidenceItemId}`}
                    title={`Open the source at this anchored region · ${chip.contribution}`}
                    onClick={() => onFollowEvidence(chip.evidenceItemId, chip.sourceId as string)}
                  >
                    {chip.contribution}
                  </Button>
                ) : (
                  // Never dropped: a citation the workspace cannot follow is
                  // exactly what a reviewer needs to be told about (ADR-0008).
                  <Chip key={chip.evidenceItemId} title={`Evidence ${chip.evidenceItemId} is not in this project's evidence list`}>
                    unresolved citation
                  </Chip>
                ),
              )}
            </span>
          )}
        </InspectorRow>
      </InspectorSection>

      <InspectorSection title="Confidence">
        <InspectorRow label="Band">
          <Chip>{confidence.band}</Chip>
        </InspectorRow>
        <InspectorRow label="Computed value">
          {/* Y21: never a bare percentage, and never without its function. */}
          <span className="table__num" data-testid="req-confidence">
            {confidence.score}
          </span>
          <span className="table__sub"> · {confidence.functionVersion}</span>
        </InspectorRow>
        <InspectorRow label="Human confirmation">
          <StateBadge
            family="decidedness"
            value={row.humanConfirmationRequired ? 'undecided' : 'decided'}
            subject={row.id}
            testId="req-confirmation"
          />
        </InspectorRow>
        <InspectorRow label="Degradations">
          {degradations.items.length === 0 ? (
            <span className="table__sub" data-testid="req-degradations">
              {degradations.summary}
            </span>
          ) : (
            <span className="row" data-testid="req-degradations">
              {degradations.items.map((d) => (
                <Chip key={d}>{d}</Chip>
              ))}
            </span>
          )}
        </InspectorRow>
        <p className="state__hint">{confidence.caution}</p>
      </InspectorSection>

      <InspectorSection title="Actions">
        <p className="state__hint" data-testid="req-actions">
          <strong>Read-only in this build.</strong> Accepting, rejecting, deferring, sending for
          clarification, revising and confirming an inference are later slices and are not built.
          Nothing here approves anything: approval is G1&apos;s act alone, and no route reaches it.
        </p>
      </InspectorSection>

      <InspectorSection title="History">
        <InspectorRow label="Version">
          <span className="table__num" data-testid="req-version">
            {version.version}
          </span>
          {version.edited ? <span className="table__sub"> · edited by a person</span> : null}
        </InspectorRow>
        {version.predecessor === undefined ? null : (
          <InspectorRow label="Supersedes">
            <code className="id" data-testid="req-predecessor">
              {version.predecessor}
            </code>
          </InspectorRow>
        )}
        {version.changeReason === undefined ? null : (
          <InspectorRow label="Change reason">
            <span data-testid="req-change-reason">{version.changeReason}</span>
          </InspectorRow>
        )}
        {version.textDiffersFromAi ? (
          <InspectorRow label="Original AI wording">
            {/* What the model actually said, kept legible after any amount of
                human editing. It is on THIS row — no history read is involved. */}
            <span dir={row.language.startsWith('ar') ? 'rtl' : 'ltr'} lang={row.language} data-testid="req-original">
              {row.originalAiText}
            </span>
          </InspectorRow>
        ) : null}
        <p className="state__hint" data-testid="req-history-note">
          The predecessor is <strong>named, not retrievable</strong>. No API returns a prior version,
          and this build provides no version-history viewer.
        </p>
      </InspectorSection>
    </Inspector>
  );
}
