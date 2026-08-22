# Process Intermediate Representation (Process IR) v1.1

> **Status:** Approved (Phase 0) · **Version:** 1.1 (IR schema `ir-1.1`) · **Updated:** 2026-08-22
> **Revision:** v1.1 supersedes v1.0. Added event handlers (event subprocesses), compensation,
> multiple triggers, scope-local outcomes, and centrally declared event definitions. Renamed node
> kinds to semantic names. Invariant set extended to IR-1 … IR-27.
> **Related:** [ADR-0005](../adr/ADR-0005-ir-first-compilation.md), [ADR-0006](../adr/ADR-0006-correct-by-construction-ir.md), [pattern-mapping.md](pattern-mapping.md), [layout-architecture.md](layout-architecture.md)

The IR is the single bridge between human-approved specifications and generated artifacts.
**AI may propose an IR; only compilers may consume it; nothing else may write an artifact.**

---

## 1. What the IR is, in plain language

The IR is a **precise, engine-neutral description of what the process does**, sitting between the
business specification a person approves and the BPMN file a machine runs.

It exists so that no language model ever writes XML. The model may propose the *shape*; a
deterministic compiler turns that shape into a file.

It describes the process as **nested blocks of work**, not as boxes and arrows: *"this is a
sequence of three things; the second is a decision with three possible results; the third result
is itself a sequence of two things."* Arrows are **calculated** from the nesting, never drawn.

**The IR is not BPMN.** It uses business-process vocabulary (`AwaitMessage`, `Interruption`,
`outcome`) rather than BPMN vocabulary (`receiveTask`, `boundaryEvent`, `endEvent`), it carries no
geometry, no namespaces, and no `zeebe:` attributes, and it is deliberately narrower than BPMN. The
mapping to BPMN lives in the compiler and is selected by the Camunda target profile.

## 2. Position in the pipeline

```
ProcessSpec + DecisionSpec + FormSpec + ServiceInterface + Directives
        │  deterministic pattern mapping  (pattern-mapping.md)
        ▼
   ProcessIR draft
        │  AI refinement — SCHEMA-CONSTRAINED PROPOSAL, human-accepted
        ▼
   ProcessIR candidate
        │  IR INVARIANT CHECK  IR-1 … IR-27  ← deterministic, blocking
        ▼                                      failure ⇒ SPECIFICATION-level finding,
   ProcessIR (versioned artifact)               never a repaired IR, never an emitted artifact
        │
   ┌────┴──────────────┬──────────────────┐
   ▼                   ▼                  ▼
compiler-bpmn     compiler-dmn     compiler-forms
   │
   ▼
layout (automatic)  → see layout-architecture.md
```

---

## 3. The structural choice: a region tree

Control flow is a **nested tree of regions**. Sequence flows are **derived** from the tree; they
are never independent objects.

```
Region =
    Sequence   { children: Region[] }

  | Branch     { style: exclusive | inclusive | first_event,
                 decisionRef?,                         // exclusive / inclusive
                 cases: [ { guard, body: Region } ],
                 defaultCase?: { body: Region },
                 mergeMode: converge | terminate }      // owns its split AND its merge

  | Parallel   { branches: Region[], joinMode: all | any }

  | Loop       { kind: while | until | for_each,
                 condition? | collectionRef?,
                 body: Region,
                 concurrency?: sequential | parallel,   // for_each only
                 completionCondition? }

  | Activity   { nodeId }                               // leaf → a Node

  | Subprocess { name, body: Region,
                 interruptions: Interruption[],
                 eventHandlers: EventHandler[],         // ★ v1.1
                 localOutcomes: Outcome[] }             // ★ v1.1

  | Terminate  { outcomeRef }                           // an explicit end state
```

### 3.1 Why a region tree, and what was rejected

| Alternative | Rejected because |
|---|---|
| **Free node/edge graph** with post-hoc validation | Every structural defect must be *detected* rather than *prevented*; a compiler bug could emit an unreachable element; and layout becomes an arbitrary-graph problem, which is the hard case |
| **Graph IR with a "structured" validation profile** | The permissive representation still exists, so the permissive path eventually gets used |
| **BPMN-shaped AST** (a typed mirror of BPMN XML) | Inherits BPMN's permissiveness, couples the IR to one engine's vocabulary, and defeats the version-agnostic core ([ADR-0025](../adr/ADR-0025-camunda-version-profiles.md)) |

