# Synthetic corpora

**Everything in this directory is authored, not captured.** No real document, no
real organisation, no real process, and no model output taken from a live call.

That matters for how the numbers may be quoted. Under
[ADR-0031](../docs/adr/ADR-0031-corpus-as-data.md) a corpus carries a **tier**,
and `synthetic` is weighted **0.25** and can never justify a routing decision.
`buildPassBaseline` refuses to produce a report without a tier, and
`mayAcceptChange` refuses to accept a prompt change on synthetic evidence alone
once any higher-tier corpus is registered.

| Directory | Contents |
|---|---|
| `v4a-profile/` | Three authored documents — English, Arabic, and mixed — with `sourceKind` as the label `PROFILE_SOURCE` agreement is scored against |
| `v4b-extract/` | Two hand-authored documents with a **gold set** (`gold.json`): explicitly labelled expected `EvidenceItem`s, each naming its expected location, plus **traps** — a deliberately repeated clause and a sentence that appears nowhere. Ground truth is human-authored, never AI-generated (**F1**) |
| `recordings/` | Replay fixtures. Provider id `synthetic-stub` means **authored**, not captured from a model |

## Why the recordings say `synthetic-stub`

No live provider has ever been called in this repository, so there is nothing
captured to replay. The fixtures were produced by running the capture path
against a deterministic stub, which proves the path works and makes CI
reproducible — but it measures the *plumbing*, not a model.

A recording whose `key.providerId` is a real provider is a captured one. That
distinction is deliberately visible in the filename-addressed key, in the
recording body, and in every baseline report that quotes it.
