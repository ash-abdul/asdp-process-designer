/**
 * The workspace header — **Y4**.
 *
 * **The selected project is visible at all times.** Every read and every write in
 * this application is project-scoped — H4 made that structural in the database —
 * so a screen that is ambiguous about which project it shows is a screen that can
 * mislead.
 *
 * It is a **header**, not a utility strip: a project mark, an eyebrow label, the
 * name at heading scale, the ASCII key beside it, and the current source as a
 * trail when one is open. Actions sit at the far end.
 *
 * Project names are **bilingual labels** carrying their own language and
 * direction ([ADR-0023](../../../../../docs/adr/ADR-0023-unicode-bilingual-architecture.md)),
 * rendered in **their** direction rather than the interface's. The `key` is an
 * ASCII identifier (**D7**) and stays LTR and monospaced in both layouts.
 */

import type { ReactNode } from 'react';

export function ProjectBar({
  projectName,
  projectDirection,
  projectLanguage,
  projectKey,
  sourceName,
  sourceDirection,
  children,
}: {
  projectName?: string;
  projectDirection?: 'ltr' | 'rtl';
  projectLanguage?: string;
  projectKey?: string;
  sourceName?: string;
  sourceDirection?: 'ltr' | 'rtl';
  children?: ReactNode;
}): ReactNode {
  return (
    <header className="projectbar" data-testid="project-bar">
      <div className="projectbar__context">
        <span className="projectbar__mark" aria-hidden="true">
          ▣
        </span>
        <div className="projectbar__titles">
          <span className="projectbar__eyebrow">Project</span>
          {projectName === undefined ? (
            <span className="projectbar__name" style={{ color: 'var(--asdp-fg-muted)' }}>
              No project selected
            </span>
          ) : (
            <span className="projectbar__trail">
              <span
                className="projectbar__name"
                dir={projectDirection ?? 'ltr'}
                {...(projectLanguage === undefined ? {} : { lang: projectLanguage })}
              >
                {projectName}
              </span>
              {projectKey === undefined ? null : <code className="id">{projectKey}</code>}
              {sourceName === undefined ? null : (
                <>
                  <span className="projectbar__sep" aria-hidden="true">
                    ›
                  </span>
                  <span className="chip" dir={sourceDirection ?? 'ltr'} data-testid="project-bar-source">
                    {sourceName}
                  </span>
                </>
              )}
            </span>
          )}
        </div>
      </div>
      <span className="projectbar__spacer" />
      <div className="projectbar__actions">{children}</div>
    </header>
  );
}