### 3.2 Benefits

**Structural validity by construction.** These are not checked — they are unrepresentable:

| Impossible | Because |
|---|---|
| Dangling sequence flow | Flows are derived from the tree |
| Unpaired or crossed gateways | A `Branch` owns its split and its merge |
| Unreachable element | Every node is a leaf of a reachable region |
| Missing default path | `defaultCase` required unless the case set is provably exhaustive |
| Deadlocking parallel join | `Parallel` owns its join; branch and join arity match by definition |
| Goto-style back-edge | Backward flow exists only as `Loop` |

**Tractable automatic layout.** Laying out a nested tree is recursive composition of independently
laid-out blocks with declared entry and exit ports. Laying out an arbitrary graph legibly is not.
Because users cannot reposition elements, this is the main mitigation for the layout risk — and it
is why an established layout library is likely to be sufficient
([layout-architecture.md](layout-architecture.md)).

**Complete path enumeration** for test coverage, from the tree structure
([test-scenario-model.md](../40-quality/test-scenario-model.md) §2).

### 3.3 Limitations, stated plainly

1. **Genuinely unstructured control flow cannot be represented** — arbitrary jumps between
   branches, overlapping cycles, gateways whose split and merge do not correspond. This is the one
   real expressive limit, and it is deliberate (§8).
2. **Structured loops only.** A `Loop` has one entry and one exit. A process with two different
   ways of re-entering an earlier stage must express that as a `Loop` containing a `Branch`.
3. **One executable process per IR document.** Reusable sub-processes are separate IR documents
   referenced by `CallProcess`.

---

## 4. Construct vocabulary

For each: business meaning · BPMN mapping · invariants.

### 4.1 Entry points — `triggers[]`  ★ relaxed in v1.1

**Meaning.** How the process can start. A process may have **more than one** trigger — a form
submission *or* an inbound message *or* a schedule.

```
Trigger {
  triggerId
  kind      manual_submission | message | scheduled | signal
  formRef?                              // manual_submission
  messageRef?                           // message  → messages[]
  scheduleExpr?                         // scheduled
  signalRef?                            // signal   → signals[]
  eventRef                              // BusinessEvent traceability
}
```

| Kind | BPMN mapping |
|---|---|
| `manual_submission` | `startEvent` (none) + `zeebe:formDefinition` for a start form |
| `message` | `startEvent` + `messageEventDefinition` + `zeebe:subscription` |
| `scheduled` | `startEvent` + `timerEventDefinition` |
| `signal` | `startEvent` + `signalEventDefinition` |

**Invariants:** IR-1 (≥1 trigger), IR-2 (trigger kinds supported by the profile), IR-3 (each
`messageRef`/`signalRef` resolves).

> v1.0 permitted exactly one start. That forbade a legitimate and common Camunda design — a process
> startable by form *or* by message. Corrected.

### 4.2 Exit points — `outcomes[]`  ★ scoped in v1.1

**Meaning.** A named business end state. `scope: process` ends the whole process; `scope: local`
ends an enclosing `Subprocess` and, for `kind: error`, propagates to an `Interruption` on it.

```
Outcome {
  outcomeId, scope: process | local, ownerRegionId?      // local ⇒ owning Subprocess
  kind      completed | rejected | cancelled | error | escalated | terminated
  label: LocalizedText
  errorRef?          // kind = error       → errors[]
  escalationRef?     // kind = escalated   → escalations[]
}
```

| Kind | BPMN mapping |
|---|---|
| `completed` / `rejected` / `cancelled` | `endEvent` (none), distinguished by label and documentation |
| `error` | `endEvent` + `errorEventDefinition` |
| `escalated` | `endEvent` + `escalationEventDefinition` |
| `terminated` | `endEvent` + `terminateEventDefinition` — requires an explicit rationale |

**Invariants:** IR-4 (every path reaches a `Terminate`), IR-5 (`error`/`escalated` outcomes declare
a code), IR-6 (a `local` outcome of kind `error` has a matching `Interruption` on its owning
`Subprocess`, or the profile's propagation rules are satisfied), IR-7 (no two outcomes share an
error code with different meaning).

