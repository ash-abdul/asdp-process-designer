# ADR-0027: Abstract OIDC/OAuth2 Identity

> **Status:** Approved · **Date:** 2026-08-22 · **Reversibility:** Easy
> **Related:** docs/10-architecture/identity-and-access.md

## Context

Phase 0 decision 5: use standards-based OIDC/OAuth2 and keep identity-provider integration
abstract. The actual enterprise IdP remains an environment decision.

Vendor identity SDKs bring convenience and coupling in roughly equal measure. The coupling shows up
in claim names, endpoint shapes, token handling quirks, and group-membership representations — all
of which differ between providers in ways that leak into authorisation code.

## Decision

1. The application **MUST** depend only on the standards: OIDC Authorization Code flow with PKCE,
   OIDC Discovery, JWKS with key rotation, standard claims, OAuth 2.0 Client Credentials for
   service-to-service, and RP-initiated logout.
2. **No vendor identity SDK MUST be used** anywhere in the codebase.
3. The **group/role claim path MUST be configurable**, and role mapping (claim value → ASDP role)
   **MUST** be configuration data, not code.
4. An `IdentityProvider` port **MUST** isolate even the standards-compliant plumbing, so a
   provider-specific quirk is absorbed in one adapter.
5. Authorisation **MUST** be enforced by the API. The SPA hides affordances for usability only and
   is never the authority.
6. A **"skip auth" development mode MUST NOT exist.** Local development uses a standards-compliant
   OIDC container.
7. Every audit event **MUST** record the authenticated subject, the roles resolved at that moment,
   and the token issuer.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Vendor identity SDK | Couples the application to an environment decision that has not been made |
| Own username/password authentication | Unacceptable in an enterprise setting; and it would become the path of least resistance |
| SAML | OIDC is the appropriate choice for a modern SPA plus API |
| Skip-auth development mode | A recurring source of production defects, because auth-adjacent code paths then differ between environments |

## Consequences

**Positive**

- Any standards-compliant IdP can be adopted by configuration.
- Roles derive from existing enterprise group membership, so no parallel user administration is
  needed.
- Recording roles-at-time makes historical approvals interpretable even after a person's group
  membership changes — which matters for audit.

**Negative**

- Some provider-specific conveniences are unavailable; JIT provisioning from claims replaces SCIM
  in the MVP.
- Non-standard provider quirks must be absorbed in the adapter rather than papered over by an SDK.
- Local development requires an IdP container, which is slightly more setup than a bypass.

## Enforcement

- Dependency check: no vendor identity package is a dependency.
- Configuration schema validation at boot: claim paths and role mapping must be present and
  resolvable.
- An architecture test asserts no authorisation decision is made in `apps/web`.
- No configuration value can disable authentication.
