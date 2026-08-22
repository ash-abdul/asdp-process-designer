# ADR-0024: ASCII Technical Identifiers, Unicode Display Names

> **Status:** Approved · **Date:** 2026-08-22 · **Reversibility:** Hard
> **Related:** ADR-0023, docs/10-architecture/multilingual-architecture.md §5

## Context

With Arabic in scope, process steps, data fields, decisions, and forms will have Arabic names. Some
of those names become technical identifiers: BPMN element IDs, process and decision keys, form
field keys, process variable names, FEEL identifiers, and job types.

Arabic characters are technically permissible in some of these positions and not others. Where
they are permissible, they work inconsistently across FEEL evaluation, connector configuration,
worker code in various languages, log aggregation, monitoring queries, and shell tooling. The
failure mode is a latent runtime defect discovered in production, in a specific tool, months
later.

## Decision

**Technical identifiers MUST be ASCII. Display names MUST preserve Unicode.**

| Thing | Rule |
|---|---|
| BPMN/DMN element IDs, process keys, decision keys, form IDs | ASCII `NCName`-safe: `[A-Za-z_][A-Za-z0-9_.-]*` |
| **Process variable names, FEEL identifiers, job types** | **ASCII only** |
| `DataField.name` | ASCII (the identifier) |
| `DataField.displayName`, element `name`, labels, documentation, annotations | Full Unicode, language-tagged, RTL-safe |
| String **values** inside FEEL, form data, and process variables | Full Unicode — Arabic content is data, and must round-trip unchanged |
| Glossary terms | Bilingual: `termEn` and `termAr` |

Identifier generation **MUST** be deterministic and **stable across regeneration** for unchanged
specification elements, derived from the specification element's identity rather than its position.

The generation strategy is the hybrid in open decision OD-4: English name or glossary translation
if available → else transliteration → else sequential, always with a stable discriminator. The
ID → display-name mapping is stored.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Unicode identifiers throughout | Works in some tools and fails in others; produces latent production defects that are extremely hard to diagnose |
| Require English names for everything | Excessive friction, and it forces analysts to invent English names for Arabic business concepts |
| Auto-translate names to English for identifiers | Translation is non-deterministic and would make IDs unstable across regenerations — fatal for diff review and for deployed-process continuity |
| Hash-based identifiers only | Unreadable in Camunda Operate, logs, and worker code, where a human has to recognise them |

## Consequences

**Positive**

- FEEL expressions, connector configuration, worker code, logs, and monitoring queries are all
  safe.
- Arabic labels are fully preserved and displayed.
- IDs are stable across regeneration, which diff-based review depends on absolutely.
- Camunda engineers receiving the package see identifiers they can work with.

**Negative**

- Transliterated identifiers are readable to some audiences and not others; the ID is a technical
  handle, not documentation.
- The ID → display-name mapping must be maintained and exported so operators can connect a log
  entry to a business step.
- Requires a transliteration table for Arabic, with its own conventions to settle (OD-4).

## Enforcement

- Domain invariant D7: ASCII-safety for `DataField.name`, `ServiceInterface.jobType`, and all
  generated identifiers.
- IR invariant IR-13: all identifiers unique and ASCII `NCName`-safe.
- Validation rule `L5-I18N-002`: a non-ASCII character in a technical identifier, job type, or FEEL
  identifier is a **blocking error**, and is not profile-adjustable.
- Identifier minting is a pure, deterministic function with stability tests across regeneration.
