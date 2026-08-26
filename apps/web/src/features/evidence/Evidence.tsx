/**
 * **The evidence inventory** — U3-b, [u3-proposal.md](../../../../../docs/60-plan/u3-proposal.md) §3.3.
 *
 * What has been cited in this project, grouped by the source it cites. It exists
 * so a reviewer can see what a requirement *could* rest on before U3-c gives
 * them requirements to rest it on.
 *
 * ## Where it lives, and why that is a deviation worth stating
 *
 * §3.3 places the inventory on **S5**, the requirements workspace — which
 * **U3-c** builds and which does not exist yet. The alternatives were to invent a
 * rail entry the approved navigation does not declare, or to defer the inventory
 * out of the slice that the boundary puts it in. It renders here, in the Sources
 * workspace, because evidence is cited **from** a source and this is the screen
 * that already holds them. U3-c may move or mirror it; nothing here presumes it
 * will not.
 *
 * ## What it does not do
 *
 * No verdict, no ordering of its own, no count without its partner (**Y8**).
 *
 * ## The ADR-0038 trap this list deliberately does not fall into
 *
 * A stored `EvidenceItem` carries `anchorVerified: boolean` and **not** its
 * resolution status. `recordEvidence` sets that boolean to `true` for everything
 * it stores, and `content_unverified` is citable — so `true` means *"the server
 * checked this before storing it (D1)"*, **not** *"the anchor resolved exactly"*.
 *
 * Rendering the `resolved` badge from that boolean would label a
 * content-unverified anchor as resolved, which is the one conflation
 * [ADR-0038](../../../../../docs/adr/ADR-0038-target-versus-content-verification.md)
 * exists to prevent. This build cannot tell the two apart from the evidence read,
 * so it **says so** instead of guessing. Recorded as a gap in U3-b's report.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { ApiClient } from '../../api/client.ts';
import { EvidenceList } from '../../api/contracts.ts';
import { Loading, Empty, Failed } from '../../components/states.tsx';
import { idle, loading, failed, ready, type Remote } from '../../app/state.ts';
import { Button } from '../../components/ui/Button.tsx';
import { Card } from '../../components/ui/Card.tsx';
import { DataTable, CellStack } from '../../components/ui/DataTable.tsx';
import { Chip } from '../../components/ui/Badge.tsx';
import { anchorSummary, bySource, originOf, preview, type EvidenceRow } from './evidence-model.ts';

export function Evidence({
  client,
  projectId,
  epoch,
  filenameFor,
}: {
  client: ApiClient;
  projectId: string;
  /** Bumped by a successful citation, so the list re-reads rather than guesses. */
  epoch: number;
  /** The inventory's filename for a source id, when it has one. Never invented. */
  filenameFor: (sourceId: string) => string | undefined;
}): ReactNode {
  const [state, setState] = useState<Remote<readonly EvidenceRow[]>>(idle());

  const load = useCallback(async (): Promise<void> => {
    setState(loading());
    try {
      const list = await client.get(`/projects/${projectId}/evidence`, EvidenceList);
      setState(ready(list.evidence as readonly EvidenceRow[]));
    } catch (error) {
      setState(failed(error as Error));
    }
  }, [client, projectId]);

  useEffect(() => {
    void load();
  }, [load, epoch]);

  const rows = state.kind === 'ready' ? state.value : [];
  const verified = rows.filter((r) => r.anchorVerified).length;

  return (
    <Card
      title="Evidence"
      flush
      testId="evidence-card"
      actions={
        <span className="row">
          {state.kind === 'ready' ? (
            <span className="row" data-testid="evidence-counts">
              {/* Y8: never a count without its partner. */}
              <span className="metric" title="Items whose anchor the server verified before storing">
                <span className="count">{verified}</span> verified
              </span>
              <span
                className="metric"
                title="Items the server stored without a verified anchor. There should be none: D1 requires verification to persist."
              >
                <span className="count">{rows.length - verified}</span> unverified
              </span>
            </span>
          ) : null}
          <Button onClick={() => void load()} small glyph="↻" testId="evidence-refresh">
            Refresh
          </Button>
        </span>
      }
    >
      {state.kind === 'idle' || state.kind === 'loading' ? (
        <div className="card__pad">
          <Loading what="evidence" />
        </div>
      ) : null}

      {state.kind === 'error' ? (
        <div className="card__pad">
          <Failed error={state.error} retry={() => void load()} />
        </div>
      ) : null}

      {state.kind === 'ready' && rows.length === 0 ? (
        <div className="card__pad">
          <Empty
            what="evidence"
            hint="Open a source and cite one of its units. Evidence is what a requirement will rest on, and nothing here is extracted by a model — no provider is wired."
          />
        </div>
      ) : null}

      {state.kind === 'ready' && rows.length > 0
        ? bySource(rows).map((group) => (
            <div className="card__pad" key={group.sourceId}>
              <p className="table__sub" data-testid={`evidence-group-${group.sourceId}`}>
                {/* The filename when the inventory has it; the id when it does not.
                    An id is not pretty, and it is true. */}
                {filenameFor(group.sourceId) ?? group.sourceId} · {group.rows.length}{' '}
                {group.rows.length === 1 ? 'item' : 'items'}
              </p>
              <DataTable
                caption={`Evidence cited from ${filenameFor(group.sourceId) ?? group.sourceId}`}
                rows={group.rows}
                rowKey={(r) => r.id}
                rowTestId={(r) => `evidence-${r.id}`}
                columns={[
                  {
                    key: 'quote',
                    header: 'Quote',
                    render: (r) => (
                      <CellStack
                        primary={
                          // The quote is source content: it renders in ITS
                          // direction and language, never the interface's.
                          <span
                            dir={r.anchor.direction === 'rtl' ? 'rtl' : 'ltr'}
                            lang={r.language}
                            title={r.verbatimText}
                          >
                            {preview(r.verbatimText)}
                          </span>
                        }
                        secondary={<code className="id">{r.id}</code>}
                      />
                    ),
                  },
                  {
                    key: 'anchor',
                    header: 'Anchor',
                    render: (r) => {
                      const a = anchorSummary(r);
                      return (
                        <CellStack
                          primary={
                            <span className="row">
                              <Chip title="How precisely the anchor addresses the source">{a.precision}</Chip>
                              <Chip title="The kind of target the anchor addresses">{a.target}</Chip>
                            </span>
                          }
                          secondary={
                            /*
                              **NOT an ADR-0038 verification badge**, and the
                              reason is the whole point.

                              `anchorVerified` is set to `true` for every stored
                              item — `recordEvidence` refuses anything that is
                              not citable, and `content_unverified` IS citable.
                              So a `true` here means "the server checked this
                              anchor before storing it (D1)", NOT "the anchor
                              resolved to its exact region".

                              Rendering the `resolved` badge from this boolean
                              would label a content-unverified anchor as
                              resolved, which is exactly the conflation ADR-0038
                              exists to prevent. The stored item does not carry
                              its resolution status, so this build cannot tell
                              the two apart — and says so rather than guessing.
                            */
                            <span
                              className="table__sub"
                              data-testid={`evidence-anchor-note-${r.id}`}
                              data-verified={a.verified ? 'true' : 'false'}
                            >
                              {a.verified
                                ? 'Checked by the server before storing (D1). Whether it resolved exactly or is content-unverified is not reported here.'
                                : 'Stored WITHOUT a verified anchor, which invariant D1 forbids. Report this.'}
                            </span>
                          }
                        />
                      );
                    },
                  },
                  {
                    key: 'origin',
                    header: 'Origin',
                    render: (r) => {
                      const origin = originOf(r);
                      return <CellStack primary={origin.label} secondary={origin.detail} />;
                    },
                  },
                  {
                    key: 'classification',
                    header: 'Classification',
                    render: (r) => (
                      <CellStack
                        primary={<Chip title="Inherited from the source; may be raised, never lowered (ADR-0021)">{r.classification}</Chip>}
                        secondary={r.language}
                      />
                    ),
                  },
                ]}
              />
            </div>
          ))
        : null}
    </Card>
  );
}
