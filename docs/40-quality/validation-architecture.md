# Validation Architecture

> **Status:** Approved (Phase 0) · **Version:** 2.0 · **Updated:** 2026-08-22
> **Revision:** v2.0 adds `gates[]` and `severityByGate` to the rule model, makes the layer→gate
> mapping **explicit rather than inferred**, introduces the **`L4-SPEC-*` specification rule group**
> so every blocking G2 precondition has a rule identity, and defines the **localisation-ready
> message structure**.
> **Related:** [ADR-0026](../adr/ADR-0026-static-validation-first.md), [validation-rule-catalog.md](validation-rule-catalog.md), [camunda-integration.md](../50-governance/camunda-integration.md)

The Validation Engine is the **sole authority on readiness**. Gates query it; the UI only renders
it. Its authority derives from being deterministic, reproducible, and explainable — so it contains
**no model calls**.

---

## 1. The severity principle

| Severity | Meaning |
|---|---|
| **ERROR** | **Blocks the applicable gate.** No waiver exists |
| **WARNING** | May proceed **only where policy permits**, and only with an explicit, justified, approved acknowledgement (a waiver) |
| **INFO** | Informational only |

This is the whole contract. A rule that should never stop anyone is INFO; a rule that may be
knowingly accepted is WARNING; a rule that must be fixed is ERROR.

## 2. Why validation matters more here than elsewhere

Users cannot repair generated artifacts by hand. Validation is therefore not a safety net over human
work — it is the **only** quality control on the output. Two consequences:

1. Rules must be stricter, because nobody is fixing things informally.
2. Findings must name the **specification-level change** required to fix them, because that is the
   only kind of fix available.

## 3. Seven layers

| Layer | Scope | Primary gates |
|---|---|---|
| **L0** Ingestion integrity | Sources parsed, anchors resolvable, text normalised, classification assigned | G1 |
| **L1** Schema & structural | Schema validity, unique well-formed identifiers, canonical stability | All |
| **L2** Semantic model | IR invariants, reachability, DMN completeness/overlap, FEEL parse and types, form bindings, variable availability | G3 |
| **L3** Camunda executability | Camunda static compatibility lint for the target profile, job types, form/decision links, element templates, supported constructs | G3 |
| **L4** Traceability, completeness **and specification integrity** | Every element traced · every approved requirement realised or deferred · zero orphans · no unconfirmed inference on an executable path · **`L4-SPEC-*`: the G2 specification preconditions** | **G2**, G3, G4 |
| **L5** Governance & standards | Naming, allow-listed connectors, layout quality, PII handling, i18n completeness, threads, waivers | G3 |
| **L6** Testability | Path, rule-row, requirement and exception coverage | G4 |

Much of **L1 and part of L2 are structurally unreachable** because the IR makes invalid constructs
unrepresentable ([ADR-0006](../adr/ADR-0006-correct-by-construction-ir.md)). Those rules remain
implemented as defence against compiler defects, and a violation is reported as an **internal
error**, not a user error — because with no editor, only our own code could have produced it.

## 4. Rule engine

```
Rule {
  id             "L4-SPEC-005"                  // stable, citable, documented, ASCII
  layer          L0..L6
  gates[]        [G2] | [G3] | [G2, G3] | …     // ★ v2.0 — EXPLICIT, not inferred from the layer
  severity       error | warning | info         // default when severityByGate is absent
  severityByGate { G3: warning, G4: error }?    // ★ v2.0 — per-gate override
  appliesTo      artifact kind | entity type | cross-cutting
  profileScope   camundaTargetProfileIds[] | "*"
  standardsScope standardsProfileIds[] | "*"
  evaluate(context) → Finding[]                 // PURE function
  messageKey     "L4-SPEC-005.missing_interface"     // ★ localisation key
  fixHintKey     "L4-SPEC-005.fix"                   // ★ localisation key
  documentation  what it checks and why
}

Finding {
  id             "<ruleId>@<targetRef>"         // deterministic ⇒ stable across runs
  runId, ruleId, layer
  severityAtGate { G2: error, … }               // resolved per gate at evaluation time
  targetRef      { specElementId?, artifactKey?, elementId?, decisionId?, ruleSeq?,
                   fieldKey?, requirementId? }
  messageKey, messageParams                     // ★ rendered per locale, not pre-formatted
  fixHintKey, fixHintParams
  waiverId?
  firstSeenRunId                                // how long has this been outstanding
}

ValidationRun {
  baselineId | artifactVersionIds[]
  gate?                                         // ★ which gate this run is evidence for
  rulePackVersion, camundaTargetProfileId, standardsProfileId
  startedAt, finishedAt, status, summary
  findings[]
}
```

