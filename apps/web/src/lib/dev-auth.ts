/**
 * Development authentication — **W5-A**, and deliberately narrow.
 *
 * [ADR-0039](../../../../docs/adr/ADR-0039-react-presentation-layer.md) §6.
 *
 * The API's only working `authMode` is `headers`, in which the caller supplies
 * `x-asdp-subject` and `x-asdp-roles`. A browser doing that is **asserting its
 * own authorisation**, which anyone can forge with dev-tools.
 *
 * That is tolerable for local development and **nowhere else**. So:
 *
 * - it **fails closed**: any origin that is not a recognised localhost
 *   development origin is refused, and the refusal is an exception, not a
 *   fallback to some weaker mode;
 * - it is **visibly identified** wherever it is used;
 * - it is **NOT the production authentication architecture**. Production needs
 *   OIDC ([ADR-0027](../../../../docs/adr/ADR-0027-abstract-oidc-identity.md)),
 *   whose adapter is not implemented.
 *
 * The check is a pure function of the origin so it is testable without a browser.
 */

/**
 * Roles the API recognises — **all ten of them**.
 *
 * This list must equal `Role` in `@asdp/schemas` **exactly**, and a drift test
 * asserts equality in **both** directions.
 *
 * U1 shipped five of the ten, and its drift test did not catch it: it asserted
 * *every role the UI names is a role the API defines*, which is true of any
 * subset. **A one-directional drift test catches half the drift.** The
 * consequence was concrete rather than theoretical — `ingestSource` permits
 * `Contributor`, and a Contributor could not sign in at all.
 */
export const ROLES = [
  'Viewer',
  'Contributor',
  'BusinessAnalyst',
  'ProcessArchitect',
  'BusinessApprover',
  'TechnicalApprover',
  'CamundaDeveloper',
  'TestDesigner',
  'ComplianceReviewer',
  'PlatformAdmin',
] as const;

export type DevRole = (typeof ROLES)[number];

export interface DevIdentity {
  readonly subject: string;
  readonly roles: readonly DevRole[];
}

export class DevAuthRefused extends Error {}

/** Hostnames on which development authentication is permitted. Exhaustive. */
const PERMITTED_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Whether development authentication may operate against this origin.
 *
 * Fails closed: anything unparseable, any non-http(s) scheme and any host not in
 * the list above is refused. A wildcard such as `*.localhost` is NOT accepted —
 * a permissive pattern here is how a development door ends up open in staging.
 */
export function isDevelopmentOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  return PERMITTED_HOSTS.has(url.hostname);
}

/**
 * The headers development authentication sends, or a refusal.
 *
 * @throws DevAuthRefused when the origin is not a development origin.
 */
export function devAuthHeaders(identity: DevIdentity, origin: string): Record<string, string> {
  if (!isDevelopmentOrigin(origin)) {
    throw new DevAuthRefused(
      `development authentication is refused for origin '${origin}'. It is permitted only against ` +
        'localhost and is NOT the production authentication architecture; production requires OIDC ' +
        '(ADR-0027, ADR-0039 §6)',
    );
  }
  if (identity.subject.trim().length === 0) {
    throw new DevAuthRefused('a development identity needs a subject');
  }
  if (identity.roles.length === 0) {
    throw new DevAuthRefused('a development identity needs at least one role');
  }
  return {
    'x-asdp-subject': identity.subject.trim(),
    'x-asdp-roles': identity.roles.join(','),
  };
}

/**
 * The role map used to disable affordances — **W10 / G-c deferred**.
 *
 * `COMMANDS` in the API is the authority and is **not exposed over HTTP**, so
 * this is a deliberate, recorded duplicate. It is a **courtesy**: the API
 * refuses regardless (ADR-0027), and hiding a button is not a control.
 *
 * A drift test asserts every command named here is one the API actually has, so
 * this map cannot rot unnoticed — which is the whole reason G-c was deferrable.
 */
export const COMMAND_ROLES: Readonly<Record<string, readonly DevRole[]>> = {
  createProject: ['PlatformAdmin', 'ProcessArchitect'],

  // U2. Note that ingest is DELIBERATELY WIDER than ranking: a Contributor may
  // add evidence and may not decide how authoritative it is. ADR-0012 derives
  // conflict precedence from that ranking, so it is a governance judgement
  // rather than a clerical one, and the UI must not blur the difference.
  ingestSource: ['Contributor', 'BusinessAnalyst', 'ProcessArchitect'],
  setSourceAuthorityRank: ['BusinessAnalyst', 'ProcessArchitect'],
  validateIntake: [
    'Viewer',
    'Contributor',
    'BusinessAnalyst',
    'ProcessArchitect',
    'ComplianceReviewer',
  ],

  // U3-b. Recording evidence is a BusinessAnalyst/ProcessArchitect act, and is
  // deliberately narrower than ingest: a Contributor may add a document and may
  // not decide which of its passages is evidence for a requirement.
  recordEvidence: ['BusinessAnalyst', 'ProcessArchitect'],

  // U3-c. CORRECTED to match the API exactly, because U3-c is the first slice
  // that gates on it. It previously read
  // ['Viewer', 'BusinessAnalyst', 'ProcessArchitect', 'BusinessApprover'] — which
  // omitted three roles the API grants and named one it does not, so a
  // Contributor, a ComplianceReviewer and a PlatformAdmin would each have been
  // shown a refusal the API would not have given, and a BusinessApprover the
  // reverse. Recorded as a finding at U3-b and fixed here rather than there,
  // because a map entry nothing consumes cannot mislead anyone.
  listRequirements: [
    'Viewer',
    'Contributor',
    'BusinessAnalyst',
    'ProcessArchitect',
    'ComplianceReviewer',
    'PlatformAdmin',
  ],

  // Still consumed by NO screen, and `frameCoverage` and `g1Readiness` still do
  // NOT match the API. They are left alone deliberately: correcting an entry
  // nothing gates on is churn, and each belongs to the slice that first uses it
  // — frameCoverage to U4, g1Readiness to U5. `reviewRequirement` happens to be
  // correct already and belongs to U3-d.
  frameCoverage: ['Viewer', 'BusinessAnalyst', 'ProcessArchitect', 'BusinessApprover'],
  reviewRequirement: ['BusinessAnalyst', 'ProcessArchitect'],
  g1Readiness: ['Viewer', 'BusinessAnalyst', 'ProcessArchitect', 'BusinessApprover'],
};

/** Whether an identity may invoke a command. Affordance only — never a control. */
export function mayInvoke(identity: DevIdentity, command: string): boolean {
  const required = COMMAND_ROLES[command];
  if (required === undefined) return true; // unknown here: let the API decide
  return identity.roles.some((r) => required.includes(r));
}
