/**
 * `AppShell` — **Y3**, the four-region shell.
 *
 * ```
 * ┌──────────────────────────────────────────────────────┐
 * │ RAIL │ PROJECT BAR                                   │
 * │      ├────────────────┬───────────┬──────────────────┤
 * │      │ WORKSPACE      │ INSPECTOR │ ASK ASDP         │
 * │      ├────────────────┴───────────┴──────────────────┤
 * │      │ STATUS STRIP                                  │
 * └──────────────────────────────────────────────────────┘
 * ```
 *
 * The regions are **structural**: a screen chooses their content, never whether
 * they exist. Collapse behaviour comes from `responsive.ts`, and the status strip
 * is never hidden at any width (**Y26**).
 *
 * ## Two deliberate omissions
 *
 * **Appearance is not persisted.** Theme and density live in React state and
 * nowhere else. A `localStorage` key would leak between browser tests — one test
 * flipping to dark would silently change what the next one sees — and a durable
 * preference is not worth a cross-test coupling in a presentation-only slice.
 *
 * **There is no router.** `W4` permits plain React state and no library, and this
 * build has exactly one available workspace. Deep-linkability (**Y5**) is
 * approved as a target and is **not** in D-U2.5's scope; the shell is shaped so a
 * router can be added without moving these regions.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Rail } from './Rail.tsx';
import { StatusStrip } from './StatusStrip.tsx';
import { Button } from '../ui/Button.tsx';
import {
  appearanceAttributes,
  densityControlLabel,
  nextThemePreference,
  otherDensity,
  resolveTheme,
  themeControlLabel,
  type Density,
  type ThemePreference,
} from '../../design/appearance.ts';
import { layoutFor, type ShellLayout } from '../../design/responsive.ts';

/** The viewport width, as a state value. The only DOM measurement in the shell. */
function useViewport(): number {
  const [width, setWidth] = useState<number>(() => (typeof window === 'undefined' ? 1440 : window.innerWidth));
  useEffect(() => {
    const onResize = (): void => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

function usePrefersDark(): boolean {
  const [dark, setDark] = useState<boolean>(() =>
    typeof window === 'undefined' ? false : window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent): void => setDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return dark;
}

export interface ShellRegions {
  readonly projectBar: ReactNode;
  readonly workspace: ReactNode;
  readonly inspector?: ReactNode;
  readonly assistant: (overlay: boolean, collapse: () => void) => ReactNode;
  readonly assistantTab: (expand: () => void) => ReactNode;
  readonly statusItems: readonly { readonly glyph: string; readonly label: ReactNode; readonly testId?: string }[];
  readonly railFooter: ReactNode;
}

export function AppShell({
  currentWorkspace,
  regions,
  layoutOverride,
}: {
  currentWorkspace: string;
  regions: ShellRegions;
  /** Tests and stories may pin a layout. Production never passes it. */
  layoutOverride?: ShellLayout;
}): ReactNode {
  const width = useViewport();
  const prefersDark = usePrefersDark();
  const layout = layoutOverride ?? layoutFor(width);

  const [themePreference, setThemePreference] = useState<ThemePreference>('system');
  const [density, setDensity] = useState<Density>('comfortable');
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);

  const theme = resolveTheme(themePreference, prefersDark);

  // The token layer keys off exactly these two attributes, and nothing else.
  useEffect(() => {
    const attrs = appearanceAttributes(theme, density);
    const root = document.documentElement;
    root.setAttribute('data-theme', attrs['data-theme']);
    root.setAttribute('data-density', attrs['data-density']);
  }, [theme, density]);

  const drawer = layout.rail === 'drawer';

  return (
    <div
      className="shell"
      data-rail={layout.rail}
      data-inspector={layout.inspector}
      data-assistant={layout.assistant}
      data-collapse={String(layout.columns)}
      data-testid="shell"
    >
      <a className="skip" href="#main">
        Skip to content
      </a>

      <Rail
        mode={layout.rail === 'drawer' ? 'expanded' : layout.rail}
        currentWorkspace={currentWorkspace}
        onSelect={() => setRailOpen(false)}
        {...(drawer && !railOpen ? { hidden: true } : {})}
        footer={
          <>
            {regions.railFooter}
            <AppearanceButtons
              themePreference={themePreference}
              theme={theme}
              density={density}
              onTheme={() => setThemePreference(nextThemePreference(themePreference))}
              onDensity={() => setDensity(otherDensity(density))}
            />
          </>
        }
      />

      {regions.projectBar}

      <div className="work">
        <main id="main" className="workspace" tabIndex={-1}>
          {drawer ? (
            <span className="row">
              <Button onClick={() => setRailOpen(!railOpen)} glyph="≡" small testId="rail-toggle">
                {railOpen ? 'Hide navigation' : 'Navigation'}
              </Button>
            </span>
          ) : null}
          {regions.workspace}
        </main>

        {regions.inspector}

        {assistantOpen
          ? regions.assistant(layout.assistant === 'overlay', () => setAssistantOpen(false))
          : regions.assistantTab(() => setAssistantOpen(true))}
      </div>

      <StatusStrip
        items={[
          ...regions.statusItems,
          { glyph: '◐', label: `Theme: ${theme}`, testId: 'status-theme' },
          { glyph: '▤', label: `Density: ${density}`, testId: 'status-density' },
        ]}
      />

      {drawer && railOpen ? (
        <button
          type="button"
          className="overlay-scrim"
          aria-label="Close navigation"
          onClick={() => setRailOpen(false)}
        />
      ) : null}
    </div>
  );
}

/**
 * Theme and density controls, for the rail footer.
 *
 * Each button carries a **label that says what it will do** — never a bare icon
 * (**W8**) — and the current theme and density are also stated in the status
 * strip, so appearance is never conveyed by an icon alone.
 */
function AppearanceButtons({
  themePreference,
  theme,
  density,
  onTheme,
  onDensity,
}: {
  themePreference: ThemePreference;
  theme: 'light' | 'dark';
  density: Density;
  onTheme: () => void;
  onDensity: () => void;
}): ReactNode {
  return (
    <div className="rail__controls">
      <Button onClick={onTheme} tone="subtle" small glyph={theme === 'dark' ? '☾' : '☀'} testId="theme-toggle" ariaLabel={themeControlLabel(themePreference, theme)}>
        {themePreference === 'system' ? 'Auto' : themePreference === 'dark' ? 'Dark' : 'Light'}
      </Button>
      <Button onClick={onDensity} tone="subtle" small glyph="▤" testId="density-toggle" ariaLabel={densityControlLabel(density)}>
        {density === 'compact' ? 'Compact' : 'Comfy'}
      </Button>
    </div>
  );
}