### 4.1 Why `gates[]` and `severityByGate` exist

Before v2.0, gate coupling was **inferred from the layer** (L0→G1, L2–L5→G3, L6→G4) and severity was
a single value per rule. That simplification broke in two places:

- **Specification preconditions block G2**, which no layer mapped to. They were enforced only as
  domain invariants, with no rule identity — invisible in the validation report, uncitable in a
  ticket, untranslatable.
- **Some conditions are legitimately tolerable at one gate and not another.** An approved
  requirement with no realisation is work-in-progress at G3 and a defect at G4.

`gates[]` makes the coupling explicit; `severityByGate` makes the tolerance explicit. One addition
solves both, and the engine now states its behaviour rather than implying it.

**Rules keep a single severity unless there is a stated reason not to.** Gate-scoped severity is the
exception, not the pattern — currently two rules use it.

### 4.2 Deterministic finding identity

Finding IDs are `<ruleId>@<targetRef>`, so the same defect in two runs yields the same ID. This makes
findings trackable ("3 new, 5 resolved"), waivable against a specific baseline, and diffable — rather
than an anonymous list regenerated from scratch each time.

## 5. Localisation-ready messages

Findings are **never pre-formatted strings**. A rule emits a **message key plus named parameters**;
rendering happens per locale at display or export time.

```
messageCatalogue["L4-SPEC-005.missing_interface"] = {
  en: "Step '{stepName}' is automated but has no integration specification.",
  ar: "الخطوة '{stepName}' آلية ولكن لا يوجد لها مواصفة تكامل."
}
messageCatalogue["L4-SPEC-005.fix"] = {
  en: "Add a ServiceInterface to this step in the Specification Studio.",
  ar: "أضف مواصفة خدمة لهذه الخطوة في محرر المواصفات."
}
```

Rules ([ADR-0023](../adr/ADR-0023-unicode-bilingual-architecture.md)):

| # | Rule |
|---|---|
| M1 | **Rule IDs are ASCII and locale-independent.** `L4-SPEC-005` is citable in a ticket, an email, or a comment in either language |
| M2 | Parameters are **named**, never positional. Positional placeholders break when a translation reorders them, which happens constantly between English and Arabic |
| M3 | Messages are **ICU-formatted**, so plurals and gendered forms are the catalogue's problem, not the rule's |
| M4 | Interpolated values that may be Arabic inside an English message (or vice versa) are **bidi-isolated** at render time |
| M5 | Message catalogues ship **with the rule pack** and are versioned with it, so a historical finding renders as it did when raised |
| M6 | A missing translation falls back to English **and** raises `L5-I18N-001`; it never renders an empty or key-shaped string |
| M7 | Exports (validation report, traceability matrix) render in the project display language, with the rule ID always present alongside |

## 6. Rule packs and profiles

Rules are selected by **two** independent axes, so a Camunda upgrade and an organisational standards
change are separate events:

```
active rules = rulePack(camundaTargetProfileId) ∪ rulePack(standardsProfileId) ∪ coreRules
```

| Axis | Governs |
|---|---|
| **Camunda target profile** | L3 executability and supported constructs |
| **Standards profile** | L5 governance, thresholds, and additional specification rules |

Rule packs are versioned and recorded on every `ValidationRun` and `ArtifactVersion`, so "what did
valid mean when this was approved?" is answerable.

## 7. Camunda executability (L3)

Per [ADR-0026](../adr/ADR-0026-static-validation-first.md), the MVP uses **static validation only**:
Camunda's own static compatibility lint pinned per profile (the authoritative oracle, not
reimplemented), our profile-construct rules, FEEL parsing and type checking, element-template
conformance, and cross-artifact dependency resolution.

### 7.1 The deferred `DeploymentValidator` port

```
DeploymentValidator {                     // interface exists; no adapter in the MVP
  validate(packageRef, targetProfile) → DeploymentValidationResult
}
```

Sandbox availability is TBD and does not block Phase 0. Until an adapter exists, L3 findings carry
the qualifier *"validated statically against profile X; not deployment-verified"* (`L3-CAM-014`).
No adapter may target a non-sandbox cluster, and no write path to any cluster exists in the MVP
([ADR-0018](../adr/ADR-0018-handoff-ownership-boundary.md)).