> v1.0 had process-level ends only, leaving error propagation out of an embedded subprocess
> undefined. Corrected.

### 4.3 Work items — `nodes[]`

Leaves of the region tree. Renamed in v1.1 to semantic names, so the IR reads as process language
rather than BPMN.

| Node | Business meaning | BPMN mapping | Key invariants |
|---|---|---|---|
| **`HumanTask`** | A person does something and records the result | `userTask` + `zeebe:formDefinition`; profile chooses the user-task implementation; `zeebe:assignmentDefinition` from the actor; due/follow-up from SLA | IR-8: has a `formRef`; actor resolves |
| **`AutomatedTask`** | A system performs work without a person | `serviceTask` + `zeebe:taskDefinition` + `zeebe:ioMapping`; connector template if declared | IR-9: has an `interfaceRef` with a non-empty ASCII job type |
| **`DecisionActivity`** | A determination is made by applying business rules | `businessRuleTask` + `zeebe:calledDecision` with a declared result variable | IR-10: `decisionRef` resolves; result variable declared and typed |
| **`SendMessage`** | The process tells someone or something | `sendTask` (or `serviceTask` with a connector) driven by an interface or notification | IR-11: has an `interfaceRef` or `notificationRef` |
| **`AwaitMessage`** | The process waits for something to arrive | `receiveTask` + `zeebe:subscription` with a correlation key | IR-12: `messageRef` resolves; correlation key expression present |
| **`AwaitTime`** | The process waits until a moment or for a duration | `intermediateCatchEvent` + `timerEventDefinition` | IR-13: timer expression valid for the profile |
| **`AwaitSignal`** | The process waits for a broadcast condition | `intermediateCatchEvent` + `signalEventDefinition` | `signalRef` resolves |
| **`CallProcess`** | Delegate a whole named sub-process that exists in its own right | `callActivity` + `zeebe:calledElement` + IO mapping | IR-14: target process key resolves within the baseline; no call cycles |
| **`ManualRecord`** | Work happens off-system; we record that it happened | `manualTask` | — |
| **`CompensationAction`** ★ | Undo the effect of an earlier completed activity | `serviceTask`/`userTask` marked `isForCompensation` + `compensateEventDefinition` wiring | IR-15: referenced by exactly one `Compensation` pairing |

**Deliberately absent:** script tasks (no engine-side scripting in generated processes), business
rule logic inline in a task (decisions are always externalised so they are traceable at rule-row
level), and any send/receive not backed by a declared interface, notification, or message.

### 4.4 Branching — `Branch`

| Style | Business meaning | BPMN mapping |
|---|---|---|
| `exclusive` | Exactly one outcome applies | `exclusiveGateway` split, conditions on outgoing flows, `exclusiveGateway` join |
| `inclusive` | More than one outcome may apply simultaneously | `inclusiveGateway` split and join |
| `first_event` | Whichever event happens first decides the path | `eventBasedGateway` + catch events |

**Invariants:** IR-16 (every case has a non-empty guard), IR-17 (`exclusive`/`inclusive` have a
`defaultCase` unless provably exhaustive), IR-18 (`inclusive` requires an explicit specification-level
declaration that outcomes are non-exclusive — it is never inferred), IR-19 (`first_event` cases are
all event-triggered).

> **The `inclusive` style is only reachable when the specification declares
> `SpecDecisionPoint.outcomeExclusivity = multiple`.** Inclusive joins are a well-known source of
> runtime surprise, so the choice is a business statement, not a generation preference.

### 4.5 Concurrency — `Parallel`

**Meaning.** Independent work proceeds at the same time. `joinMode: all` waits for every branch;
`any` proceeds when the first completes and cancels the rest.

**BPMN mapping:** `parallelGateway` split and join; `joinMode: any` compiles to an
event-based/interrupting construct per the profile.

**Invariants:** IR-20 (branches have no data dependency on each other — checked via the variable
graph), IR-21 (arity of split and join match, true by construction).

### 4.6 Repetition — `Loop`

| Kind | Business meaning | BPMN mapping |
|---|---|---|
| `while` | Repeat while a condition holds, testing before each pass | Structured back-edge via an `exclusiveGateway` |
| `until` | Do the work, then repeat while a condition holds | Structured back-edge, test after |
| `for_each` | Do the work once per item in a collection | `multiInstanceLoopCharacteristics` + `zeebe:loopCharacteristics`; `concurrency` selects sequential or parallel |

