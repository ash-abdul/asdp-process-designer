/**
 * S3 — Sources: inventory, upload, authority ranking and L0 validation.
 *
 * U2-b through U2-e. The first screen in this application that **writes**.
 *
 * Every judgement it renders comes from `source-model.ts` or from the server.
 * It decides nothing: not whether a rank is authoritative, not whether a finding
 * blocks, not whether a role may act
 * ([ADR-0039](../../../../../docs/adr/ADR-0039-react-presentation-layer.md) §3, §4).
 */

import { useCallback, useRef, useState, type ReactNode } from 'react';
import type { ApiClient } from '../../api/client.ts';
import { SourceList, IngestResponse, IntakeValidation, RuleCatalogue } from '../../api/contracts.ts';
import { mayInvoke, type DevIdentity } from '../../lib/dev-auth.ts';
import { Loading, Empty, Failed } from '../../components/states.tsx';
import { idle, loading, failed, ready, type Remote } from '../../app/state.ts';
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
}: {
  client: ApiClient;
  projectId: string;
  identity: DevIdentity;
  selectedSourceId?: string;
  onOpenSource: (sourceId: string) => void;
}): ReactNode {
  const [inventory, setInventory] = useState<Remote<readonly SourceRow[]>>(idle());
  const [upload, setUpload] = useState<UploadPhase>({ kind: 'idle' });
  const [validation, setValidation] = useState<Remote<{ findings: readonly Finding[]; rules: readonly RuleDescriptor[] }>>(idle());

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

  return (
    <section className="pane pane--sources" aria-label="Sources">
      <h2>Sources</h2>

      <UploadForm
        client={client}
        projectId={projectId}
        enabled={canIngest}
        phase={upload}
        setPhase={setUpload}
        onUploaded={() => void load()}
      />

      {inventory.kind === 'loading' ? <Loading what="sources" /> : null}
      {inventory.kind === 'error' ? <Failed error={inventory.error} retry={() => void load()} /> : null}
      {inventory.kind === 'ready' && inventory.value.length === 0 ? (
        <Empty what="sources" hint="Upload a document above to begin." />
      ) : null}

      {inventory.kind === 'ready' && inventory.value.length > 0 ? (
        <ul className="inventory" data-testid="inventory">
          {inventory.value.map((s) => (
            <SourceItem
              key={s.id}
              source={s}
              selected={s.id === selectedSourceId}
              canRank={canRank}
              client={client}
              projectId={projectId}
              onOpen={() => onOpenSource(s.id)}
              onRanked={() => void load()}
            />
          ))}
        </ul>
      ) : null}

      <Validation state={validation} onRun={() => void validate()} />
    </section>
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
    <form
      className="upload"
      data-testid="upload-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (enabled) void submit();
      }}
    >
      <h3>Add a source</h3>

      {!enabled ? (
        <p className="state__hint" data-testid="upload-denied">
          Your role cannot add sources. <strong>ingestSource</strong> needs Contributor,
          BusinessAnalyst or ProcessArchitect. The API refuses regardless of this control.
        </p>
      ) : null}

      <label htmlFor="up-filename">Filename</label>
      <input
        id="up-filename"
        data-testid="up-filename"
        value={filename}
        onChange={(e) => setFilename(e.target.value)}
        disabled={!enabled}
        required
      />

      <label htmlFor="up-file">Choose a file (optional)</label>
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

      <label htmlFor="up-text">…or paste text</label>
      <textarea
        id="up-text"
        data-testid="up-text"
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={!enabled || bytes !== undefined}
      />

      <label htmlFor="up-kind">Kind</label>
      <select id="up-kind" data-testid="up-kind" value={kind} onChange={(e) => setKind(e.target.value)} disabled={!enabled}>
        {KINDS.map((k) => (
          <option key={k} value={k}>{k}</option>
        ))}
      </select>

      <label htmlFor="up-class">Classification</label>
      <select
        id="up-class"
        data-testid="up-class"
        value={classification}
        onChange={(e) => setClassification(e.target.value)}
        disabled={!enabled}
      >
        {CLASSIFICATIONS.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>

      <button
        type="submit"
        data-testid="up-submit"
        disabled={!enabled || phase.kind === 'sending' || filename.trim() === '' || (bytes === undefined && text.trim() === '')}
      >
        {phase.kind === 'sending' ? 'Uploading…' : 'Upload'}
      </button>

      <UploadOutcome phase={phase} />
    </form>
  );
}

/** The outcome, and the reason deduplication is its own case. */
function UploadOutcome({ phase }: { phase: UploadPhase }): ReactNode {
  if (phase.kind === 'idle' || phase.kind === 'sending') return null;

  if (phase.kind === 'deduplicated') {
    return (
      <p className="outcome outcome--dedup" role="status" data-testid="up-deduplicated">
        <strong>Already present — nothing was added.</strong> These exact bytes are already stored as{' '}
        <code>{phase.sourceId}</code>. Identical content is one source, by design.
      </p>
    );
  }
  if (phase.kind === 'created') {
    return (
      <p className="outcome outcome--ok" role="status" data-testid="up-created">
        <strong>Uploaded.</strong> <code>{phase.sourceId}</code>, {phase.unitCount} unit
        {phase.unitCount === 1 ? '' : 's'}.
      </p>
    );
  }
  return (
    <p className="outcome outcome--refused" role="alert" data-testid="up-refused">
      <strong>Refused.</strong> {phase.reason}
    </p>
  );
}

// ---------------------------------------------------------------------------
// U2-b / U2-d — one source, its parse state and its authority
// ---------------------------------------------------------------------------

