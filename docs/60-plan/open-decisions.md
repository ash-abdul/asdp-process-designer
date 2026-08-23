# Open Decisions Register

> **Status:** Approved (Phase 0) · **Version:** 1.1 · **Updated:** 2026-08-23
> **OD-1 revised 2026-08-23** by approved decision A8 — see below.

What is settled, what is genuinely open, and **when** each open item starts blocking. Nothing
here blocks Phase 0.

---

## 1. Settled by your Phase 0 decisions

| Was open | Now settled as |
|---|---|
| AI provider dependency | **AI Provider Abstraction.** Claude API is one adapter; enterprise/private endpoints must be supportable; external providers permitted in the MVP dev environment where policy allows ([ADR-0020](../adr/ADR-0020-ai-provider-abstraction.md)). **A8 (2026-08-23)** approves Claude API as the *initial live* provider for development, under five conditions |
| Data egress | **Not all source material may leave the enterprise.** Classification-driven egress policy, enforced at one choke point ([ADR-0021](../adr/ADR-0021-data-classification-egress-policy.md)) |
| Language scope | **Arabic and English**, including mixed and RTL. UX localisation phased; data/evidence/anchoring/text/rendering architecture bilingual from day one ([ADR-0023](../adr/ADR-0023-unicode-bilingual-architecture.md)) |
| Camunda target | **Camunda 8.x**, version-agnostic core, versioned profiles ([ADR-0025](../adr/ADR-0025-camunda-version-profiles.md)) |
| Sandbox cluster | **TBD, non-blocking.** Static validation first; `DeploymentValidator` port defined ([ADR-0026](../adr/ADR-0026-static-validation-first.md)) |
| Identity provider | **Abstract OIDC/OAuth2**; enterprise IdP is an environment decision ([ADR-0027](../adr/ADR-0027-abstract-oidc-identity.md)) |
| Source corpus | **Real ASDP material required eventually**; representative/sanitised acceptable now; corpus is data, not code ([ADR-0031](../adr/ADR-0031-corpus-as-data.md)) |
| DMN editing | **No business-user DMN manipulation.** DecisionSpec is the editable surface ([ADR-0002](../adr/ADR-0002-spec-layer-editing.md), [decision-generation.md](../30-generation/decision-generation.md)) |
| Deployment | **Containerised, Compose first, Kubernetes-ready** ([ADR-0028](../adr/ADR-0028-containerised-compose-first.md)) |

## 2. Open decisions

### OD-1 — Which private/enterprise model endpoint will be available?

> **REVISED 2026-08-23 by approved decision A8.** This was recorded as blocking "P2 completion",
> which conflated two different dependencies. It is now split:
>
> | | Dependency | State |
> |---|---|---|
> | **Development / MVP** | An approved live provider for non-sensitive or sanitised evidence | **Resolved.** Claude API, through the AI Provider Abstraction ([phase-2-plan.md](phase-2-plan.md) §4 A8) |
> | **Enterprise / private deployment** | A private endpoint for classified material | **Still open — this decision** |
>
> A private enterprise endpoint is a **deployment and governance dependency, not a development
> blocker.** The egress policy is what keeps the two apart: restricted content cannot reach an
> external provider regardless of which adapter is configured, so development can proceed on
> permitted material without pre-empting the deployment decision.

**Blocks:** analysis of `RESTRICTED` or higher material, and therefore any enterprise deployment
that holds it. Also blocks measuring routing and quality tiers against a real private endpoint.
**Not blocking:** development or the MVP on `PUBLIC`/`INTERNAL` and redacted `CONFIDENTIAL`
material (A8). The generic private-endpoint adapter remains built and tested against a stub with a
reduced capability descriptor, so the swap stays an adapter change.
**What we need:** endpoint type (OpenAI-compatible? custom HTTP?), model family, context size,
whether it supports vision, structured output, and tool calling.
**Why it matters:** vision is the one capability with **no degradation path**. If the on-premise
endpoint has no vision capability, then screenshots, diagram images, and scanned documents
cannot be analysed at all in a fully on-premise project. That is a scope consequence, not a
technical one, and you should know it early.
**Default if unanswered:** build against the stub; treat vision as external-only and document the
restriction.

### OD-2 — The egress policy matrix
**Blocks:** P2 (the gate needs real policy values).
**Not blocking:** P0 (the mechanism is built and tested with placeholder policy).
**What we need:** for each classification level, which task types may run on an external
provider; whether redaction changes eligibility; retention and residency requirements per level.
**Default if unanswered:** the conservative default in
[data-governance.md](../10-architecture/data-governance.md) — `RESTRICTED` and above never leave;
`CONFIDENTIAL` requires redaction; external providers require training opt-out.

### OD-3 — Standard requirement authoring language
**Blocks:** nothing hard; affects P2 UX and prompt design.
**Options:** (a) requirements always authored in English with Arabic evidence retained; (b)
requirements in the source language with translation on demand; (c) per-project setting.
**Recommendation:** **(c)**, defaulting to English for requirement text with Arabic evidence
always retained verbatim. It keeps identifiers, FEEL, and validation messages coherent while
losing nothing evidentially.
**Default if unanswered:** (c) with an English default.