`for_each` may wrap a single `Activity` **or** a `Subprocess` region, giving multi-instance
sub-processes.

**Invariants:** IR-22 (a termination construct exists: condition, or a bounded collection
reference), IR-23 (`for_each` has a `collectionRef` resolving to a collection-typed variable).

### 4.7 Scopes — `Subprocess`

**Meaning.** A named group of work treated as a unit, so that a failure, a timeout, or an event can
be handled for the group as a whole, and so that a large process can be read in parts.

**BPMN mapping:** `subProcess` (embedded), with attached boundary events and contained event
subprocesses.

**Invariants:** IR-24 (nesting depth ≤ the profile maximum; exceeding it yields an
extraction proposal, not a failure), IR-25 (a `local` outcome is owned by exactly one
`Subprocess`).

### 4.8 Interruptions — `Interruption` (boundary events)

**Meaning.** Something can happen *to* a work item or a scope while it is running.

```
Interruption {
  interruptionId
  attachedTo    nodeId | subprocessRegionId
  kind          error | timeout | message | escalation | signal | condition
  interrupts    bool                       // false ⇒ the activity continues
  trigger       { errorRef | timerExpr | messageRef | escalationRef | signalRef | conditionExpr }
  handler       Region
  specRef       SpecException | SpecEscalation
}
```

| Kind | BPMN mapping |
|---|---|
| `error` | `boundaryEvent` + `errorEventDefinition` (always interrupting) |
| `timeout` | `boundaryEvent` + `timerEventDefinition`; `interrupts` sets `cancelActivity` |
| `message` | `boundaryEvent` + `messageEventDefinition` + `zeebe:subscription` |
| `escalation` | `boundaryEvent` + `escalationEventDefinition` |
| `signal` | `boundaryEvent` + `signalEventDefinition` |
| `condition` | `boundaryEvent` + `conditionalEventDefinition`, **profile-gated** |

**Invariants:** IR-26 (`attachedTo` resolves; `kind: error` implies `interrupts: true`; the trigger
reference resolves; the kind is supported by the profile).

### 4.9 Event handlers — `EventHandler` (event subprocesses)  ★ new in v1.1

**Meaning.** *"While this scope is active, if X happens, do Y."* Unlike an interruption, it is not
attached to one activity — it belongs to the whole scope, and typically runs **without** stopping
the main flow.

```
EventHandler {
  handlerId
  scope         "process" | subprocessRegionId
  kind          message | timer | error | escalation | signal
  interrupts    bool                       // false ⇒ main flow continues (the common case)
  trigger       { messageRef | timerExpr | errorRef | escalationRef | signalRef }
  handler       Region
  specRef       SpecException | SpecEscalation | SpecIntegration
}
```

**BPMN mapping:** `subProcess` with `triggeredByEvent="true"` containing a start event of the
matching type; `interrupts` selects an interrupting or non-interrupting start event.

**Typical uses:** a cancellation request arriving at any point; a daily reminder while a case is
open; a catch-all error handler for a scope.

**Invariants:** IR-27 (scope resolves; the trigger reference resolves; a non-interrupting handler
does not write a variable the main flow reads — checked via the variable graph, because that is a
race condition, not a modelling preference).

> v1.0 had no event-subprocess construct. This was the largest gap found in review: it is a
> standard Camunda 8 pattern with no expressible equivalent.

### 4.10 Compensation — `Compensation`  ★ new in v1.1

**Meaning.** *"If we have to undo this later, here is how."* A completed activity is paired with the
action that reverses its effect, and compensation is triggered when a scope fails or is cancelled.

```
Compensation {
  compensationId
  compensates       nodeId                    // the activity whose effect is undone
  action            nodeId                    // a CompensationAction node
  triggeredBy       outcomeRef | interruptionId | handlerId
  scope             subprocessRegionId | "process"
}
```

**BPMN mapping:** a compensation boundary event on the compensated activity, an
`isForCompensation` activity, and a compensation throw event in the triggering handler. Exact shape
and support are **profile-declared**; where the profile does not support compensation, IR-2/IR-26
reject it with a named alternative (an explicit reversal path).

