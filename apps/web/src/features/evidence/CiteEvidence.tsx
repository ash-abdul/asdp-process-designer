/**
 * **Cite a unit as evidence** — U3-b's one write, in the source viewer.
 *
 * Approved at [u3-proposal.md](../../../../../docs/60-plan/u3-proposal.md) §3.2.
 *
 * ## Why this does not contradict ADR-0015
 *
 * U1's viewer said *"read-only … there is no write path here and none to add"*,
 * and that sentence is now narrowed rather than deleted, because the distinction
 * it was protecting is real and still holds.
 *
 * **The document remains unwritable.** Nothing here edits, annotates or
 * re-anchors a source; sources are immutable after ingest, and an `EvidenceItem`
 * is immutable too (invariants D1, D8). What is created is a **separate
 * citation** that points at the document — and evidence sits on the *editable*
 * side of the product boundary
 * ([ADR-0002](../../../../../docs/adr/ADR-0002-spec-layer-editing.md)), while
 * [ADR-0015](../../../../../docs/adr/ADR-0015-read-only-viewers.md) governs
 * **artifact** viewers (BPMN, DMN, forms) and forbids editing the artifact.
 * Recording a citation is not editing the thing cited.
 *
 * ## Unit level only
 *
 * The API also accepts `charStart`/`charEnd`. **U3 does not use them** (**Z3**):
 * minting code-point offsets from a bidirectional DOM selection is the failure
 * ADR-0039 §5 exists to prevent. Citing a unit inherits the anchor the parser
 * minted, which the server re-verifies before it stores anything.
 *
 * ## No prediction
 *
 * This component never decides whether an anchor will resolve, and never
 * pre-validates. It sends, and it renders what the server said — including a
 * refusal, verbatim.
 */

import { useState, type ReactNode } from 'react';
import type { ApiClient } from '../../api/client.ts';
import { RecordedEvidence } from '../../api/contracts.ts';
import { mayInvoke, type DevIdentity } from '../../lib/dev-auth.ts';
import { Button, Reason } from '../../components/ui/Button.tsx';
import { Field } from '../../components/ui/Card.tsx';
import { Refused } from '../../components/states.tsx';
import { citeUnitBody, citeRefusal, unitOptionLabel, type CitePhase, type UnitOption } from './evidence-model.ts';

export function CiteEvidence({
  client,
  projectId,
  sourceId,
  units,
  identity,
  onRecorded,
}: {
  client: ApiClient;
  projectId: string;
  sourceId: string;
  units: readonly UnitOption[];
  identity: DevIdentity;
  onRecorded: () => void;
}): ReactNode {
  const [unitId, setUnitId] = useState<string>(units[0]?.id ?? '');
  const [phase, setPhase] = useState<CitePhase>({ kind: 'idle' });

  const enabled = mayInvoke(identity, 'recordEvidence');

  async function submit(): Promise<void> {
    if (unitId === '') return;
    setPhase({ kind: 'sending', unitId });
    try {
      const item = await client.post(
        `/projects/${projectId}/evidence`,
        citeUnitBody(sourceId, unitId),
        RecordedEvidence,
      );
      setPhase({ kind: 'recorded', evidenceId: item.id, unitId });
      // W4: re-read after every mutation. The server is the only authority on
      // what evidence exists, and an optimistic row would be this client
      // asserting a write it has not seen confirmed.
      onRecorded();
    } catch (error) {
      setPhase(citeRefusal(unitId, error));
    }
  }

  if (units.length === 0) {
    return (
      <p className="state__hint" data-testid="cite-no-units">
        This source has no units, so there is nothing to cite. Evidence is anchored to a unit, never
        to a character range chosen in the browser.
      </p>
    );
  }

  return (
    <div className="cite" data-testid="cite">
      {!enabled ? (
        <Reason testId="cite-denied">
          Your role cannot record evidence. <strong>recordEvidence</strong> needs BusinessAnalyst or
          ProcessArchitect. The API refuses regardless of this control.
        </Reason>
      ) : null}

      <Field
        id="cite-unit"
        label="Unit to cite"
        hint="The unit's anchor is inherited and re-verified by the server before anything is stored."
      >
        <select
          id="cite-unit"
          data-testid="cite-unit"
          value={unitId}
          onChange={(e) => setUnitId(e.target.value)}
          disabled={!enabled}
        >
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unitOptionLabel(unit)}
            </option>
          ))}
        </select>
      </Field>

      <div className="row">
        <Button
          onClick={() => void submit()}
          tone="primary"
          glyph="“”"
          testId="cite-submit"
          disabled={!enabled || phase.kind === 'sending' || unitId === ''}
        >
          {phase.kind === 'sending' ? 'Recording…' : 'Cite this unit as evidence'}
        </Button>
      </div>

      <CiteOutcome phase={phase} />
    </div>
  );
}

/**
 * The outcome.
 *
 * A refusal is rendered as a **refusal** (**Y27**), not as a crash, and it quotes
 * the server. `role="status"` for the success and `Refused`'s own `role="alert"`
 * for the refusal, so both reach a screen reader without either shouting.
 */
function CiteOutcome({ phase }: { phase: CitePhase }): ReactNode {
  if (phase.kind === 'recorded') {
    return (
      <p className="state__hint" role="status" data-testid="cite-recorded">
        Recorded as <code className="id">{phase.evidenceId}</code>. The server verified the anchor
        before storing it.
      </p>
    );
  }
  if (phase.kind === 'refused') {
    return (
      <Refused
        what={phase.roleRefusal ? 'your role does not permit this' : 'the evidence was not recorded'}
        // The server's own words. Summarising them here is how a precise refusal
        // — "refusing to store evidence with a broken anchor" — becomes a vague one.
        reason={phase.reason}
        testId="cite-refused"
      />
    );
  }
  return null;
}