## 8. Specification validation (L4-SPEC) — new in v2.0

The G2 gate approves the technology-neutral Business Process Specification. It is the **last point at
which a human reviews the process in business language**, and it read-locks generation.

Its preconditions were previously enforced only as domain invariants (D5, D6) and gate policy. They
blocked correctly, but had **no rule identity** — so they were absent from the validation report,
uncitable, untrackable across runs, untranslatable, and not profile-extensible. Every other blocking
condition in the system has an ID.

`L4-SPEC-001 … L4-SPEC-010` close that gap ([validation-rule-catalog.md](validation-rule-catalog.md)).
They block **G2**. Because generation is read-locked behind G2, blocking G2 automatically prevents
generation — there is one enforcement point, not two.

Domain invariants D5 and D6 remain in force. The rules do not replace them; they give the same
conditions a reportable, citable identity. Defence in depth: the invariant makes the state
unreachable, the rule makes it explicable.

## 9. Cross-artifact dependency validation

A distinct step over the `ArtifactDependency` graph within a baseline: every referenced form,
decision, process, template and job type exists; version consistency within the baseline;
**variable contract alignment** — a task's output mapping must satisfy the input requirements of
every downstream decision, form and expression on every path reaching them; no cycles among call
activities; no orphan artifacts.

Variable contract alignment is the highest-value check in this group. It catches the most common
class of Camunda runtime failure at design time — and `L4-SPEC-010` now catches its
specification-level precursor even earlier.

## 10. Waivers

```
Waiver { findingId, justification, approvedBy, approvedAt, expiresAt? }
```

- Only WARNING findings are waivable. ERROR findings are never waivable.
- A waiver binds to a **specific finding ID on a specific baseline** and does not carry forward
  silently to a new baseline where the same rule may indicate a different problem.
- Waivered findings appear in the release validation report and the handoff package.
- An expired waiver reopens G3.
- For a gate-scoped rule, a waiver is valid **only at gates where it is a WARNING**.

## 11. Auto-fix policy

Auto-fix is offered **only** for provably safe, mechanical corrections expressible as
specification-level changes — naming normalisation, a profile default retry count, a missing
translation placeholder.

Every auto-fix is a **reviewable specification diff**, never applied silently, never applied to an
artifact. An auto-fix that would alter process semantics does not exist.

## 12. Execution model

| Mode | When | Scope |
|---|---|---|
| **Incremental** | On save in any editor | Touched entity plus immediate dependents; sub-second |
| **Specification** | On save in the Specification Studio | `L4-SPEC-*` plus L1 — so G2 blockers surface while editing, not at submission |
| **Artifact** | After generating an artifact | That artifact plus its dependencies |
| **Full run** | Required for a gate | The entire baseline, all layers, recorded as a `ValidationRun` with its `gate` |

Only a full run can satisfy a gate, and an `Approval` binds to the specific run that produced its
evidence ([ADR-0017](../adr/ADR-0017-approval-as-baseline-signature.md)).

## 13. Findings in the UI

| Surface | Behaviour |
|---|---|
| Validation panel | Grouped by artifact/specification and severity; filterable by layer and gate; each row jumps to its target |
| Specification Studio | `L4-SPEC-*` findings pinned to the offending step, flow, decision point or exception |
| Artifact viewer overlay | Findings pinned to the exact element, rule row or field |
| Inspector "HOW" section | Findings on the selected element, each with the spec-level fix |
| Gate panel | Blocking findings for **this** gate, resolved through `severityByGate` |
| Trend | New / resolved / outstanding since the last run, using stable finding IDs |
| Narration | AI **may** explain a finding in plain language; it never decides one, and its narration is labelled commentary |

## 14. Test obligations

1. Every rule has a positive fixture (it fires) and a negative fixture (it does not).
2. Every rule has a message and a fix hint in **both** catalogue languages, or `L5-I18N-001` fires.
3. Deterministic finding IDs: the same defect in two runs yields the same ID.
4. **Gate resolution:** a gate-scoped rule resolves to the correct severity at each gate in
   `gates[]`, and a waiver is rejected at a gate where it is an ERROR.
5. Structural-impossibility rules (L1/L2 subset) are exercised with **synthetic invalid IR** to prove
   they would catch a compiler defect.
6. `L4-SPEC-*` fixtures include a specification that violates each rule individually, and one that
   violates none.
7. Waiver expiry reopens the gate.
8. A full run over the golden corpus produces zero errors — the definition of the corpus being valid,
   and therefore a regression detector for the compilers.