**Invariants:** the compensated activity is on a path that can complete before the trigger; the
action node is referenced by exactly one pairing; the profile supports compensation.

> v1.0 referenced `SpecException.compensation` in the pattern table but had no IR construct. It was
> unimplementable as specified. Corrected.

### 4.11 Declared event definitions  ★ new in v1.1

Messages, errors, escalations, and signals are declared **once** and referenced, rather than
repeated inline. This makes correlation and code consistency checkable rather than incidental.

```
messages[]    { messageRef, name, correlationKeyExpr }
errors[]      { errorRef, code (ASCII), label: LocalizedText }
escalations[] { escalationRef, code (ASCII), label: LocalizedText }
signals[]     { signalRef, name }
```

**Invariants:** unique names and codes; every reference resolves; every declared definition is
referenced at least once; codes are ASCII
([ADR-0024](../adr/ADR-0024-ascii-identifiers-unicode-names.md)).

### 4.12 Data — `variables[]`

```
variables[] {
  name (ASCII), displayName: LocalizedText
  type          string | number | boolean | date | duration | object | array | file
  dataFieldRef                                // Domain Model Registry
  scope         process | local(regionId)
  producedBy[]  nodeId | triggerId
  consumedBy[]  nodeId | decisionRef | formRef | guard
  required, classification
}
```

**BPMN mapping:** `zeebe:ioMapping` entries and FEEL expressions.

**Invariant IR-28 (variable availability):** every variable read is produced on **every** path that
reaches the reader. This design-time check prevents the most common Camunda runtime failure — a FEEL
expression referencing a variable that does not exist on the taken path.

---

## 5. IR document shape

```
ProcessIR {
  irVersion "ir-1.1"
  processKey (ASCII NCName)
  name: LocalizedText
  documentation: LocalizedText
  camundaTargetProfileId              // the ONLY version-aware field; compilers only

  triggers[]      Trigger             // ★ one or more
  outcomes[]      Outcome             // ★ process- and scope-local
  variables[]     Variable
  actors[]        { actorRef, name: LocalizedText, kind, candidateGroupExpr }

  nodes[]         Node                // 10 kinds
  root:           Region              // the region tree

  interruptions[] Interruption
  eventHandlers[] EventHandler        // ★
  compensations[] Compensation        // ★

  messages[] · errors[] · escalations[] · signals[]        // ★ declared definitions
  decisions[]  { decisionRef, decisionKey, resultVariable, specDecisionRef }
  forms[]      { formRef, formKey, specFormRef }
  interfaces[] { interfaceRef, jobType (ASCII), specInterfaceRef }

  directivesApplied[] { directiveId, kind, affectedNodeIds[], affectedRegionIds[] }
  trace[] {                            // MANDATORY on every element — zero exceptions
    irElementId, specElementType, specElementId,
    requirementIds[], originKind: pattern_mapping | ai_refinement | directive,
    aiInteractionId?
  }
}
```

---

## 6. Invariant summary

| Group | Invariants |
|---|---|
| Entry / exit | IR-1 … IR-7 |
| Work items | IR-8 … IR-15 |
| Branching | IR-16 … IR-19 |
| Concurrency | IR-20, IR-21 |
| Repetition | IR-22, IR-23 |
| Scopes | IR-24, IR-25 |
| Attached behaviour | IR-26, IR-27 |
| Data | IR-28 |
| Cross-cutting | Unique ASCII identifiers · every element carries a `trace[]` entry · every construct supported by the active profile · region size within profile limits |

All are pure functions in `packages/process-ir`, unit-tested with **synthetic invalid IR** so they
would catch a compiler defect. A violation is validation rule `L2-IR-001`, blocking.

---

## 7. What AI may and may not do

| May propose | May never do |
|---|---|
| Branch style within what the specification permits | Emit XML or any serialised artifact |
| Grouping work into a `Subprocess` | Assign element identifiers |
| Whether an exception becomes an `Interruption` or a `Branch` case | Assign any geometry or coordinate |
| Whether a scope-wide concern becomes an `EventHandler` | Alter or relax any invariant |
| Event kind for a wait (`AwaitTime` vs `AwaitMessage`) | Introduce a construct absent from the profile |
| Names and labels, subject to convention normalisation | Add an element without a `specElementId` |
| Variable naming suggestions, normalised to ASCII by code | Choose a decision's hit policy (that is `DecisionSpec`) |
| Compensation pairings | Declare that outcomes are non-exclusive (that is the specification) |

