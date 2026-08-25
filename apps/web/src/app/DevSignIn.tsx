/**
 * Development sign-in — **W5-A**, and it says so on every screen.
 *
 * The API's only working auth mode is `headers`, in which the caller supplies
 * its own subject and roles. A browser doing that is asserting its own
 * authorisation. That is acceptable for local development and nowhere else, so
 * this screen:
 *
 * - **refuses to operate off localhost**, visibly, with no weaker fallback;
 * - is **labelled as development authentication** here and in the shell banner;
 * - says plainly that it is **not** the production architecture.
 *
 * See [ADR-0039](../../../../docs/adr/ADR-0039-react-presentation-layer.md) §6.
 */

import { useState, type ReactNode } from 'react';
import { ROLES, isDevelopmentOrigin, type DevIdentity, type DevRole } from '../lib/dev-auth.ts';

export function DevSignIn({ origin, onSignIn }: { origin: string; onSignIn: (i: DevIdentity) => void }): ReactNode {
  const [subject, setSubject] = useState('u-analyst');
  const [roles, setRoles] = useState<readonly DevRole[]>(['BusinessAnalyst']);
  const permitted = isDevelopmentOrigin(origin);

  if (!permitted) {
    return (
      <main className="signin" role="alert">
        <h1>Development authentication is refused here</h1>
        <p>
          This build uses <strong>development authentication</strong>, which is permitted only
          against a localhost origin. The current origin is <code>{origin}</code>.
        </p>
        <p>
          This is deliberate and not recoverable from the browser. Development authentication lets a
          caller assert its own identity <em>and its own roles</em>; it is <strong>not</strong> the
          production authentication architecture, which requires OIDC.
        </p>
      </main>
    );
  }

  const toggle = (role: DevRole): void =>
    setRoles((current) =>
      current.includes(role) ? current.filter((r) => r !== role) : [...current, role],
    );

  return (
    <main className="signin">
      <h1>ASDP — development sign-in</h1>

      <p className="dev-warning" role="note">
        <strong>Development authentication.</strong> You are choosing your own identity and roles.
        Anyone can do the same. This is for local development only and is <strong>not</strong> the
        production authentication architecture.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (subject.trim().length > 0 && roles.length > 0) onSignIn({ subject: subject.trim(), roles });
        }}
      >
        <label htmlFor="subject">Subject</label>
        <input
          id="subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          autoComplete="off"
          required
        />

        <fieldset>
          <legend>Roles</legend>
          {ROLES.map((role) => (
            <label key={role} className="role">
              <input type="checkbox" checked={roles.includes(role)} onChange={() => toggle(role)} />
              {role}
            </label>
          ))}
        </fieldset>

        <button type="submit" disabled={subject.trim().length === 0 || roles.length === 0}>
          Sign in
        </button>
        {roles.length === 0 ? <p className="state__hint">Choose at least one role.</p> : null}
      </form>
    </main>
  );
}
