/**
 * The application — U1's and U2's journey, inside the approved shell.
 *
 * **D-U2.5 is presentation-only.** This file was restructured to compose
 * `AppShell`, and the behaviour it wires is unchanged: development sign-in →
 * project → sources (inventory, upload, authority, L0 validation) → the source
 * viewer with server-computed highlights. **No new capability, no new request,
 * no new decision.** Every list, document and highlight still comes from the
 * API, and the API is still the only authority on who may do what
 * ([ADR-0039](../../../../docs/adr/ADR-0039-react-presentation-layer.md) §3–§4).
 *
 * What is genuinely new is **where things are**: a persistent rail, a project
 * context bar, a working surface, a contextual inspector, a status strip, and a
 * collapsed **Ask ASDP** dock that cannot do anything (H3).
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { createClient, type ApiClient } from '../api/client.ts';
import { ProjectList, SourceContent, HighlightList, labelOf } from '../api/contracts.ts';
import { GateList, InferenceConfirmed, ReviewedRequirement } from '../api/contracts.ts';
import { Sources } from '../features/sources/Sources.tsx';
import { Requirements, useRequirements } from '../features/requirements/Requirements.tsx';
import { RequirementInspector } from '../features/requirements/RequirementInspector.tsx';
import type { RequirementRow } from '../features/requirements/requirement-model.ts';
import {
  g1StatusOf,
  observeG1,
  outcomeWording,
  reviewRefusal,
  type GateStatusValue,
  type ReviewAction,
  type ReviewPhase,
} from '../features/requirements/review-model.ts';
import type { ProjectSummary } from '../api/contracts.ts';
import { devAuthHeaders, mayInvoke, type DevIdentity } from '../lib/dev-auth.ts';
import { DevSignIn } from './DevSignIn.tsx';
import { DocumentView, DocumentInspector } from '../source-viewer/DocumentView.tsx';
import { Loading, Empty, Failed } from '../components/states.tsx';
import { idle, loading, failed, ready, type Remote } from './state.ts';
import { AppShell } from '../components/shell/AppShell.tsx';
import { ProjectBar } from '../components/shell/ProjectBar.tsx';
import { AssistantDock, AssistantTab } from '../assistant/AssistantDock.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Card } from '../components/ui/Card.tsx';
import { DataTable, CellStack } from '../components/ui/DataTable.tsx';
import { Chip } from '../components/ui/Badge.tsx';

/** Same-origin: Vite proxies `/api` to the service, so there is no CORS to loosen. */
const API_BASE = '/api';

/**
 * G1's current status, or `undefined` when it cannot be established — **U3-d**.
 *
 * A failed or unreadable gate list is **not** an error the reviewer needs to see:
 * the gate is reported *alongside* a decision, it does not gate one. Swallowing
 * it here is deliberate, and it is safe in the one way that matters — an unknown
 * status can never satisfy `approved → reopened`, so `observeG1` refuses to claim
 * causation rather than guessing at it.
 */
/**
 * The rendered fields of a requirement, for deciding whether a re-read changed it.
 *
 * Every field here is one the inspector actually shows, so the comparison tracks
 * *"would the reviewer see something different"* rather than object identity.
 * Deliberately not a deep compare: a signature that included everything would
 * replace the row on any backend addition, and one that included nothing would
 * never replace it at all — which was the defect.
 */
function rowSignature(row: RequirementRow): string {
  return [
    row.status,
    row.version,
    row.text,
    row.humanConfirmationRequired,
    row.inferenceConfirmedBy ?? '',
    row.changeReason ?? '',
    row.evidence.length,
  ].join('|');
}

async function readG1(client: ApiClient, projectId: string): Promise<GateStatusValue | undefined> {
  try {
    return g1StatusOf(await client.get(`/projects/${projectId}/gates`, GateList));
  } catch {
    return undefined;
  }
}

export function App({ origin }: { origin: string }): ReactNode {
  const [identity, setIdentity] = useState<DevIdentity | undefined>(undefined);

  if (identity === undefined) {
    return <DevSignIn origin={origin} onSignIn={setIdentity} />;
  }
  return <Workspace identity={identity} origin={origin} onSignOut={() => setIdentity(undefined)} />;
}