### OD-4 — Identifier generation strategy for Arabic-only names
**Blocks:** P4 (element ID minting). Cheap to decide, expensive to change later because IDs must
be stable across releases.
**Options:**
- (a) **Transliterate** — `التحقق من الهوية` → `Activity_altahaqquq_min_alhawiya_1`. Readable to
  an Arabic speaker reading Latin script; unreadable to others; transliteration schemes vary.
- (b) **Require an English name or glossary term**; block generation until one exists. Cleanest
  IDs, most friction.
- (c) **Sequential** — `Activity_0007`, with the Arabic name as the display name only. Zero
  ambiguity, zero readability.
- (d) **Hybrid (recommended):** English name or glossary translation if available → else
  transliteration → else sequential. Always with a stable discriminator.
**Recommendation:** **(d)**.
**Default if unanswered:** (d).

### OD-5 — RTL diagram flow for Arabic-primary processes
**Blocks:** nothing; affects S3/S4 outcomes and the layout default.
**Question:** should a process whose display language is Arabic lay out right-to-left by default,
or always left-to-right with Arabic labels?
**Consideration:** RTL flow reads naturally for Arabic reviewers, but Camunda Modeler will render
the same file left-to-right after handoff, so a Camunda engineer would see a mirrored diagram.
**Recommendation:** **LTR by default**, with `presentation_hint{readingDirection: rtl}` available per
process as an explicit choice. Consistency with the downstream tool outweighs reading comfort.
**Default if unanswered:** LTR default, directive available.

### OD-6 — Connector allow-list and standards profile v1
**Blocks:** P6 (L5 governance rules need real values).
**What we need:** which Camunda connectors are approved for use; naming conventions for
processes, tasks, job types, and decisions; required documentation fields; layout thresholds if
they should differ from the defaults.
**Default if unanswered:** permissive allow-list in development, thresholds as documented in
[layout-architecture.md](../30-generation/layout-architecture.md) §4, and a naming convention
proposal for your review at P6.

### OD-7 — Real / sanitised corpus availability and sanitisation process
**Blocks:** P9 exit (pilot validity), and weakens all prompt work from P2 onward.
**What we need:** 2–3 representative corpora — ideally a BRD, an SOP or policy document, a rules
spreadsheet, and one legacy BPMN — plus who may sanitise them and where they may be stored.
**Why it matters:** this is the named risk in your Phase 0 decision 6. The framework is built so
real corpora slot in without redesign, but prompts tuned only on synthetic material will be
wrong in ways we cannot predict.
**Default if unanswered:** proceed with synthetic and clearly labelled representative corpora;
escalate at P2 if nothing real is available, since that is the point at which prompt work starts
compounding.

### OD-8 — Approval authority mapping
**Blocks:** P2 (G1 policy needs real approver roles).
**What we need:** who holds `BusinessApprover` and `TechnicalApprover` in practice; whether
quorum > 1 is required at any gate; whether self-approval is ever permitted; approval expiry.
**Default if unanswered:** the defaults in
[governance-and-gates.md](../50-governance/governance-and-gates.md) §3 — single approver per
gate, self-approval off, 90-day expiry.

### OD-9 — Single executable process per project
**Blocks:** P4 scope.
**Question:** is one executable process per project acceptable for the MVP, with call activities
recognised but hierarchy authoring deferred?
**Recommendation:** **yes.** Multi-process hierarchies multiply the IR, layout, validation, and
divergence surfaces.
**Default if unanswered:** yes.

## 3. Explicitly deferred, not open

Not decisions we need — items consciously postponed with a named extension point:
live deployment validation, automated Camunda state pull, git/Web Modeler publishing, worker code
generation, executable test generation, full Arabic UI, Kubernetes manifests, cross-project
pattern library, runtime KPI feedback, multi-tenancy, SCIM provisioning, real-time co-editing.

Each has a port or extension point named in
[module-map.md](../10-architecture/module-map.md) §5 and
[mvp-scope.md](../00-product/mvp-scope.md) §3.

## 4. What would genuinely change the architecture

For completeness, the two things that would force a redesign rather than a re-configuration:

1. **A fully air-gapped mandate with no vision-capable model available.** Multimodal intake of
   screenshots, diagram images, and scanned documents would become impossible, removing a
   headline capability. The provider abstraction contains the damage, but it cannot manufacture
   a capability the environment lacks. → OD-1.
2. **A requirement that generated artifacts be hand-editable inside ASDP.** This would reverse
   [ADR-0001](../adr/ADR-0001-requirements-driven-product-boundary.md) and
   [ADR-0002](../adr/ADR-0002-spec-layer-editing.md) and invalidate the correct-by-construction
   IR, the traceability guarantee, and the divergence model. It is the one decision that cannot
   be revisited cheaply at any point.
