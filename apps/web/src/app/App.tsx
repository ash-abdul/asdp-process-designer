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
import { createClient } from '../api/client.ts';
import { ProjectList, SourceContent, HighlightList, labelOf } from '../api/contracts.ts';
import { Sources } from '../features/sources/Sources.tsx';
import type { ProjectSummary } from '../api/contracts.ts';
import { devAuthHeaders, type DevIdentity } from '../lib/dev-auth.ts';
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
    async (projectId: string, source: string): Promise<void> => {
      setDocument(loading());
      try {
        // Two reads, in parallel: the text and every highlight on it. With no
        // selector the API returns a range per unit, so one request paints the
        // whole document.
        const [content, highlights] = await Promise.all([
          client.get(`/projects/${projectId}/sources/${source}/content`, SourceContent),
          client.get(`/projects/${projectId}/sources/${source}/highlights`, HighlightList),
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
  const viewingDocument = sourceId !== undefined && project !== undefined;

  const closeDocument = (): void => {
    setSourceId(undefined);
    setSourceName(undefined);
    setDocument(idle());
  };

  return (
    <AppShell
      currentWorkspace="sources"
      regions={{
        projectBar: (
          <ProjectBar
            {...(projectLabel === undefined ? {} : { projectName: projectLabel.text })}
            {...(projectLabel === undefined ? {} : { projectDirection: projectLabel.direction === 'rtl' ? 'rtl' : 'ltr' })}
            {...(project === undefined ? {} : { projectKey: project.key })}
            {...(sourceName === undefined ? {} : { sourceName })}
          >
            {project === undefined ? null : (
              <Button
                onClick={() => {
                  setProject(undefined);
                  closeDocument();
                }}
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
              onBack={closeDocument}
              onRetry={() => void loadDocument(project.id, sourceId)}
            />
          ) : (
            <Sources
              client={client}
              projectId={project.id}
              identity={identity}
              {...(sourceId === undefined ? {} : { selectedSourceId: sourceId })}
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
        ...(viewingDocument
          ? {
              inspector: (
                <DocumentInspector state={document_} sourceName={sourceName ?? ''} onClose={closeDocument} />
              ),
            }
          : {}),

        assistant: (overlay, collapse) => (
          <AssistantDock
            selection={{
              ...(projectLabel === undefined ? {} : { projectLabel: projectLabel.text }),
              ...(project === undefined ? {} : { projectKey: project.key }),
              ...(sourceName === undefined ? {} : { sourceName }),
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
                    >
                      {/* The name is bilingual, so it is rendered in ITS direction. */}
                      <span
                        dir={label.direction === 'rtl' ? 'rtl' : 'ltr'}
                        {...(label.language === undefined ? {} : { lang: label.language })}
                      >
                        {label.text}
                      </span>{' '}
                      <span className="id">{p.key}</span>
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