interface DocumentPayload {
  readonly content: unknown;
  readonly highlights: unknown;
}

function Workspace({
  identity,
  origin,
  onSignOut,
}: {
  identity: DevIdentity;
  origin: string;
  onSignOut: () => void;
}): ReactNode {
  const client = createClient({
    baseUrl: API_BASE,
    // Per request, so signing out takes effect immediately. Throws off localhost.
    headers: () => devAuthHeaders(identity, origin),
  });

  const [projects, setProjects] = useState<Remote<readonly ProjectSummary[]>>(idle());
  const [project, setProject] = useState<ProjectSummary | undefined>(undefined);
  const [sourceId, setSourceId] = useState<string | undefined>(undefined);
  const [sourceName, setSourceName] = useState<string | undefined>(undefined);
  const [document_, setDocument] = useState<Remote<DocumentPayload>>(idle());
  /**
   * Bumped by a successful citation — **U3-b**.
   *
   * W4: re-read after every mutation, never an optimistic row. It lives here
   * rather than in either screen because the write happens in the document view
   * and the list that must change is in the sources workspace.
   */
  const [evidenceEpoch, setEvidenceEpoch] = useState(0);
  /** Set when the document is opened by FOLLOWING a citation — U3-c. */
  const [evidenceId, setEvidenceId] = useState<string | undefined>(undefined);
  /** Which workspace the rail has the user in — **U3-c**, the first slice with two. */
  const [workspace, setWorkspace] = useState<string>('sources');
  /** The requirement whose detail the inspector holds. One entity, per Y6. */
  const [requirement, setRequirement] = useState<RequirementRow | undefined>(undefined);

  // Read only while the requirements workspace is open. The hook is called
  // unconditionally so hook order stays stable; `enabled` decides whether it
  // reaches the network.
  const requirements = useRequirements(client, project?.id, workspace === 'requirements');

  /**
   * The review phase and the G1 observation — **U3-d**.
   *
   * Held here, in the composition root, rather than in `Requirements.tsx`. That
   * is deliberate: `Requirements.tsx` is the **list**, and keeping every mention
   * of a review route out of it is the cheapest possible proof of **Z6-a** —
   * *no decision from a list row alone*. A structural test asserts the absence,
   * and a hook living there would have made that assertion untrue while changing
   * nothing about the user-visible behaviour.
   */
  const [reviewPhase, setReviewPhase] = useState<ReviewPhase>({ kind: 'idle' });
  const [g1Message, setG1Message] = useState<string | undefined>(undefined);

  /**
   * Re-sync the OPEN requirement from the reloaded list — **a defect fix**.
   *
   * **Found by the U3-d browser tests, and it was a real bug.** `submitDecision`
   * calls `requirements.reload()`, which refreshes the list — but the inspector
   * renders a `RequirementRow` held in state, captured when the row was selected.
   * So after rejecting a requirement the list showed `rejected` and **the
   * inspector, which is what the reviewer is actually looking at, still showed
   * `in review`**. The decision had been recorded correctly and the screen denied
   * it.
   *
   * Re-derived here rather than patched from the mutation response, because the
   * response is not enough: `confirm-inference` returns only
   * `{requirementId, confirmed}`, so a response-patching fix would have left the
   * confirmation invisible — the second defect this slice found.
   *
   * The signature comparison is what makes this settle. `find` returns a new
   * object on every fetch, so replacing on identity would set state on every
   * render; replacing only when a rendered field actually differs converges after
   * one pass.
   *
   * The held row is kept while the list is reloading, deliberately: deriving the
   * inspector's row purely from the list would unmount it mid-reload and take the
   * outcome message with it.
   */
  useEffect(() => {
    if (requirements.data.kind !== 'ready' || requirement === undefined) return;
    const fresh = requirements.data.value.rows.find((r) => r.id === requirement.id);
    if (fresh !== undefined && rowSignature(fresh) !== rowSignature(requirement)) {
      setRequirement(fresh);
    }
  }, [requirements.data, requirement]);

  /**
   * Record one decision on one requirement.
   *
   * **One act, one requirement.** `requirementId` is a single string and
   * `action` is a single action; there is no array parameter, no loop, and no
   * batching layer anywhere on this path. That is limitation 70's only
   * structural mitigation, and it is held by the shape of this function.
   *
   * **The G1 reopen surface.** `mutate()` in the command layer reconciles G1
   * inside every workspace mutation and discards whether it reopened, so the
   * response cannot carry the fact. G1 is therefore read **before** and
   * **after** the mutation and compared — what the approved boundary specifies
   * (**Z6**, §5.1), needing no API change. Causation is claimed only for an
   * `approved → reopened` transition observed across this action.
   */
  const submitDecision = useCallback(
    async (
      projectId: string,
      requirementId: string,
      action: ReviewAction | 'confirm_inference',
    ): Promise<void> => {
      setReviewPhase({ kind: 'sending', requirementId, action });
      setG1Message(undefined);

      // Read G1 first. A failure here must not block the decision — the gate is
      // reported alongside the outcome, it does not gate it — so it degrades to
      // "unknown before", which `observeG1` then refuses to claim causation from.
      const before = await readG1(client, projectId);

      try {
        let status: string;
        if (action === 'confirm_inference') {
          await client.post(
            `/projects/${projectId}/requirements/${requirementId}/confirm-inference`,
            {},
            InferenceConfirmed,
          );
          // The confirm route returns `{requirementId, confirmed}` and not the
          // requirement, so the status is not restated here — it is unchanged by
          // this act, and inventing one would be reporting a change that did not
          // happen.
          status = 'confirmed';
          setReviewPhase({
            kind: 'applied',
            requirementId,
            action,
            status,
            message: 'confirmed as a human-owned inference. Its status is unchanged by this act.',
          });
        } else {
          const updated = await client.post(
            `/projects/${projectId}/requirements/${requirementId}/review`,
            { action },
            ReviewedRequirement,
          );
          // The wording comes from the status the SERVER returned, never from
          // the action this client sent.
          setReviewPhase({
            kind: 'applied',
            requirementId,
            action,
            status: updated.status,
            message: outcomeWording(updated.status),
          });
        }

        const after = await readG1(client, projectId);
        setG1Message(observeG1(before, after).message);

        // W4: re-read after every mutation, never an optimistic row.
        requirements.reload();
      } catch (error) {
        setReviewPhase(reviewRefusal(requirementId, action, error));
      }
      // The client is rebuilt each render; the identity is what actually matters.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [identity.subject, identity.roles.join(','), requirements.reload],
  );

  const loadProjects = useCallback(async (): Promise<void> => {
    setProjects(loading());
    try {
      setProjects(ready(await client.get('/projects', ProjectList)));
    } catch (error) {
      setProjects(failed(error as Error));
    }
    // The client is rebuilt each render; the identity is what actually matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.subject, identity.roles.join(',')]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const loadDocument = useCallback(
    async (projectId: string, source: string, evidenceId?: string): Promise<void> => {
      setDocument(loading());
      try {
        // Two reads, in parallel: the text and every highlight on it. With no
        // selector the API returns a range per unit, so one request paints the
        // whole document.
        //
        // **U3-c** passes `evidenceId`, and the server then returns the ranges
        // for that one citation. The client still paints only what it is given:
        // it does not filter, and it never searches the text for a quote.
        const highlightPath =
          evidenceId === undefined
            ? `/projects/${projectId}/sources/${source}/highlights`
            : `/projects/${projectId}/sources/${source}/highlights?evidenceId=${encodeURIComponent(evidenceId)}`;
        const [content, highlights] = await Promise.all([
          client.get(`/projects/${projectId}/sources/${source}/content`, SourceContent),
          client.get(highlightPath, HighlightList),
        ]);
        setDocument(ready({ content, highlights }));
      } catch (error) {
        setDocument(failed(error as Error));
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [identity.subject, identity.roles.join(',')],
  );

  const projectLabel = project === undefined ? undefined : labelOf(project);
  /** Captured once: TypeScript loses the narrowing inside the nested region branches. */
  const projectId = project?.id ?? '';
  /**
   * The label for the open document, preferring the **document's own filename**
   * once it has loaded — U3-c amendment, finding 3.
   *
   * `sourceName` is only a placeholder when a citation is followed, because the
   * filename is not known until `GET …/content` returns. Letting the breadcrumb
   * keep the placeholder would leave *"the cited source"* in the chrome beside a
   * heading that names the file.
   */
  const documentLabel =
    document_.kind === 'ready'
      ? ((document_.value.content as { source?: { filename?: string } }).source?.filename ?? sourceName)
      : sourceName;
  const viewingDocument = sourceId !== undefined && project !== undefined;

  const closeDocument = (): void => {
    setSourceId(undefined);
    setSourceName(undefined);
    setEvidenceId(undefined);
    setDocument(idle());
  };

  /**
   * Leaving a project clears everything scoped to it — **U3-c amendment**.
   *
   * The selected requirement was not cleared, so after "Change project" the
   * inspector kept showing a requirement from the project the user had just
   * left, beside the project list. Found by visual review. A requirement is
   * scoped to a project by construction — its identity is `(projectId, id)`
   * since H4 — so it must not outlive the project selection.
   */
  const leaveProject = (): void => {
    setProject(undefined);
    setRequirement(undefined);
    clearReview();
    closeDocument();
  };

  /**
   * Drop any decision outcome — **U3-d**.
   *
   * An outcome belongs to the requirement it was recorded against. Left standing
   * across a change of selection, project or workspace it would sit under a
   * heading it does not describe, which is the U3-c *"a requirement outlived its
   * project"* defect in a new place (§21.7.7 finding 2). The inspector also
   * checks the id before rendering; this is the other half, so a stale outcome
   * cannot survive at all rather than merely being hidden.
   */
  function clearReview(): void {
    setReviewPhase({ kind: 'idle' });
    setG1Message(undefined);
  }

  /** Select a requirement, dropping the previous one's outcome with it. */
  function selectRequirement(row: RequirementRow | undefined): void {
    setRequirement(row);
    clearReview();
  }

  return (
    <AppShell
      currentWorkspace={workspace}
      onNavigate={(id) => {
        setWorkspace(id);
        // Leaving a workspace closes the document it had open, so the next one
        // does not inherit a reading pane that belongs to the last.
        closeDocument();
        if (id !== 'requirements') selectRequirement(undefined);
      }}
      regions={{
        projectBar: (
          <ProjectBar
            {...(projectLabel === undefined ? {} : { projectName: projectLabel.text })}
            {...(projectLabel === undefined ? {} : { projectDirection: projectLabel.direction === 'rtl' ? 'rtl' : 'ltr' })}
            {...(projectLabel?.language === undefined ? {} : { projectLanguage: projectLabel.language })}
            {...(project === undefined ? {} : { projectKey: project.key })}
            {...(documentLabel === undefined ? {} : { sourceName: documentLabel })}
          >
            {project === undefined ? null : (
              <Button
                onClick={leaveProject}
                small
                glyph="⇄"
                testId="change-project"
              >
                Change project
              </Button>
            )}
          </ProjectBar>
        ),

        workspace:
          project === undefined ? (
            <ProjectChooser state={projects} onRetry={() => void loadProjects()} onChoose={setProject} />
          ) : viewingDocument ? (
            <DocumentView
              state={document_}
              sourceName={sourceName ?? ''}
              backLabel={workspace === 'requirements' ? 'Back to requirements' : 'Back to sources'}
              {...(evidenceId === undefined ? {} : { evidenceId })}
              onBack={closeDocument}
              onRetry={() => void loadDocument(project.id, sourceId)}
            />
          ) : workspace === 'requirements' ? (
            <Requirements
              data={requirements.data}
              identity={identity}
              {...(requirement === undefined ? {} : { selectedId: requirement.id })}
              onSelect={selectRequirement}
              onReload={requirements.reload}
            />
          ) : (
            <Sources
              client={client}
              projectId={project.id}
              identity={identity}
              {...(sourceId === undefined ? {} : { selectedSourceId: sourceId })}
              evidenceEpoch={evidenceEpoch}
              onOpenSource={(id, filename) => {
                setSourceId(id);
                setSourceName(filename);
                void loadDocument(project.id, id);
              }}
            />
          ),

        // The shell's inspector belongs to the document view. The Sources
        // screen carries its own side panel, because that panel owns write
        // state (upload, ranking) that belongs with the screen, not the shell.
        /*
          **Y11, and the reason the requirement wins here.** When a chip is
          followed, the inspector keeps the REQUIREMENT rather than switching to
          the document: the whole point of the evidence pane is that the
          proposition and the passage it rests on are on screen together.
          *"Provenance that requires navigating away does not get checked."*
        */
        ...(workspace === 'requirements' && requirement !== undefined
          ? {
              inspector: (
                <RequirementInspector
                  row={requirement}
                  sourceOf={
                    requirements.data.kind === 'ready'
                      ? requirements.data.value.sourceOf
                      : () => undefined
                  }
                  onFollowEvidence={(evidenceItemId, evidenceSourceId) => {
                    setSourceId(evidenceSourceId);
                    // Only a fallback: the heading uses the loaded document's own
                    // filename once it arrives.
                    setSourceName('the cited source');
                    setEvidenceId(evidenceItemId);
                    void loadDocument(projectId, evidenceSourceId, evidenceItemId);
                  }}
                  onClose={() => selectRequirement(undefined)}
                  review={{
                    phase: reviewPhase,
                    // Affordance only — the API refuses independently (ADR-0027,
                    // F-U1-b). Disabling a control is a courtesy, never a control.
                    mayReview: mayInvoke(identity, 'reviewRequirement'),
                    mayConfirm: mayInvoke(identity, 'confirmInference'),
                    onReview: (action) => {
                      void submitDecision(projectId, requirement.id, action);
                    },
                    onConfirmInference: () => {
                      void submitDecision(projectId, requirement.id, 'confirm_inference');
                    },
                    ...(g1Message === undefined ? {} : { g1Message }),
                  }}
                />
              ),
            }
          : viewingDocument
            ? {
                inspector: (
                  <DocumentInspector
                    state={document_}
                    sourceName={sourceName ?? ''}
                    sourceId={sourceId}
                    client={client}
                    projectId={projectId}
                    identity={identity}
                    onClose={closeDocument}
                    onEvidenceRecorded={() => setEvidenceEpoch((n) => n + 1)}
                  />
                ),
              }
            : {}),

        assistant: (overlay, collapse) => (
          <AssistantDock
            selection={{
              ...(projectLabel === undefined ? {} : { projectLabel: projectLabel.text }),
              ...(project === undefined ? {} : { projectKey: project.key }),
              ...(sourceName === undefined ? {} : { sourceName }),
              ...(requirement === undefined ? {} : { requirementId: requirement.id }),
            }}
            overlay={overlay}
            onCollapse={collapse}
          />
        ),
        assistantTab: (expand) => <AssistantTab onExpand={expand} />,

        statusItems: [
          { glyph: '⚑', label: 'Environment: development', testId: 'status-env' },
          {
            glyph: '⚿',
            label: (
              <>
                Auth: <strong>development headers</strong> — localhost only
              </>
            ),
            testId: 'status-auth',
          },
          { glyph: '☖', label: project === undefined ? 'No project' : `Project: ${project.key}`, testId: 'status-project' },
          { glyph: '✦', label: 'Ask ASDP: unavailable (H3)', testId: 'status-assistant' },
        ],

        railFooter: (
          <>
            <div className="rail__identity" data-testid="rail-identity">
              <span className="rail__avatar" aria-hidden="true">
                {identity.subject.slice(0, 2).toUpperCase()}
              </span>
              <span className="rail__label">
                <span className="table__primary">{identity.subject}</span>
                <span className="table__sub">{identity.roles.join(', ')}</span>
              </span>
            </div>
            {/* F-U1-b: never subtle, in any theme. */}
            {/*
              F-U1-b, compact but unmissable. The full statement is on the sign-in
              screen and in the status strip; both are always reachable, and the
              browser suite asserts all three.
            */}
            <p className="dev-badge" role="note" data-testid="dev-badge">
              <span aria-hidden="true">⚠</span>
              <span>
                <strong>Development authentication</strong> — self-asserted roles. Never production.
              </span>
            </p>
            <Button onClick={onSignOut} tone="subtle" small glyph="⇦" testId="sign-out">
              Sign out
            </Button>
          </>
        ),
      }}
    />
  );
}

/**
 * Choosing a project.
 *
 * A table, not a sidebar list: the project is the scope of everything that
 * follows (**Y4**), and choosing it deserves the working surface. Names are
 * bilingual labels rendered in **their** direction; keys are ASCII identifiers
 * and stay LTR and monospaced.
 */
function ProjectChooser({
  state,
  onRetry,
  onChoose,
}: {
  state: Remote<readonly ProjectSummary[]>;
  onRetry: () => void;
  onChoose: (p: ProjectSummary) => void;
}): ReactNode {
  return (
    <>
      <header className="workspace__head">
        <div>
          <h1>Projects</h1>
          <p>Every read and every write is scoped to one project. Choose the one you are working in.</p>
        </div>
      </header>

      <Card title="Projects" flush>
        {state.kind === 'loading' ? (
          <div className="card__pad">
            <Loading what="projects" />
          </div>
        ) : null}
        {state.kind === 'error' ? (
          <div className="card__pad">
            <Failed error={state.error} retry={onRetry} />
          </div>
        ) : null}
        {state.kind === 'ready' && state.value.length === 0 ? (
          <div className="card__pad">
            <Empty
              what="projects"
              hint="Create one through the API to begin. Creating projects is not part of this UI."
            />
          </div>
        ) : null}
        {state.kind === 'ready' && state.value.length > 0 ? (
          <DataTable
            caption="Projects in this database"
            rows={state.value}
            rowKey={(p) => p.id}
            rowTestId={(p) => `project-${p.id}`}
            columns={[
              {
                key: 'name',
                header: 'Project',
                render: (p) => {
                  const label = labelOf(p);
                  return (
                    <button
                      type="button"
                      className="table__link"
                      onClick={() => onChoose(p)}
                      data-testid={`open-project-${p.id}`}
                      /*
                       * The key is in the ACCESSIBLE NAME but not in the visible
                       * text: it has its own column, and repeating it inline ran
                       * the two together as one string. It must stay in the name —
                       * a project is identified by its key, and that is how both a
                       * screen-reader user and the browser suite find one. Removing
                       * it from the name broke ten tests, which is the correct
                       * response to removing an identifier people navigate by.
                       */
                      aria-label={`${label.text} — ${p.key}`}
                    >
                      {/* The name is bilingual, so it is rendered in ITS direction. */}
                      <span
                        dir={label.direction === 'rtl' ? 'rtl' : 'ltr'}
                        {...(label.language === undefined ? {} : { lang: label.language })}
                      >
                        {label.text}
                      </span>
                    </button>
                  );
                },
              },
              {
                key: 'key',
                header: 'Key',
                render: (p) => (
                  <CellStack primary={<code className="id">{p.key}</code>} secondary="ASCII identifier (D7)" />
                ),
              },
              {
                key: 'created',
                header: 'Created',
                render: (p) =>
                  p.createdAt === undefined ? (
                    // Absent, not zero. The API did not say, so neither does this.
                    <Chip title="The API did not return a creation time for this project">not stated</Chip>
                  ) : (
                    <span className="table__num">{p.createdAt.slice(0, 10)}</span>
                  ),
              },
            ]}
          />
        ) : null}
      </Card>
    </>
  );
}
