# Form Generation — FormSpec to Camunda Forms

> **Status:** Approved (Phase 0) · **Version:** 1.0 · **Updated:** 2026-08-22
> **Related:** [product-boundary.md](../00-product/product-boundary.md), [ADR-0015](../adr/ADR-0015-read-only-viewers.md), [multilingual-architecture.md](../10-architecture/multilingual-architecture.md)

Forms are generated from the typed data model and reviewed as an interactive preview. There is
no form editor; `FormSpec` is the editable surface.

---

## 1. Generation is driven by the data model, not by prose

Every `SpecStep` of kind `manual` yields one form. Component selection is **deterministic** from
the bound `DataField` type:

| `DataField.type` + constraints | Component |
|---|---|
| `string` | textfield |
| `string` with `maxLength > 200` or `multiline` | textarea |
| `string` with `enum` (≤ 5 values) | radio |
| `string` with `enum` (> 5 values) | select |
| `string[]` with `enum` | checklist / taglist |
| `boolean` | checkbox |
| `number` | number (with min/max/step from constraints) |
| `number` with currency semantics | number + currency prefix from the standards profile |
| `date` / `datetime` | datetime (date, time, or both per constraint) |
| `duration` | textfield with ISO-8601 duration validation |
| `file` | filepicker |
| `object` / `array` (structured) | dynamic list or group, per profile support |
| computed / derived | read-only expression field |

AI contributes **presentation only**: labels, help text, grouping, section titles, and field
order. It does not choose components, does not invent fields, and does not define validation.
Structure comes from the data model; wording comes from the AI proposal and human editing.

## 2. Pipeline

```
SpecStep{kind: manual} + DataEntity/DataField + Requirements
        │
        │  AI: PROPOSE_FORM_SPEC — grouping, ordering, labels, help text
        ▼
   FormSpec  (human-editable — the editable form surface)
        │
        │  DETERMINISTIC:
        │    · every field key resolves to a registered DataField
        │    · component ↔ type compatibility
        │    · required-field alignment with the step's declared inputs
        │    · validation rules derived from DataField constraints
        │    · PII-flagged fields carry the profile's declared handling
        ▼
   compiler-forms → Camunda form JSON
        │
        ▼
   form-js Viewer — INTERACTIVE PREVIEW, populated with test-scenario data
```

## 3. The preview is better than an editor for review

An interactive preview lets a business owner approve **what the end user will actually see**,
populated with realistic data from a chosen test scenario, in the language they will see it in.
An editor shows a component tree, which is a developer's view of a form. For the approval
purpose this product serves, the preview is the superior artifact — this is one place where the
read-only boundary improves the product rather than constraining it.

Preview capabilities: switch display language (Arabic/English), switch scenario data, toggle
validation display, view as a specific actor, and inspect any field for its requirement chain.

## 4. Bilingual forms

| Concern | Handling |
|---|---|
| Labels and help text | `LocalizedText`; both languages generated where available |
| Direction | Per-field `dir` from the label's language; the form container direction from the project display language |
| Mixed-content labels | Bidi-isolated composition |
| Field keys | **ASCII** — from `DataField.name`, never from the label ([ADR-0024](../adr/ADR-0024-ascii-identifiers-unicode-names.md)) |
| Validation messages | Localised; sourced from the standards profile, not hard-coded in the compiler |
| Number and date input | Locale-aware display; stored values are canonical (ASCII digits, ISO dates) |
| Layout | Logical properties throughout, so an RTL form is a rendering outcome, not a separate form |

Where a translation is missing, the form is generated with the available language and a finding
is raised (`L5-I18N-001`) rather than silently emitting an untranslated label into an Arabic
form.

## 5. Screenshots as a form source

When a screenshot of an existing UI is ingested, vision extraction proposes candidate fields
with bounding-box provenance. These are reconciled against the Domain Model Registry:

| Outcome | Handling |
|---|---|
| Field matches a registered `DataField` | Bound; evidence anchored to the screenshot region |
| Field does not match | Proposed as a **new** `DataField` requiring human confirmation |
| Registered field absent from the screenshot | Reported — the screenshot may be an older version of the screen |

Extraction from a screenshot is capped at L2 interpretation, exactly like a diagram image. A
picture of a screen is not a specification, but it is excellent evidence, and turning "here is
our current screen" into a governed, traceable form is a compelling and realistic intake path.

## 6. Validation

| Check | Layer |
|---|---|
| Field key resolves to a registered `DataField` | L2 |
| Free-typed key not bound to the registry | L2 warning — unbound keys are how variable-name mismatches reach production |
| Component ↔ type compatibility | L2 |
| Required fields cover the step's declared inputs | L4 |
| Exactly one form per user task | L3 |
| Form key referenced by the BPMN exists in the baseline | L3 |
| PII-flagged field has declared handling | L5 |
| Every field traces to a requirement | L4 |
| Missing translation for the project display language | L5 |
| Form referenced by no user task (orphan) | L4 — indicates a compiler or specification defect |

## 7. Scope

| In scope (MVP) | Out of scope (MVP) |
|---|---|
| Static forms with sections and groups | Custom components |
| Native conditional visibility expressions | Complex client-side logic beyond native conditions |
| Validation derived from data constraints | Form themes and custom styling |
| Read-only and computed fields | Multi-page wizards beyond native support |
| Start forms and task forms | Embedded sub-forms |
| Bilingual labels and help text | Per-user language override at runtime (a Camunda/Tasklist concern) |

## 8. Test obligations

1. Golden fixtures per Camunda target profile covering every component mapping.
2. Type-compatibility rejection tests (e.g. a `select` bound to a `boolean`).
3. Arabic label round-trip through canonicalisation (NFC stability, single hash).
4. RTL preview rendering assertions in E2E.
5. Screenshot → candidate field reconciliation against a seeded registry.
6. Missing-translation finding raised, not silently emitted.
7. Every generated field carries a `compiled_to` trace edge (T4).
