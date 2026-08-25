/**
 * The application shell and U1's journey.
 *
 * **Development sign-in → project → source → viewer with highlights.**
 * Nothing else: U2–U5 are not authorised.
 *
 * The shell holds the identity, the API client and the current selection. It
 * decides nothing about the domain — every list, every document and every
 * highlight comes from the API, and the API is also the only authority on who
 * may do what ([ADR-0027](../../../../docs/adr/ADR-0027-abstract-oidc-identity.md),
 * [ADR-0039](../../../../docs/adr/ADR-0039-react-presentation-layer.md) §4).
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { createClient } from '../api/client.ts';
import { ProjectList, SourceList, SourceContent, HighlightList, labelOf } from '../api/contracts.ts';
import type { ProjectSummary, SourceSummary } from '../api/contracts.ts';
import { devAuthHeaders, type DevIdentity } from '../lib/dev-auth.ts';
import { DevSignIn } from './DevSignIn.tsx';
import { SourceViewer } from '../source-viewer/SourceViewer.tsx';
import { Loading, Empty, Failed } from '../components/states.tsx';
import { idle, loading, failed, ready, type Remote } from './state.ts';

/** Same-origin: Vite proxies `/api` to the service, so there is no CORS to loosen. */
const API_BASE = '/api';

export function App({ origin }: { origin: string }): ReactNode {
  const [identity, setIdentity] = useState<DevIdentity | undefined>(undefined);

  if (identity === undefined) {
    return <DevSignIn origin={origin} onSignIn={setIdentity} />;
  }
  return <Workspace identity={identity} origin={origin} onSignOut={() => setIdentity(undefined)} />;
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
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [sources, setSources] = useState<Remote<readonly SourceSummary[]>>(idle());
  const [sourceId, setSourceId] = useState<string | undefined>(undefined);
  const [document_, setDocument] = useState<Remote<{ content: unknown; highlights: unknown }>>(idle());

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

  const loadSources = useCallback(
    async (project: string): Promise<void> => {
      setSources(loading());
      setSourceId(undefined);
      setDocument(idle());
      try {
        const list = await client.get(`/projects/${project}/sources`, SourceList);
        setSources(ready(list.sources));
      } catch (error) {
        setSources(failed(error as Error));
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [identity.subject, identity.roles.join(',')],
  );

  const loadDocument = useCallback(
    async (project: string, source: string): Promise<void> => {
      setDocument(loading());
      try {
        // Two reads, in parallel: the text and every highlight on it. With no
        // selector the API returns a range per unit, so one request paints the
        // whole document.
        const [content, highlights] = await Promise.all([
          client.get(`/projects/${project}/sources/${source}/content`, SourceContent),
          client.get(`/projects/${project}/sources/${source}/highlights`, HighlightList),
        ]);
        setDocument(ready({ content, highlights }));
      } catch (error) {
        setDocument(failed(error as Error));
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [identity.subject, identity.roles.join(',')],
  );

  return (
    <div className="shell">
      <a className="skip" href="#main">
        Skip to content
      </a>

      <header className="shell__header">
        <h1 className="shell__title">ASDP Process Designer</h1>
        <p className="dev-badge" role="note">
          <strong>Development authentication</strong> — {identity.subject} ·{' '}
          {identity.roles.join(', ')}
        </p>
        <button type="button" onClick={onSignOut}>
          Sign out
        </button>
      </header>

      <main id="main" className="shell__main">
        <nav className="pane pane--projects" aria-label="Projects">
          <h2>Projects</h2>
          {projects.kind === 'loading' ? <Loading what="projects" /> : null}
          {projects.kind === 'error' ? <Failed error={projects.error} retry={() => void loadProjects()} /> : null}
          {projects.kind === 'ready' && projects.value.length === 0 ? (
            <Empty what="projects" hint="Create one through the API to begin; U1 does not create projects." />
          ) : null}
          {projects.kind === 'ready' && projects.value.length > 0 ? (
            <ul>
              {projects.value.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-current={p.id === projectId ? 'true' : undefined}
                    onClick={() => {
                      setProjectId(p.id);
                      void loadSources(p.id);
                    }}
                  >
                    {/* The name is bilingual, so it is rendered in ITS direction. */}
                    <span dir={labelOf(p).direction === 'rtl' ? 'rtl' : 'ltr'}>{labelOf(p).text}</span>
                    <span className="chip">{p.key}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </nav>

        <nav className="pane pane--sources" aria-label="Sources">
          <h2>Sources</h2>
          {projectId === undefined ? (
            <Empty what="project selected" hint="Choose a project to see its sources." />
          ) : null}
          {sources.kind === 'loading' ? <Loading what="sources" /> : null}
          {sources.kind === 'error' ? (
            <Failed error={sources.error} retry={() => void loadSources(projectId as string)} />
          ) : null}
          {sources.kind === 'ready' && sources.value.length === 0 ? (
            <Empty what="sources" hint="Ingest a document through the API; U1 does not upload." />
          ) : null}
          {sources.kind === 'ready' && sources.value.length > 0 ? (
            <ul>
              {sources.value.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-current={s.id === sourceId ? 'true' : undefined}
                    onClick={() => {
                      setSourceId(s.id);
                      void loadDocument(projectId as string, s.id);
                    }}
                  >
                    <span dir={s.direction === 'rtl' ? 'rtl' : 'ltr'}>{s.filename}</span>
                    {s.direction === undefined ? null : (
                      <span className="chip">{s.direction.toUpperCase()}</span>
                    )}
                    {s.status === undefined ? null : <span className="chip">{s.status}</span>}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </nav>

        <section className="pane pane--document" aria-label="Document">
          <h2>Document</h2>
          {sourceId === undefined ? (
            <Empty what="source selected" hint="Choose a source to read it with its evidence highlighted." />
          ) : null}
          {document_.kind === 'loading' ? <Loading what="the document" /> : null}
          {document_.kind === 'error' ? (
            <Failed
              error={document_.error}
              retry={() => void loadDocument(projectId as string, sourceId as string)}
            />
          ) : null}
          {document_.kind === 'ready' ? <Document value={document_.value} /> : null}
        </section>
      </main>
    </div>
  );
}

/** Narrow the validated payloads and hand them to the viewer. */
function Document({ value }: { value: { content: unknown; highlights: unknown } }): ReactNode {
  const content = value.content as { source: { direction?: string; primaryLanguage?: string }; text: string };
  const highlights = value.highlights as { ranges: readonly never[] };
  const direction = content.source.direction === 'rtl' ? 'rtl' : content.source.direction === 'neutral' ? 'neutral' : 'ltr';

  if (content.text.length === 0) {
    return <Empty what="text" hint="This source has no extracted text — it may have failed to parse." />;
  }

  return (
    <SourceViewer
      text={content.text}
      ranges={highlights.ranges}
      documentDirection={direction}
      {...(content.source.primaryLanguage === undefined ? {} : { language: content.source.primaryLanguage })}
    />
  );
}