Every AI-proposed change is a `Proposal`, diffable at region and node level, accepted or rejected by
a human, recorded with `originKind = ai_refinement`.

---

## 8. How the IR avoids constraining real-world Camunda designs

Six mechanisms, and one honest exclusion.

**1. Coverage of the constructs that matter.** Every construct in §4 maps to a real Camunda 8
pattern. The v1.1 additions closed the three gaps found in review: event subprocesses, compensation,
and multiple start events.

**2. Profile-declared capability, not hard-coded assumption.** What is available is declared by the
Camunda target profile ([ADR-0025](../adr/ADR-0025-camunda-version-profiles.md)). A construct the
profile supports becomes available without an IR change; a construct it lacks is rejected with a
named alternative rather than silently emitted.

**3. Named alternatives, never silent failure.** When a construct is unavailable or an invariant
fails, the output is a **specification-level finding** that names the offending elements and proposes
a restructuring. The user is never left with "cannot generate".

**4. Escape valves for the awkward cases:**

| Real-world need | IR expression |
|---|---|
| Cancellation possible at any point | `EventHandler{message, interrupts: true}` at process scope |
| Periodic reminder while a case is open | `EventHandler{timer, interrupts: false}` |
| Catch-all error handling for a stage | `EventHandler{error}` on a `Subprocess` |
| Timeout that does not stop the work | `Interruption{timeout, interrupts: false}` |
| Undo a completed booking | `Compensation` |
| Start by form or by message | multiple `triggers[]` |
| One of several waits proceeds | `Branch{first_event}` or `Parallel{joinMode: any}` |
| Per-item processing | `Loop{for_each}`, optionally wrapping a `Subprocess` |
| Reusable shared process | `CallProcess` |
| Scope-local failure that the caller handles | `Outcome{scope: local, kind: error}` + `Interruption{error}` |

**5. A documented extension process.** Adding a construct requires a vocabulary entry, a mapping
row, invariants, compiler support, golden fixtures per profile, a layout strategy, and an inspector
description template ([pattern-mapping.md](pattern-mapping.md) §8). The bar is deliberately high,
but the path is open and the IR is versioned.

**6. Handoff as the ultimate escape.** Detailed technical refinement that ASDP cannot express
belongs in Camunda after handoff, where it is legitimate work and is recorded as divergence on the
next cycle ([ADR-0018](../adr/ADR-0018-handoff-ownership-boundary.md)).

### 8.1 The one genuine exclusion

**Unstructured control flow** — arbitrary jumps between branches, overlapping cycles, gateways whose
split and merge do not correspond.

This is excluded on purpose. Such processes are also unreviewable by a business owner, unlayoutable
without manual intervention, and untestable by path enumeration — so they conflict with three other
product commitments, not merely with the IR. The documented responses are: restructure the
specification (usually revealing that the process was not actually understood), or hand off early
and complete the design in Camunda.

**Not excluded, deliberately deferred** — each with a profile flag and a named alternative:

| Deferred | Alternative today |
|---|---|
| Transaction subprocesses | `Subprocess` + explicit `Compensation` |
| Complex gateways | `Branch{inclusive}` or an explicit `DecisionActivity` |
| Link events | Restructure as nesting |
| Conditional start events | `scheduled` trigger + a first-step `DecisionActivity` |
| Ad-hoc subprocesses | Not deterministically validatable; no alternative offered |
| Pools / lanes / collaboration | Not executable in Zeebe; band ordering is a presentation hint |
| Escalation *throw* mid-flow | `Outcome{escalated}` on a local scope |
| Multi-instance completion conditions beyond simple counts | `Loop{for_each}` + a `Branch` inside the body |

---

## 9. Worked example

**Business requirement** *(policy-v3.pdf p.7, Arabic; sop-v2.docx §4)*
> Identity verification must complete within 3 business days.
> Applications above AED 50,000 require senior review.
> A customer may withdraw the application at any time before approval.

