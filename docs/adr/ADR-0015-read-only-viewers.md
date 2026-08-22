# ADR-0015: Read-Only Artifact Viewers

> **Status:** Approved · **Date:** 2026-08-22 · **Reversibility:** Moderate
> **Related:** ADR-0001, ADR-0002, docs/00-product/personas-and-journey.md §4

## Context

Artifacts must be reviewable: navigable, inspectable, traceable, comparable. They must not be
editable. Camunda's rendering toolkits ship both viewer and editor distributions, and it would be
easy to load the editor and merely hide the palette.

Hiding an editor is not the same as not having one. Hidden affordances get re-exposed by a later
change, a keyboard shortcut, or a well-meaning feature request.

## Decision

Artifacts **MUST** be rendered by **viewer distributions only**:

- BPMN: `bpmn-js` **NavigatedViewer** — pan, zoom, select. Modelling modules **MUST NOT** be
  loaded.
- DMN: `dmn-js` **Viewer** — DRD, read-only decision tables, literal expressions.
- Forms: `@bpmn-io/form-js-viewer` — interactive preview populated with test-scenario data.

Properties panels, palettes, context pads, and element-template editing UIs **MUST NOT** be
included in the build.

One shared **viewer shell** **MUST** provide: navigate, inspect (four-part inspector), overlay
(traceability, epistemic, validation, change-since-version, directive-influenced), compare, and
explain.

**Non-diagram views MUST be first-class**, not extras: process outline, path table, decision
matrix, variable-flow table.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Editor distribution with the palette hidden | Editing capability present in the build; will be re-exposed eventually. Absence is stronger than concealment |
| Custom renderer built in-house | Loses fidelity with Camunda's rendering, which is precisely what makes the artifact trustworthy |
| Static image rendering | No selection, no inspection, no traceability interaction — the core review capability |
| Diagram-only review | Fails accessibility, fails RTL content, and answers several review questions poorly |

## Consequences

**Positive**

- Far less integration effort than three editor embeddings — the budget released by the boundary,
  redirected to layout and the Specification Studio.
- Editing is structurally absent rather than hidden.
- The form **preview** is genuinely better than an editor for approval: a business owner sees what
  the end user will see, with real data, in their language.
- The non-diagram views deliver accessibility and answer questions (variable flow, path coverage)
  that a diagram answers badly.

**Negative**

- Some viewer distributions offer fewer extension points than their editor counterparts; overlays
  may need a custom layer above the renderer (Spike S1).
- Arabic label rendering in the viewer is unverified (Spike S3), with an overlay text layer as the
  documented fallback.
- Four non-diagram views are real UI work that a diagram-only product would skip.

## Enforcement

- Build-level: editor packages are not dependencies. Their absence is asserted by a dependency
  check.
- The viewer shell exposes no mutation API.
- Accessibility tests cover keyboard traversal and screen-reader navigation of the outline view.
- E2E tests assert RTL rendering of labels and highlights.
