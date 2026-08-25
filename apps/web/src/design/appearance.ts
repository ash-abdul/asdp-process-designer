/**
 * Theme and density — **Y15, and Y14's "light and dark are both first-class"**.
 *
 * Pure functions over preferences, so the whole of it is testable without a
 * browser. The component layer does one thing with the result: puts two
 * attributes on the root element, which the token layer reads.
 *
 * **Density changes spacing and body size. It never changes information** —
 * compact is for a reviewer scanning a table all day, not a way to hide state.
 */

export type ThemePreference = 'light' | 'dark' | 'system';
export type Theme = 'light' | 'dark';
export type Density = 'comfortable' | 'compact';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];
export const DENSITIES: readonly Density[] = ['comfortable', 'compact'];

/** `system` follows the OS. Anything else is the user's explicit choice and wins. */
export function resolveTheme(preference: ThemePreference, prefersDark: boolean): Theme {
  if (preference === 'system') return prefersDark ? 'dark' : 'light';
  return preference;
}

/** The two attributes the token layer keys off. Nothing else styles by preference. */
export function appearanceAttributes(
  theme: Theme,
  density: Density,
): { readonly 'data-theme': Theme; readonly 'data-density': Density } {
  return { 'data-theme': theme, 'data-density': density };
}

/** Cycles light → dark → system → light. Three steps return to the start. */
export function nextThemePreference(current: ThemePreference): ThemePreference {
  const i = THEME_PREFERENCES.indexOf(current);
  const next = THEME_PREFERENCES[(i + 1) % THEME_PREFERENCES.length];
  return next ?? 'light';
}

export function otherDensity(current: Density): Density {
  return current === 'comfortable' ? 'compact' : 'comfortable';
}

/** What the control should say it will do — never a bare icon (W8). */
export function themeControlLabel(preference: ThemePreference, resolved: Theme): string {
  const showing = `showing ${resolved}`;
  if (preference === 'system') return `Appearance: following the system, ${showing}`;
  return `Appearance: ${preference}, ${showing}`;
}

export function densityControlLabel(density: Density): string {
  return `Density: ${density}. Switch to ${otherDensity(density)}`;
}
