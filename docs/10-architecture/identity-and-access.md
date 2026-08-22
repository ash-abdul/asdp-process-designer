# Identity and Access

> **Status:** Approved (Phase 0) · **Version:** 1.0 · **Updated:** 2026-08-22
> **Related:** [ADR-0027](../adr/ADR-0027-abstract-oidc-identity.md), [governance-and-gates.md](../50-governance/governance-and-gates.md)

---

## 1. Requirement

Standards-based OIDC / OAuth 2.0 only. The core architecture MUST NOT be bound to any
specific identity provider. The enterprise IdP remains an environment decision.

## 2. What the application depends on

**Only the standards.** Specifically:

- OpenID Connect Authorization Code flow with PKCE for interactive login
- OIDC Discovery (`/.well-known/openid-configuration`) for endpoint and key resolution
- JWKS for token signature verification, with key rotation handling
- Standard claims: `sub`, `iss`, `aud`, `exp`, `iat`, `email`, `name`, `preferred_username`,
  `locale`
- A **configurable** claim path for group/role membership
- OAuth 2.0 Client Credentials for service-to-service calls (jobs worker → API)
- RP-initiated logout and refresh-token rotation where the IdP supports it

No vendor SDK, no vendor-specific endpoint shape, no vendor-specific claim name hard-coded
anywhere. The `IdentityProvider` port isolates even the standards-compliant plumbing so that a
provider with a non-standard quirk is absorbed in one adapter.

## 3. Configuration surface

```
identity:
  issuerUrl:            <discovery base URL>
  clientId:             <spa client id>
  audience:             <api audience>
  scopes:               [openid, profile, email, <extra>]
  usePkce:              true
  claims:
    subject:            sub
    email:              email
    displayName:        name
    locale:             locale               # feeds UI language default
    groups:             groups               # CONFIGURABLE claim path, e.g. "roles",
                                             # "resource_access.asdp.roles", "wids"
  roleMapping:                               # group/claim value → ASDP role
    "ASDP-Admins":            PlatformAdmin
    "ASDP-Architects":        ProcessArchitect
    "ASDP-Analysts":          BusinessAnalyst
    "ASDP-BusinessOwners":    BusinessApprover
    "ASDP-TechApprovers":     TechnicalApprover
    "ASDP-Developers":        CamundaDeveloper
    "ASDP-QA":                TestDesigner
    "ASDP-Auditors":          ComplianceReviewer
    "ASDP-Viewers":           Viewer
  defaultRole:          Viewer
  jitProvisioning:      true                 # create the local user record on first login
```

Role mapping is **data**, not code. Adding an IdP means writing configuration, not shipping a
release.

## 4. Roles

| Role | Capabilities |
|---|---|
| `Viewer` | Read projects, requirements, specs, artifacts, reports |
| `Contributor` | Upload sources, answer clarification questions, comment |
| `BusinessAnalyst` | Contributor + create/edit requirements, resolve conflicts, submit for approval |
| `ProcessArchitect` | Analyst + edit all specifications, manage generation directives, trigger generation |
| `BusinessApprover` | Approve G1 and G2 |
| `TechnicalApprover` | Approve G3 and G4 |
| `CamundaDeveloper` | Read all, export packages, perform handoff, upload Camunda observations |
| `TestDesigner` | Author test scenarios |
| `ComplianceReviewer` | Read-only access to everything including audit log, AI interactions, and disclosure reports |
| `PlatformAdmin` | Standards profiles, validation rule packs, connector allow-list, **AI provider configuration and egress policy**, gate policies, Camunda target profiles, budgets |

Roles are coarse; nuance lives in gate policy
([governance-and-gates.md](../50-governance/governance-and-gates.md)).

## 5. Authorisation model

Three checks, applied in order, on every command:

1. **Role capability** — does this role permit this command type at all?
2. **Project membership** — is the user a member of the target project, with a
   project-scoped role that permits it? (Project role overrides tenant role, downward only.)
3. **State guard** — does the current stage/gate state permit this command on this entity?
   Editing an artifact-level entity is refused here regardless of role, because no such
   command exists ([ADR-0002](../adr/ADR-0002-spec-layer-editing.md)).

Segregation of duties is enforced at the gate, not the role: the author of a requirement
should not be its sole approver. Default on; override is configurable and audited.

## 6. Sessions and tokens

| Concern | Decision |
|---|---|
| SPA token handling | Short-lived access token in memory; refresh via the IdP with rotation. No long-lived token in `localStorage` |
| API verification | Signature, `iss`, `aud`, `exp` verified on every request against cached JWKS with rotation |
| Service-to-service | Client-credentials token with a distinct audience and a restricted role set |
| Impersonation | Not supported |
| Anonymous access | None. Every request is authenticated |
| Audit binding | Every `AuditEvent` records the authenticated subject, the resolved roles at the time, and the token issuer |

## 7. Deliberately deferred

| Capability | Note |
|---|---|
| SCIM provisioning | JIT provisioning from claims is sufficient for the MVP |
| Fine-grained per-field permissions | Role plus gate state is sufficient |
| Multi-tenancy across organisations | Single organisation, many projects, in the MVP |
| Attribute-based access control | Considered if a real requirement emerges; not speculatively built |

## 8. Non-negotiables

- No vendor identity SDK anywhere in the codebase.
- No hard-coded claim names outside configuration.
- No role or permission decision inside `apps/web` — the SPA hides affordances for usability,
  but the API is the sole authority.
- Local development uses a standards-compliant OIDC container, not a bypass. **A "skip auth"
  development mode is prohibited**, because auth-adjacent bugs found in production are almost
  always the result of one.
