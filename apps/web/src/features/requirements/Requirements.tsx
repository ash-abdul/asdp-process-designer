/**
 * **Requirements** — the read-only workspace. U3-c.
 *
 * The list half of **Y11**'s three-pane composition: list here, detail in the
 * shell inspector, and the U1 viewer as the evidence pane when a chip is
 * followed. **Read-only by scope** — accept, reject, defer, revise and confirm
 * are **U3-d/U3-e**, and there is no control here that anticipates them.
 *
 * ## Two things this screen must get right
 *
 * **1. No bulk anything.** No select-all, no multi-select, no checkbox column, no
 * keyboard shortcut that acts on more than the focused row. That absence is
 * **limitation 70's only structural mitigation** (**Y18**), and a browser test
 * asserts it over the whole workspace rather than trusting this comment.
 *
 * **2. The empty state is the normal state, and it must say why.** No AI provider
 * is wired in any runnable configuration, so `POPULATE_FRAME` proposes nothing and
 * this list is legitimately empty. There are **two different empty states** and
 * they are rendered differently — see `setStateOf`.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { ApiClient } from '../../api/client.ts';
import { RequirementList, EvidenceList } from '../../api/contracts.ts';
import { mayInvoke, type DevIdentity } from '../../lib/dev-auth.ts';
import { Loading, Empty, Failed, Refused } from '../../components/states.tsx';
import { idle, loading, failed, ready, type Remote } from '../../app/state.ts';
import { Button } from '../../components/ui/Button.tsx';
import { Card } from '../../components/ui/Card.tsx';
import { DataTable, CellStack } from '../../components/ui/DataTable.tsx';
import { StateBadge, Chip } from '../../components/ui/Badge.tsx';
import {
  setStateOf,
  confidenceOf,
  versionOf,
  type RequirementRow,
  type SetState,
} from './requirement-model.ts';

export interface RequirementsData {
  readonly state: SetState;
  readonly rows: readonly RequirementRow[];
  /** evidenceItemId → sourceId, from the project's evidence list. */
  readonly sourceOf: (evidenceItemId: string) => string | undefined;
}

/**
 * Load the workspace's two reads.
 *
 * The evidence list is read alongside the requirements because an evidence link
 * names only an `evidenceItemId`, and following a chip needs the source it lives
 * in. It is the read U3-b already added — **no new API surface**.
 */
