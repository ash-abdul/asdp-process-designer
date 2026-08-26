/**
 * **Sources** — inventory, upload, authority ranking and L0 validation.
 *
 * U2's screen, rebuilt on the approved design foundation (**D-U2.5**). It is a
 * **presentation-only** change: the same four requests, the same four
 * distinctions, the same permission model, the same refusal handling.
 *
 * Every judgement it renders still comes from `source-model.ts` or from the
 * server. It decides nothing: not whether a rank is authoritative, not whether a
 * finding blocks, not whether a role may act
 * ([ADR-0039](../../../../../docs/adr/ADR-0039-react-presentation-layer.md) §3, §4).
 *
 * ## The four distinctions, now carried by the token layer
 *
 * | | Distinction | How the design carries it |
 * |---|---|---|
 * | 1 | A **duplicate is not an upload** | Three named outcomes with three different treatments — never one success toast |
 * | 2 | A **parse failure is a state**, not a disappearance | The row stays, with a lifecycle badge and the server's reason |
 * | 3 | **Unranked is not rank 0** | The `undecided` semantic token: dashed, italic, glyph `○`, sorted last |
 * | 4 | **Severity belongs to the rule catalogue** | `StateBadge family="severity"` renders what the catalogue said (ADR-0026) |
 */

import { useCallback, useRef, useState, type ReactNode } from 'react';
import type { ApiClient } from '../../api/client.ts';
import { SourceList, IngestResponse, IntakeValidation, RuleCatalogue } from '../../api/contracts.ts';
import { mayInvoke, type DevIdentity } from '../../lib/dev-auth.ts';
import { Loading, Empty, Failed, Refused } from '../../components/states.tsx';
import { idle, loading, failed, ready, type Remote } from '../../app/state.ts';
import { Button, Reason } from '../../components/ui/Button.tsx';
import { Card, Field } from '../../components/ui/Card.tsx';
import { DataTable, CellStack } from '../../components/ui/DataTable.tsx';
import { StateBadge, Chip } from '../../components/ui/Badge.tsx';
import { Evidence } from '../evidence/Evidence.tsx';
import {
  authorityOf,
  parseStateOf,
  inventoryOrder,
  outcomeOf,
  ingestBody,
  isSettableRank,
  groupBySeverity,
  describeRule,
  blocksGate,
  type SourceRow,
  type UploadPhase,
  type Finding,
  type RuleDescriptor,
} from './source-model.ts';

const KINDS = ['brd', 'srs', 'sop', 'policy', 'email', 'transcript', 'other'] as const;
const CLASSIFICATIONS = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'] as const;