**Structured requirements (L4)**
```
REQ-0031  Identity verification must complete within 3 business days.        extracted · HIGH
REQ-0032  If verification exceeds 3 business days, notify Operations Supervisor
          without stopping verification.                                     inferred → confirmed
REQ-0033  Applications above AED 50,000 require senior review.               extracted · HIGH
REQ-0034  The customer may withdraw at any time before approval; the
          application is then closed as withdrawn.                            extracted · HIGH
```

**Business process specification** *(no BPMN vocabulary)*
```
ProcessSpec "Customer Onboarding"
  triggers: [ application submitted (form) ]
  Step 1  Verify identity        automated · IdentityService
          SLA 3 business days · escalation → Operations Supervisor (non-interrupting)  [0031,0032]
  Step 2  Assess application     decision · BR-007 · outcomeExclusivity = exclusive    [0033]
          outcomes: standard → Step 3 · senior_review → Step 4
  Step 3  Approve automatically  automated                                              [0033]
  Step 4  Senior review          manual · SeniorOfficer                                 [0033]
  Exception (process-wide): customer withdrawal → close as withdrawn (interrupting)      [0034]
  outcomes: approved · withdrawn
```

**Process IR**
```
triggers = [ { manual_submission, formRef: application_form } ]

outcomes = [ { end_approved,  process, completed, "Approved"  },
             { end_withdrawn, process, cancelled, "Withdrawn" } ]

messages = [ { msg_withdrawal, "ApplicationWithdrawal", correlationKeyExpr: "=applicationId" } ]

root = Sequence [
  Activity(verify_identity),
  Branch { style: exclusive, decisionRef: assess_application,
           cases: [ { guard: "standard"      → Sequence[ Activity(approve_auto) ] },
                    { guard: "senior_review" → Sequence[ Activity(senior_review) ] } ],
           defaultCase: → Terminate(end_withdrawn),
           mergeMode: converge },
  Terminate(end_approved) ]

interruptions = [ { attachedTo: verify_identity, kind: timeout, interrupts: false,
                    trigger: P3D,
                    handler: Sequence[ Activity(notify_supervisor) ],
                    specRef: esc_001 } ]

eventHandlers = [ { scope: "process", kind: message, interrupts: true,
                    trigger: msg_withdrawal,
                    handler: Sequence[ Activity(close_withdrawn),
                                       Terminate(end_withdrawn) ],
                    specRef: exc_002 } ]
```

**Generated BPMN** — deterministic, no model involvement, geometry from automatic layout
```
startEvent (form: application_form)
  → serviceTask "Verify identity"        zeebe:taskDefinition type="identity.verify"
      ⊙ boundaryEvent (timer P3D, cancelActivity=false)
            → serviceTask "Notify supervisor" → endEvent
  → businessRuleTask "Assess application" zeebe:calledDecision "assess_application"
  → exclusiveGateway ──[="standard"]──▶ serviceTask "Approve automatically" ──┐
                     ──[="senior_review"]──▶ userTask "Senior review" ────────┤
                     ──[default]──▶ endEvent "Withdrawn"                      │
                     ◀──────────── exclusiveGateway (join) ◀───────────────────┘
  → endEvent "Approved"

+ event subProcess (triggeredByEvent=true)
    messageStartEvent "ApplicationWithdrawal" (interrupting)
      → serviceTask "Close as withdrawn" → endEvent "Withdrawn"
```

Element IDs are ASCII and derived from specification-element identity, so they are stable across
regeneration. The Arabic policy quote remains attached to REQ-0031 and is reachable from the
boundary event in four interactions.

---

## 10. IR diffing

`packages/process-ir` provides a semantic differ distinguishing:

- **structural** — region tree shape, node kind, branch style, interruption or handler attachment;
- **contract** — variables, types, job types, message and error codes, decision and form
  references. This drives the semver bump proposal;
- **cosmetic** — labels, documentation, annotations.

Only structural and contract changes require re-approval. Cosmetic changes are reported separately,
so approvers are not asked to re-read a process because a label was translated.

## 11. Versioning

`ProcessIR` is stored as `Artifact{kind: process_ir}` with the standard immutable version envelope.
Every generated BPMN version records its `sourceIrVersionId`, so "which IR produced this diagram?"
is answerable — including for a release handed off years earlier.
