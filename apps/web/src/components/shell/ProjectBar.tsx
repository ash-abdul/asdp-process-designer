/**
 * The project context bar — **Y4**.
 *
 * **The selected project is visible at all times.** Every read and every write
 * in this application is project-scoped — H4 made that structural in the
 * database — so a screen that is ambiguous about which project it shows is a
 * screen that can mislead.
 *
 * Project names are **bilingual labels** carrying their own language and
 * direction ([ADR-0023](../../../../../docs/adr/ADR-0023-unicode-bilingual-architecture.md)),
 * and they are rendered in **their** direction, not the interface's. The `key` is
 * an ASCII identifier (**D7**) and stays LTR and monospaced in both layouts.
 */

import type { ReactNode } from 'react';

export function ProjectBar({
  projectName,
  projectDirection,
  projectKey,
  sourceName,
  sourceDirection,
  children,
}: {
  projectName?: string;
  projectDirection?: 'ltr' | 'rtl';
  projectKey?: string;
  sourceName?: string;
  sourceDirection?: 'ltr' | 'rtl';
  children?: ReactNode;
}): ReactNode {
  return (
    <div className="projectbar" data-testid="project-bar">
      <span className="projectbar__context">
        <span className="projectbar__glyph" aria-hidden="true">
          ▣
        </span>
        {projectName === undefined ? (
          <span className="table__sub">No project selected</span>
        ) : (
          <>
            <span className="projectbar__name" dir={projectDirection ?? 'ltr'}>
              {projectName}
            </span>
            {projectKey === undefined ? null : <code className="id">{projectKey}</code>}
          </>
        )}
        {sourceName === undefined ? null : (
          <>
            <span className="projectbar__sep" aria-hidden="true">
              /
            </span>
            <span dir={sourceDirection ?? 'ltr'} data-testid="project-bar-source">
              {sourceName}
            </span>
          </>
        )}
      </span>
      <span className="projectbar__spacer" />
      {children}
    </div>
  );
}