function SourceItem({
  source,
  selected,
  canRank,
  client,
  projectId,
  onOpen,
  onRanked,
}: {
  source: SourceRow;
  selected: boolean;
  canRank: boolean;
  client: ApiClient;
  projectId: string;
  onOpen: () => void;
  onRanked: () => void;
}): ReactNode {
  const authority = authorityOf(source);
  const parse = parseStateOf(source);
  const [ranking, setRanking] = useState(false);
  const [rank, setRank] = useState(authority.kind === 'ranked' ? String(authority.rank) : '1');
  const [justification, setJustification] = useState('');
  const [rankError, setRankError] = useState<string | undefined>(undefined);

  const save = async (): Promise<void> => {
    setRankError(undefined);
    const value = Number(rank);
    if (!isSettableRank(value)) {
      setRankError('A rank is a whole number from 1 to 100. Rank 0 is not settable: it means undecided.');
      return;
    }
    try {
      await client.put(
        `/projects/${projectId}/sources/${source.id}/authority`,
        { authorityRank: value, ...(justification.trim() === '' ? {} : { justification: justification.trim() }) },
      );
      setRanking(false);
      onRanked();
    } catch (error) {
      setRankError((error as Error).message);
    }
  };

  return (
    <li className="inventory__item" data-testid={`source-${source.id}`}>
      <button type="button" onClick={onOpen} aria-current={selected ? 'true' : undefined} data-testid={`open-${source.id}`}>
        <span dir={source.direction === 'rtl' ? 'rtl' : 'ltr'} className="inventory__name">
          {source.filename}
        </span>
      </button>

      <div className="inventory__meta">
        {source.kind === undefined ? null : <span className="chip">{source.kind}</span>}
        {source.classification === undefined ? null : <span className="chip">{source.classification}</span>}
        {source.direction === undefined ? null : <span className="chip">{source.direction.toUpperCase()}</span>}
        <span className={`chip chip--${parse.tone}`} data-testid={`parse-${source.id}`}>
          {parse.label}
        </span>
        {/* Distinction 3: unranked is its own state, not rank zero. */}
        <span
          className={`chip ${authority.kind === 'unranked' ? 'chip--unranked' : 'chip--ranked'}`}
          data-testid={`authority-${source.id}`}
        >
          {authority.label}
        </span>
      </div>

      {/* Distinction 2: a parse failure stays visible, with its reason. */}
      {parse.detail === undefined ? null : (
        <p className="inventory__parse-error" data-testid={`parse-error-${source.id}`}>
          {parse.detail}
        </p>
      )}

      {canRank ? (
        ranking ? (
          <div className="rank-form">
            <label htmlFor={`rank-${source.id}`}>Authority rank (1–100)</label>
            <input
              id={`rank-${source.id}`}
              data-testid={`rank-input-${source.id}`}
              value={rank}
              onChange={(e) => setRank(e.target.value)}
              inputMode="numeric"
            />
            <label htmlFor={`just-${source.id}`}>Justification</label>
            <input
              id={`just-${source.id}`}
              data-testid={`rank-just-${source.id}`}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
            />
            <button type="button" onClick={() => void save()} data-testid={`rank-save-${source.id}`}>
              Save rank
            </button>
            <button type="button" onClick={() => setRanking(false)}>
              Cancel
            </button>
            {rankError === undefined ? null : (
              <p className="outcome outcome--refused" role="alert" data-testid={`rank-error-${source.id}`}>
                {rankError}
              </p>
            )}
          </div>
        ) : (
          <button type="button" onClick={() => setRanking(true)} data-testid={`rank-${source.id}`}>
            Set authority
          </button>
        )
      ) : (
        <p className="state__hint" data-testid={`rank-denied-${source.id}`}>
          Ranking needs BusinessAnalyst or ProcessArchitect.
        </p>
      )}
    </li>
  );
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
    <section className="validation" aria-label="Intake validation">
      <h3>Intake validation</h3>
      <button type="button" onClick={onRun} data-testid="validate-run">
        Run L0 validation
      </button>

      {state.kind === 'loading' ? <Loading what="validation" /> : null}
      {state.kind === 'error' ? <Failed error={state.error} retry={onRun} /> : null}
      {state.kind === 'ready' && state.value.findings.length === 0 ? (
        <p className="outcome outcome--ok" role="status" data-testid="validation-clean">
          <strong>No findings.</strong> Nothing in the current evidence blocks G1 at L0.
        </p>
      ) : null}

      {state.kind === 'ready' && state.value.findings.length > 0 ? (
        <div data-testid="validation-findings">
          <p role="status">
            {state.value.findings.length} finding{state.value.findings.length === 1 ? '' : 's'}.{' '}
            {blocksGate(state.value.findings) ? (
              <strong data-testid="validation-blocking">Some of these block G1.</strong>
            ) : (
              'None of these blocks G1.'
            )}
          </p>
          {groupBySeverity(state.value.findings).map((group) => (
            <div key={group.severity} className={`findings findings--${group.severity}`}>
              {/* Severity is the rule catalogue's (ADR-0026), never the UI's. */}
              <h4>
                {group.severity} ({group.findings.length})
              </h4>
              <ul>
                {group.findings.map((f, i) => (
                  <li key={`${f.ruleId}-${i}`} data-testid={`finding-${f.ruleId}`}>
                    <code>{f.ruleId}</code>{' '}
                    {describeRule(f.ruleId, state.value.rules) ?? f.message ?? '(no catalogued description)'}
                    {f.entityId === undefined ? null : <span className="chip">{f.entityId}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
