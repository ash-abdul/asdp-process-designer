/**
 * Development sign-in — **W5-A**, and it says so on every screen.
 *
 * The API's only working auth mode is `headers`, in which the caller supplies
 * its own subject and roles. A browser doing that is asserting its own
 * authorisation. That is acceptable for local development and nowhere else, so
 * this screen:
 *
 * - **refuses to operate off localhost**, visibly, with no weaker fallback;
 * - is **labelled as development authentication** here and in the shell;
 * - says plainly that it is **not** the production architecture.
 *
 * See [ADR-0039](../../../../docs/adr/ADR-0039-react-presentation-layer.md) §6.
 *
 * **D-U2.5 restyled it and changed nothing else.** All ten roles are still
 * selectable — U2-a's defect was that five were missing, and a bidirectional
 * drift test now fails if that ever recurs — and the warning is, if anything,
 * louder than before (**F-U1-b**).
 */

import { useState, type ReactNode } from 'react';
import { ROLES, isDevelopmentOrigin, type DevIdentity, type DevRole } from '../lib/dev-auth.ts';
import { Button } from '../components/ui/Button.tsx';
import { Card, Field } from '../components/ui/Card.tsx';

export function DevSignIn({ origin, onSignIn }: { origin: string; onSignIn: (i: DevIdentity) => void }): ReactNode {
  const [subject, setSubject] = useState('u-analyst');
  const [roles, setRoles] = useState<readonly DevRole[]>(['BusinessAnalyst']);
  const permitted = isDevelopmentOrigin(origin);

  if (!permitted) {
    return (
      <main className="signin" role="alert">
        <div className="signin__panel">
          <Brand />
          <Card title="Refused">
            <h1>Development authentication is refused here</h1>
            <p>
              This build uses <strong>development authentication</strong>, which is permitted only
              against a localhost origin. The current origin is <code className="id">{origin}</code>.
            </p>
            <p>
              This is deliberate and not recoverable from the browser. Development authentication lets
              a caller assert its own identity <em>and its own roles</em>; it is <strong>not</strong>{' '}
              the production authentication architecture, which requires OIDC.
            </p>
          </Card>
        </div>
      </main>
    );
  }

  const toggle = (role: DevRole): void =>
    setRoles((current) => (current.includes(role) ? current.filter((r) => r !== role) : [...current, role]));

  return (
    <main className="signin">
      <div className="signin__panel">
        <Brand />

        <p className="dev-warning" role="note">
          <strong>Development authentication.</strong> You are choosing your own identity and roles.
          Anyone can do the same. This is for local development only and is <strong>not</strong> the
          production authentication architecture.
        </p>

        <Card title="Sign in">
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              if (subject.trim().length > 0 && roles.length > 0) onSignIn({ subject: subject.trim(), roles });
            }}
          >
            <Field id="subject" label="Subject" hint="Sent as x-asdp-subject. Any value; it is not verified.">
              <input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                autoComplete="off"
                required
              />
            </Field>

            <fieldset className="roles">
              <legend>Roles — all ten the API recognises</legend>
              {/*
                U2-a's defect was that five of the ten were missing, and a
                bidirectional drift test now fails if that ever recurs.
              */}
              {ROLES.map((role) => (
                <label key={role} className="role">
                  <input type="checkbox" checked={roles.includes(role)} onChange={() => toggle(role)} />
                  {role}
                </label>
              ))}
            </fieldset>

            <div className="row">
              <Button type="submit" tone="primary" glyph="→" disabled={subject.trim().length === 0 || roles.length === 0}>
                Sign in
              </Button>
              {roles.length === 0 ? <span className="state__hint">Choose at least one role.</span> : null}
            </div>
          </form>
        </Card>

        <p className="signin__foot">
          Production requires OIDC (ADR-0027), whose adapter is not implemented. Ask ASDP is
          unavailable in this build — live AI enablement is pending (H3).
        </p>
      </div>
    </main>
  );
}

function Brand(): ReactNode {
  return (
    <div className="signin__brand">
      <span className="rail__mark" aria-hidden="true">
        ◈
      </span>
      <span>
        <h1 className="signin__title">ASDP Process Designer</h1>
        <span className="signin__sub">
          Evidence-backed requirements into governed, traceable Camunda artifacts
        </span>
      </span>
    </div>
  );
}