export function Sources({
  client,
  projectId,
  identity,
  selectedSourceId,
  onOpenSource,
  evidenceEpoch,
}: {
  client: ApiClient;
  projectId: string;
  identity: DevIdentity;
  selectedSourceId?: string;
  onOpenSource: (sourceId: string, filename: string) => void;
  /** Bumped when a citation succeeds, so the evidence list re-reads (U3-b). */
  evidenceEpoch: number;
}): ReactNode {
  const [inventory, setInventory] = useState<Remote<readonly SourceRow[]>>(idle());
  const [upload, setUpload] = useState<UploadPhase>({ kind: 'idle' });
  const [validation, setValidation] = useState<Remote<{ findings: readonly Finding[]; rules: readonly RuleDescriptor[] }>>(idle());
  const [selected, setSelected] = useState<SourceRow | undefined>(undefined);

  const canIngest = mayInvoke(identity, 'ingestSource');
  const canRank = mayInvoke(identity, 'setSourceAuthorityRank');

  const load = useCallback(async (): Promise<void> => {
    setInventory(loading());
    try {
      const list = await client.get(`/projects/${projectId}/sources`, SourceList);
      setInventory(ready(inventoryOrder(list.sources as readonly SourceRow[])));
    } catch (error) {
      setInventory(failed(error as Error));
    }
  }, [client, projectId]);

  // Load once per project, and after every write.
  const loadedFor = useRef<string | undefined>(undefined);
  if (loadedFor.current !== projectId) {
    loadedFor.current = projectId;
    void load();
  }

  const validate = useCallback(async (): Promise<void> => {
    setValidation(loading());
    try {
      const [result, catalogue] = await Promise.all([
        client.post(`/projects/${projectId}/intake/validate`, {}, IntakeValidation),
        client.get(`/projects/${projectId}/intake/rules`, RuleCatalogue),
      ]);
      setValidation(ready({ findings: result.findings as readonly Finding[], rules: catalogue.rules }));
    } catch (error) {
      setValidation(failed(error as Error));
    }
  }, [client, projectId]);

  const rows = inventory.kind === 'ready' ? inventory.value : [];
  const ranked = rows.filter((s) => authorityOf(s).kind === 'ranked').length;
  const unranked = rows.length - ranked;

  return (
    <>
      <header className="workspace__head">
        <div>
          <h1>Sources</h1>
          <p>Every authoritative source for this project: what was ingested, how it parsed, and how it ranks.</p>
        </div>
        <span className="workspace__spacer" />
        {inventory.kind === 'ready' ? (
          <span className="row" data-testid="inventory-counts">
            {/* A count is never shown without its undecided partner (Y8). */}
            <span className="metric" title="Sources with an authority rank a human has set">
              <span className="count">{ranked}</span> ranked
            </span>
            <span className="metric" title="Nobody has decided these yet. Not low authority — undecided.">
              <span className="count">{unranked}</span> unranked
            </span>
          </span>
        ) : null}
      </header>

      <div className="worksplit">
      <div className="worksplit__main">
      <Card
        title="Inventory"
        flush
        actions={
          <Button onClick={() => void load()} small glyph="↻" testId="inventory-refresh">
            Refresh
          </Button>
        }
      >
        {inventory.kind === 'loading' ? (
          <div className="card__pad">
            <Loading what="sources" lines={4} />
          </div>
        ) : null}
        {inventory.kind === 'error' ? (
          <div className="card__pad">
            <Failed error={inventory.error} retry={() => void load()} />
          </div>
        ) : null}
        {inventory.kind === 'ready' && rows.length === 0 ? (
          <div className="card__pad">
            <Empty what="sources" hint="Add one from the panel beside this list to begin." />
          </div>
        ) : null}

        {inventory.kind === 'ready' && rows.length > 0 ? (
          <div data-testid="inventory">
            <DataTable
              caption="Sources, highest authority first; unranked last"
              rows={rows}
              rowKey={(s) => s.id}
              rowTestId={(s) => `source-${s.id}`}
              selectedKey={selectedSourceId ?? selected?.id}
              onSelect={(s) => setSelected(s)}
              columns={[
                {
                  key: 'source',
                  header: 'Source',
                  render: (s) => (
                    <CellStack
                      primary={
                        <button
                          type="button"
                          className="table__link"
                          onClick={() => onOpenSource(s.id, s.filename)}
                          data-testid={`open-${s.id}`}
                          aria-current={s.id === selectedSourceId ? 'true' : undefined}
                        >
                          <span dir={s.direction === 'rtl' ? 'rtl' : 'ltr'} className="inventory__name">
                            {s.filename}
                          </span>
                        </button>
                      }
                      secondary={
                        <>
                          <code className="id">{s.id}</code>
                          {s.textLength === undefined ? null : <> · {s.textLength} code points</>}
                        </>
                      }
                    />
                  ),
                },
                {
                  key: 'kind',
                  header: 'Kind',
                  render: (s) => (
                    <span className="table__meta">
                      {s.kind === undefined ? null : <Chip>{s.kind}</Chip>}
                      {s.classification === undefined ? null : <Chip>{s.classification}</Chip>}
                    </span>
                  ),
                },
                {
                  key: 'direction',
                  header: 'Direction',
                  render: (s) => (
                    <span className="table__meta">
                      {/* The server decides direction; the client never guesses. */}
                      <Chip title="Reading direction, as the server determined it">
                        {(s.direction ?? 'not stated').toUpperCase()}
                      </Chip>
                      {s.primaryLanguage === undefined ? null : <Chip>{s.primaryLanguage}</Chip>}
                    </span>
                  ),
                },
                {
                  key: 'parse',
                  header: 'Parse state',
                  render: (s) => {
                    const parse = parseStateOf(s);
                    return (
                      <span className="table__cellstack">
                        <StateBadge
                          family="lifecycle"
                          value={s.status}
                          subject={s.filename}
                          testId={`parse-${s.id}`}
                        />
                        {/* Distinction 2: the reason stays visible, in place. */}
                        {parse.detail === undefined ? null : (
                          <span className="table__sub" data-testid={`parse-error-${s.id}`}>
                            {parse.detail}
                          </span>
                        )}
                      </span>
                    );
                  },
                },
                {
                  key: 'authority',
                  header: 'Authority',
                  render: (s) => <AuthorityCell source={s} canRank={canRank} onRank={() => setSelected(s)} />,
                },
              ]}
            />
          </div>
        ) : null}
      </Card>

      <Validation state={validation} onRun={() => void validate()} />

      {/*
        U3-b. The evidence inventory sits with the sources it cites, because the
        requirements workspace §3.3 places it on does not exist yet — U3-c. The
        deviation is recorded rather than silently taken.
      */}
      <Evidence
        client={client}
        projectId={projectId}
        epoch={evidenceEpoch}
        filenameFor={(sourceId) => rows.find((s) => s.id === sourceId)?.filename}
      />
      </div>

      <div className="worksplit__side">
      {/*
        The right-hand panel: the selected source when there is one, the upload
        form otherwise. One contextual region, two states — Y6, and the mockup's
        layout without two competing panels.
      */}
      <SourcePanel
        selected={selected}
        canRank={canRank}
        client={client}
        projectId={projectId}
        onRanked={() => void load()}
        onClose={() => setSelected(undefined)}
        onOpen={(s) => onOpenSource(s.id, s.filename)}
        upload={
          <UploadForm
            client={client}
            projectId={projectId}
            enabled={canIngest}
            phase={upload}
            setPhase={setUpload}
            onUploaded={() => void load()}
          />
        }
      />
      </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Authority — distinction 3, and the reason it is its own component
// ---------------------------------------------------------------------------

function AuthorityCell({
  source,
  canRank,
  onRank,
}: {
  source: SourceRow;
  canRank: boolean;
  onRank: () => void;
}): ReactNode {
  const authority = authorityOf(source);

  return (
    <span className="table__cellstack">
      {authority.kind === 'ranked' ? (
        <span className="table__meta">
          <Chip variant="rank" title={authority.label}>
            <span data-testid={`authority-${source.id}`}>{authority.label}</span>
          </Chip>
          <StateBadge family="decidedness" value="decided" subject={source.filename} />
        </span>
      ) : (
        <span className="table__meta">
          {/*
            Unranked is NOT rank zero. It gets the `undecided` token — dashed,
            italic, glyph ○ — and the label says so in words, because "0" in a
            column of numbers reads as "lowest" to everyone.
          */}
          <StateBadge family="decidedness" value="undecided" subject={source.filename} />
          <span className="table__sub" data-testid={`authority-${source.id}`}>
            {authority.label}
          </span>
        </span>
      )}

      {canRank ? (
        <Button onClick={onRank} small glyph="⚖" testId={`rank-${source.id}`}>
          Set authority
        </Button>
      ) : (
        <Reason testId={`rank-denied-${source.id}`}>
          Read-only — ranking needs BusinessAnalyst or ProcessArchitect.
        </Reason>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// The contextual panel: the selected source, or the upload form
// ---------------------------------------------------------------------------

function SourcePanel({
  selected,
  canRank,
  client,
  projectId,
  onRanked,
  onClose,
  onOpen,
  upload,
}: {
  selected: SourceRow | undefined;
  canRank: boolean;
  client: ApiClient;
  projectId: string;
  onRanked: () => void;
  onClose: () => void;
  onOpen: (s: SourceRow) => void;
  upload: ReactNode;
}): ReactNode {
  if (selected === undefined) return <>{upload}</>;

  const authority = authorityOf(selected);
  const parse = parseStateOf(selected);

  return (
    <Card
      title="Selected source"
      testId="source-inspector"
      actions={
        <Button onClick={onClose} tone="subtle" small glyph="✕" testId="source-inspector-close">
          Clear
        </Button>
      }
    >
      <div className="inspector__section">
        <h3 dir={selected.direction === 'rtl' ? 'rtl' : 'ltr'}>{selected.filename}</h3>
        <code className="id">{selected.id}</code>
      </div>

      <div className="inspector__rows">
        <div className="inspector__row">
          <span className="inspector__key">Parse state</span>
          <span className="inspector__value">
            <StateBadge family="lifecycle" value={selected.status} subject={selected.filename} />
            {parse.detail === undefined ? null : <p className="state__hint">{parse.detail}</p>}
          </span>
        </div>
        <div className="inspector__row">
          <span className="inspector__key">Authority</span>
          <span className="inspector__value">
            {authority.kind === 'ranked' ? (
              <Chip variant="rank">{authority.label}</Chip>
            ) : (
              <StateBadge family="decidedness" value="undecided" subject={selected.filename} />
            )}
          </span>
        </div>
        <div className="inspector__row">
          <span className="inspector__key">Classification</span>
          <span className="inspector__value">
            <Chip>{selected.classification ?? 'not stated'}</Chip>
          </span>
        </div>
        <div className="inspector__row">
          <span className="inspector__key">Direction</span>
          <span className="inspector__value">
            <Chip>{(selected.direction ?? 'not stated').toUpperCase()}</Chip>
            {selected.primaryLanguage === undefined ? null : <Chip>{selected.primaryLanguage}</Chip>}
          </span>
        </div>
      </div>

      {canRank ? (
        <RankForm client={client} projectId={projectId} source={selected} onRanked={onRanked} />
      ) : (
        <Reason>Ranking needs BusinessAnalyst or ProcessArchitect. The API refuses regardless of this panel.</Reason>
      )}

      <div className="row">
        <Button onClick={() => onOpen(selected)} glyph="▤" testId={`panel-open-${selected.id}`}>
          Open in viewer
        </Button>
      </div>
    </Card>
  );
}

/**
 * Setting an authority rank — **U2-d, unchanged.**
 *
 * **Rank 0 is not settable**: it means undecided, not lowest. The check is in
 * `source-model.ts` and is tested DOM-free; this form renders its refusal.
 */
function RankForm({
  client,
  projectId,
  source,
  onRanked,
}: {
  client: ApiClient;
  projectId: string;
  source: SourceRow;
  onRanked: () => void;
}): ReactNode {
  const authority = authorityOf(source);
  const [rank, setRank] = useState(authority.kind === 'ranked' ? String(authority.rank) : '1');
  const [justification, setJustification] = useState('');
  const [rankError, setRankError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const save = async (): Promise<void> => {
    setRankError(undefined);
    const value = Number(rank);
    if (!isSettableRank(value)) {
      setRankError('A rank is a whole number from 1 to 100. Rank 0 is not settable: it means undecided.');
      return;
    }
    setSaving(true);
    try {
      await client.put(`/projects/${projectId}/sources/${source.id}/authority`, {
        authorityRank: value,
        ...(justification.trim() === '' ? {} : { justification: justification.trim() }),
      });
      onRanked();
    } catch (error) {
      setRankError((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="form-grid" data-testid={`rank-form-${source.id}`}>
      <h4 className="section-title">Authority ranking</h4>
      <p className="state__hint">
        A human judgement the system cannot infer. Conflict precedence is computed from it (ADR-0012).
      </p>

      <div className="field-row">
        <Field id={`rank-${source.id}`} label="Rank (1–100)" hint="1 is the highest authority.">
          <input
            id={`rank-${source.id}`}
            data-testid={`rank-input-${source.id}`}
            value={rank}
            onChange={(e) => setRank(e.target.value)}
            inputMode="numeric"
          />
        </Field>
        <Field id={`just-${source.id}`} label="Justification" hint="Recorded with the decision.">
          <input
            id={`just-${source.id}`}
            data-testid={`rank-just-${source.id}`}
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
          />
        </Field>
      </div>

      <div className="row">
        <Button onClick={() => void save()} tone="primary" disabled={saving} glyph="✓" testId={`rank-save-${source.id}`}>
          {saving ? 'Saving…' : 'Save rank'}
        </Button>
      </div>

      {rankError === undefined ? null : (
        <p className="outcome outcome--refused" role="alert" data-testid={`rank-error-${source.id}`}>
          <strong>Not saved.</strong> {rankError}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// U2-c — upload
// ---------------------------------------------------------------------------

function UploadForm({
  client,
  projectId,
  enabled,
  phase,
  setPhase,
  onUploaded,
}: {
  client: ApiClient;
  projectId: string;
  enabled: boolean;
  phase: UploadPhase;
  setPhase: (p: UploadPhase) => void;
  onUploaded: () => void;
}): ReactNode {
  const [filename, setFilename] = useState('');
  const [text, setText] = useState('');
  const [kind, setKind] = useState<string>('brd');
  const [classification, setClassification] = useState<string>('INTERNAL');
  const [bytes, setBytes] = useState<Uint8Array | undefined>(undefined);

  const submit = async (): Promise<void> => {
    setPhase({ kind: 'sending' });
    try {
      const body = ingestBody({
        filename,
        ...(bytes === undefined ? { text } : { bytes }),
        kind,
        classification: classification as never,
      });
      const result = await client.post(`/projects/${projectId}/sources`, body, IngestResponse);
      setPhase(outcomeOf(result));
      onUploaded();
    } catch (error) {
      // The SERVER's reason, verbatim. The UI does not paraphrase a refusal.
      setPhase({ kind: 'refused', reason: (error as Error).message });
    }
  };

  return (
    <Card title="Add a source" testId="upload-card">
      <form
        className="form-grid"
        data-testid="upload-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (enabled) void submit();
        }}
      >
        {!enabled ? (
          <Reason testId="upload-denied">
            Your role cannot add sources. <strong>ingestSource</strong> needs Contributor,
            BusinessAnalyst or ProcessArchitect. The API refuses regardless of this control.
          </Reason>
        ) : null}

        <Field id="up-filename" label="Filename" hint="Shown in the inventory and used for provenance.">
          <input
            id="up-filename"
            data-testid="up-filename"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            disabled={!enabled}
            required
          />
        </Field>

        <div className="dropzone">
          <span className="dropzone__glyph" aria-hidden="true">
            ⬆
          </span>
          <Field id="up-file" label="Choose a file">
            <input
              id="up-file"
              data-testid="up-file"
              type="file"
              disabled={!enabled}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file === undefined) {
                  setBytes(undefined);
                  return;
                }
                setBytes(new Uint8Array(await file.arrayBuffer()));
                if (filename === '') setFilename(file.name);
              }}
            />
          </Field>
          <span className="dropzone__hint">
            Text and DOCX are supported. PDF intake is blocked pending ADR-0037.
          </span>
        </div>

        <Field id="up-text" label="…or paste text" hint={bytes === undefined ? undefined : 'Disabled: a file is selected.'}>
          <textarea
            id="up-text"
            data-testid="up-text"
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={!enabled || bytes !== undefined}
          />
        </Field>

        <div className="field-row">
          <Field id="up-kind" label="Kind">
            <select id="up-kind" data-testid="up-kind" value={kind} onChange={(e) => setKind(e.target.value)} disabled={!enabled}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </Field>
          <Field id="up-class" label="Classification" hint="Governs egress (ADR-0021).">
            <select
              id="up-class"
              data-testid="up-class"
              value={classification}
              onChange={(e) => setClassification(e.target.value)}
              disabled={!enabled}
            >
              {CLASSIFICATIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="row">
          <Button
            type="submit"
            tone="primary"
            glyph="⬆"
            testId="up-submit"
            disabled={
              !enabled || phase.kind === 'sending' || filename.trim() === '' || (bytes === undefined && text.trim() === '')
            }
          >
            {phase.kind === 'sending' ? 'Uploading…' : 'Upload source'}
          </Button>
        </div>

        <UploadOutcome phase={phase} />
      </form>
    </Card>
  );
}

/** The outcome, and the reason deduplication is its own case. */
function UploadOutcome({ phase }: { phase: UploadPhase }): ReactNode {
  if (phase.kind === 'idle' || phase.kind === 'sending') return null;

  if (phase.kind === 'deduplicated') {
    return (
      <p className="outcome outcome--dedup" role="status" data-testid="up-deduplicated">
        <span className="state__title">
          <span aria-hidden="true">⧉</span>
          <strong>Already present — nothing was added.</strong>
        </span>
        <span>
          These exact bytes are already stored as <code className="id">{phase.sourceId}</code>. Identical
          content is one source, by design.
        </span>
      </p>
    );
  }
  if (phase.kind === 'created') {
    return (
      <p className="outcome outcome--ok" role="status" data-testid="up-created">
        <span className="state__title">
          <span aria-hidden="true">✓</span>
          <strong>Uploaded.</strong>
        </span>
        <span>
          <code className="id">{phase.sourceId}</code>, {phase.unitCount} unit
          {phase.unitCount === 1 ? '' : 's'}.
        </span>
      </p>
    );
  }
  // The shared refusal state (Y27), not a bespoke one: a refusal is the system
  // working, and it must read the same way everywhere it can happen.
  return <Refused what="this upload" reason={phase.reason} testId="up-refused" />;
}

// ---------------------------------------------------------------------------
// U2-e — L0 validation
// ---------------------------------------------------------------------------

function Validation({
  state,
  onRun,
}: {
  state: Remote<{ findings: readonly Finding[]; rules: readonly RuleDescriptor[] }>;
  onRun: () => void;
}): ReactNode {
  return (
    <Card
      title="Intake validation (L0)"
      testId="validation-card"
      actions={
        <Button onClick={onRun} small glyph="▶" testId="validate-run">
          Run L0 validation
        </Button>
      }
    >
      <p className="state__hint">
        `L0-ING-*` findings block G1 structurally. Severity is the rule catalogue's, carried through
        unaltered (ADR-0026).
      </p>

      {state.kind === 'idle' ? (
        <Empty what="validation run" hint="Run L0 validation to see what the current evidence would report." />
      ) : null}
      {state.kind === 'loading' ? <Loading what="validation" lines={2} /> : null}
      {state.kind === 'error' ? <Failed error={state.error} retry={onRun} /> : null}
      {state.kind === 'ready' && state.value.findings.length === 0 ? (
        <p className="outcome outcome--ok" role="status" data-testid="validation-clean">
          <span className="state__title">
            <span aria-hidden="true">✓</span>
            <strong>No findings.</strong>
          </span>
          <span>Nothing in the current evidence blocks G1 at L0.</span>
        </p>
      ) : null}

      {state.kind === 'ready' && state.value.findings.length > 0 ? (
        <div data-testid="validation-findings" className="findings">
          <p role="status" className="row">
            <span className="count">{state.value.findings.length}</span> finding
            {state.value.findings.length === 1 ? '' : 's'}.{' '}
            {blocksGate(state.value.findings) ? (
              <strong data-testid="validation-blocking">Some of these block G1.</strong>
            ) : (
              <span>None of these blocks G1.</span>
            )}
          </p>

          {groupBySeverity(state.value.findings).map((group) => (
            <div key={group.severity} className={`findings__group findings__group--${group.severity}`}>
              <h4 className="section-title">
                <StateBadge family="severity" value={group.severity} /> {group.findings.length}
              </h4>
              <ul>
                {group.findings.map((f, i) => (
                  <li key={`${f.ruleId}-${i}`} data-testid={`finding-${f.ruleId}`}>
                    <code className="id">{f.ruleId}</code>
                    <span>{describeRule(f.ruleId, state.value.rules) ?? f.message ?? '(no catalogued description)'}</span>
                    {f.entityId === undefined ? null : <Chip>{f.entityId}</Chip>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