export function useRequirements(
  client: ApiClient,
  projectId: string | undefined,
  /**
   * Only read when the workspace is actually open.
   *
   * The hook is called unconditionally — hook order must be stable — but it must
   * not fetch requirements while the user is on Sources. Two idle requests would
   * be wasteful, and they would also appear in the browser suite's request log
   * on a screen that is asserting nothing was requested.
   */
  enabled: boolean,
): { data: Remote<RequirementsData>; reload: () => void } {
  const [data, setData] = useState<Remote<RequirementsData>>(idle());

  const load = useCallback(async (): Promise<void> => {
    if (!enabled || projectId === undefined) return;
    setData(loading());
    try {
      const [list, evidence] = await Promise.all([
        client.get(`/projects/${projectId}/requirements`, RequirementList),
        client.get(`/projects/${projectId}/evidence`, EvidenceList),
      ]);
      const bySource = new Map(evidence.evidence.map((e) => [e.id, e.sourceId]));
      setData(
        ready({
          state: setStateOf(list),
          // Rendered in the API's order. This client does not sort — see
          // `requirement-model.ts` for why that is deliberate.
          rows: list.requirements as readonly RequirementRow[],
          sourceOf: (id) => bySource.get(id),
        }),
      );
    } catch (error) {
      setData(failed(error as Error));
    }
    /*
      **The client is rebuilt on every render**, so depending on it here makes
      `load` a new function each time, which re-fires the effect, which sets
      state, which renders again — an unbounded read loop. It was caught by the
      browser suite, by the Ask ASDP zero-request test of all things, which
      recorded the same two requests dozens of times.

      What actually decides whether to read is the project and whether this
      workspace is open. This is the pattern `loadProjects` in `App.tsx` already
      uses, for the same reason.
    */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, reload: () => void load() };
}

export function Requirements({
  data,
  identity,
  selectedId,
  onSelect,
  onReload,
}: {
  data: Remote<RequirementsData>;
  identity: DevIdentity;
  selectedId?: string;
  onSelect: (row: RequirementRow) => void;
  onReload: () => void;
}): ReactNode {
  const mayRead = mayInvoke(identity, 'listRequirements');

  return (
    <>
      <header className="workspace__head">
        <div>
          <h1>Requirements</h1>
          {/*
            **Corrected at U3-d.** This read *"Read-only in this build: reviewing,
            revising and approving are later slices"*, which was true at U3-c and
            is now false in two ways: reviewing IS available, and **approving is
            not a later slice of this screen at all** — it is G1's act, reachable
            from no control here in any build.
          */}
          <p>
            Proposals derived from this project&apos;s evidence. Open one to review it. Revising is a
            later slice; <strong>approving is never done here</strong> — that is G1&apos;s act.
          </p>
        </div>
        <span className="workspace__spacer" />
        {data.kind === 'ready' && data.value.state.kind === 'populated' ? (
          <span className="row" data-testid="requirement-counts">
            <span className="metric" title="Proposals in the current requirement set">
              <span className="count">{data.value.state.total}</span> proposals
            </span>
            {/* Y8: never a count without its undecided partner. Every proposal
                here is a DRAFT AI proposition until a human acts, and nobody
                can act yet — U3-d. */}
            <span className="metric" title="Nobody has reviewed any of these. Reviewing is U3-d, and is not built.">
              <span className="count">{data.value.state.total}</span> undecided
            </span>
          </span>
        ) : null}
      </header>

      {!mayRead ? (
        <Refused
          what="your role cannot read requirements"
          reason="listRequirements needs Viewer, Contributor, BusinessAnalyst, ProcessArchitect, ComplianceReviewer or PlatformAdmin. The API refuses regardless of this screen."
          testId="requirements-denied"
        />
      ) : null}

      <Card
        title="Proposals"
        flush
        testId="requirements-card"
        actions={
          <Button onClick={onReload} small glyph="↻" testId="requirements-refresh">
            Refresh
          </Button>
        }
      >
        {data.kind === 'idle' || data.kind === 'loading' ? (
          <div className="card__pad">
            <Loading what="requirements" lines={4} />
          </div>
        ) : null}

        {data.kind === 'error' ? (
          <div className="card__pad">
            <Failed error={data.error} retry={onReload} />
          </div>
        ) : null}

        {data.kind === 'ready' ? <Body data={data.value} selectedId={selectedId} onSelect={onSelect} /> : null}
      </Card>
    </>
  );
}

/**
 * The two empty states, and the populated one.
 *
 * *"No requirements"* is not a message. **Which** nothing this is matters, and the
 * second case is almost always a configuration gap rather than a finding about
 * the evidence.
 */
function Body({
  data,
  selectedId,
  onSelect,
}: {
  data: RequirementsData;
  selectedId?: string;
  onSelect: (row: RequirementRow) => void;
}): ReactNode {
  if (data.state.kind === 'no_pass') {
    return (
      <div className="card__pad" data-testid="requirements-no-pass">
        <Empty
          what="requirements"
          hint="No population pass has run for this project. Requirements are proposed from verified evidence by POPULATE_FRAME, which is AI-invoking — and this application exposes no control that could start one."
        />
      </div>
    );
  }

  if (data.state.kind === 'empty_set') {
    return (
      <div className="card__pad" data-testid="requirements-empty-set">
        <Empty
          what="proposals in this set"
          hint={`A population pass HAS run and produced none. Set ${data.state.requirementSetId} exists and is empty. In this build that is a configuration gap rather than a finding: no AI provider is wired, so the pass refused. It is not a statement that the evidence supports nothing.`}
        />
      </div>
    );
  }

  return (
    <div className="table-scroll">
      <DataTable
        caption="Requirement proposals in the current set"
        rows={data.rows}
        rowKey={(r) => r.id}
        rowTestId={(r) => `requirement-${r.id}`}
        {...(selectedId === undefined ? {} : { selectedKey: selectedId })}
        onSelect={onSelect}
        columns={[
          {
            key: 'id',
            header: 'Requirement',
            render: (r) => (
              <CellStack
                primary={
                  <span className="row">
                    {/* Identifiers stay LTR and ASCII, whatever the content's direction. */}
                    <code className="id">{r.id}</code>
                    <StateBadge family="epistemic" value={r.epistemicLevel} subject={r.id} testId={`level-${r.id}`} />
                  </span>
                }
                secondary={
                  // The proposition is source-language content: its own
                  // direction and language, never the interface's (ADR-0023).
                  <span dir={r.language.startsWith('ar') ? 'rtl' : 'ltr'} lang={r.language}>
                    {r.text}
                  </span>
                }
              />
            ),
          },
          {
            key: 'slot',
            header: 'RAF slot',
            render: (r) => <CellStack primary={<Chip>{r.rafSlot}</Chip>} secondary={r.category} />,
          },
          {
            key: 'derivation',
            header: 'Derivation',
            render: (r) => (
              <CellStack
                primary={<Chip title="How the proposition relates to the evidence beneath it">{r.derivation}</Chip>}
                secondary={r.generatedBy === 'human' ? 'authored by a person' : `generated by ${r.generatedBy}`}
              />
            ),
          },
          {
            key: 'confidence',
            header: 'Confidence',
            render: (r) => {
              const c = confidenceOf(r);
              return (
                <CellStack
                  primary={<Chip title={c.caution}>{c.band}</Chip>}
                  /*
                    **Y21, read exactly:** *"Confidence is a computed band with
                    its inputs inspectable, never a bare percentage."*
                    Y21 requires the **band**, and requires the inputs to be
                    **inspectable** — not printed in every list cell. So the list
                    carries the band and the computed value; the function version
                    stays in the inspector, where the whole of it is, plus the
                    title here so it is one hover away rather than one click.

                    It previously rendered `0.78 · confidence-1` inline, which
                    wrapped onto two lines in a narrow column and split the score
                    from its function — the pairing Y21 exists to protect. The
                    fix keeps the pair together somewhere it fits instead of
                    breaking it where it does not.

                    Still never a percentage, here or anywhere.
                  */
                  secondary={
                    <span title={`Computed ${c.score} by ${c.functionVersion}. ${c.caution}`}>
                      {c.score}
                    </span>
                  }
                />
              );
            },
          },
          {
            key: 'status',
            header: 'Status',
            render: (r) => {
              const v = versionOf(r);
              return (
                <CellStack
                  primary={<StateBadge family="lifecycle" value={r.status} subject={r.id} testId={`status-${r.id}`} />}
                  secondary={v.version === 1 ? 'version 1' : `version ${v.version} · edited`}
                />
              );
            },
          },
        ]}
      />
    </div>
  );
}
