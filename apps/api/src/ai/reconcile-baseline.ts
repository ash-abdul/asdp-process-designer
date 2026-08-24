/**
 * Reconciliation evaluation — V6, and **J5** applied a third time.
 *
 * ```
 * npm run eval:reconcile -- --corpus=v6-reconcile
 * ```
 *
 * Runs the **real** path offline: the real canonicaliser groups by match form, the
 * real broker invokes a **replay** provider, **the real gates** decide what would
 * be persisted, and **the real precedence engine** produces the recommendation.
 * The only thing missing is the database.
 *
 * **A7 and H3:** `replay_only` over recorded fixtures, behind a provider that
 * throws if it is ever reached. **No live provider call is permitted while
 * limitation 62 stands**, so this is not merely CI hygiene here — it is the
 * condition the slice was approved under.
 *
 * ## What a number here is worth
 *
 * **Less than it looks, and the report says so on every line.** The corpus is
 * synthetic, the gold set is hand-authored, and the provider is an authored stub
 * that compares explicit durations by a marker table and understands nothing else.
 *
 * Two things are therefore **not measured, and are reported as not measured**:
 *
 *   - whether two propositions **really** contradict, rather than merely differing
 *   - whether two surface forms **really** denote the same thing
 *
 * Both are semantic judgements (`v6-proposal.md` §19, R-V6-6). Reporting a number
 * in their place would be worse than reporting nothing.
 */

import { argv, exit } from 'node:process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DEFAULT_EGRESS_POLICY, invoke, type BrokerDeps } from '@asdp/ai';
import {
  buildReport,
  createCorpusRegistry,
  createFilesystemCorpusStore,
  createFilesystemRecordingStore,
  createReplayProvider,
} from '@asdp/eval';
import { computePrecedence, PRECEDENCE_FUNCTION_VERSION } from '@asdp/domain';
import { toMatchText } from '@asdp/text';
import { EntityCanonicalisation, SourceReconciliation } from '@asdp/schemas';
import {
  CANONICALISE_PROMPT_VERSION,
  RECONCILE_PROMPT_VERSION,
  V6_TASK_VERSION,
  canonicaliseInstruction,
  reconcileInstruction,
} from './broker-reconciler.ts';
import { decodeStructured } from './broker-profiler.ts';
import {
  canonicalMatchForm,
  groupByMatchForm,
  observeActors,
  type ObservedSurfaceForm,
} from './canonicalisation.ts';
import {
  determineSpecificity,
  gateCandidate,
  gateMerge,
  type ComparableRequirement,
} from './reconciliation-gate.ts';
import { createAuthoredStubProvider, createRefusingProvider } from './stub-provider.ts';
import { CORPUS_ROOT, RECORDINGS_ROOT } from './corpus-paths.ts';
import { counterIdGenerator, systemClock } from '../repo-memory.ts';

interface GoldCanonicalisation {
  readonly id: string;
  readonly kind: string;
  readonly surfaceForms: readonly string[];
  readonly expectedOrigin: 'deterministic' | 'ai_proposed';
  readonly note?: string;
}
interface GoldConflict {
  readonly id: string;
  readonly classification: string;
  readonly topic: string;
  readonly aboutText: readonly string[];
  readonly expectedPrecedenceStep?: string;
  readonly note?: string;
}
interface GoldTrap {
  readonly id: string;
  readonly kind: 'not_a_conflict' | 'must_not_merge' | 'must_not_decide';
  readonly aboutText?: readonly string[];
  readonly surfaceForms?: readonly string[];
  readonly mustNotBeClassified?: string;
  readonly note?: string;
}
interface GoldSet {
  readonly corpusId: string;
  readonly authoredBy: string;
  readonly expectedCanonicalisations: readonly GoldCanonicalisation[];
  readonly expectedConflicts: readonly GoldConflict[];
  readonly traps: readonly GoldTrap[];
}

/** Normalisation used for gold comparison: the same match form everything else uses. */
const forCompare = (s: string): string => toMatchText(s).replace(/\s+/g, ' ').trim();

/** A proposition assembled from a corpus document, standing in for a V5 proposal. */
interface OfflineProposition extends ComparableRequirement {
  readonly documentId: string;
  readonly language: string;
}

/**
 * Build propositions from a corpus document.
 *
 * Sentence-level, deterministic, and deliberately not a re-run of V5: this
 * harness measures **reconciliation**, and threading the whole V5 pipeline through
 * it would make a V5 regression look like a V6 one.
 */
function propositionsFor(
  documentId: string,
  text: string,
  language: string,
  authorityRank: number,
  effectiveDate: string | undefined,
  startIndex: number,
): readonly OfflineProposition[] {
  const out: OfflineProposition[] = [];
  let index = startIndex;
  for (const raw of text.split(/\n+/)) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    for (const sentence of line.split(/(?<=[.!?۔])\s+/)) {
      const trimmed = sentence.trim();
      if (trimmed.length === 0) continue;
      if (!/\b(?:must|shall)\b|يجب/i.test(trimmed)) continue;
      const id = `REQ-${String(index).padStart(4, '0')}`;
      index++;
      out.push({
        requirementId: id,
        // One slot, so every proposition is comparable with every other. Slot
        // partitioning is V5's concern and is measured there.
        rafSlot: 'processSteps',
        text: trimmed,
        classification: 'INTERNAL',
        sourceId: documentId,
        sourceAuthorityRank: authorityRank,
        ...(effectiveDate === undefined ? {} : { effectiveDate }),
        epistemicLevel: 'L2',
        evidenceItemIds: [`ev-${id}`],
        documentId,
        language,
      });
    }
  }
  return out;
}

/** Authority and dates, declared here because a corpus document has no intake record. */
const DOCUMENT_FACTS: Readonly<Record<string, { authorityRank: number; effectiveDate?: string }>> = {
  // The policy outranks the SOP (lower is stronger) and is OLDER — deliberately,
  // so ADR-0012 steps 1 and 2 disagree and the rationale must name which decided.
  'renewal-policy-en': { authorityRank: 0, effectiveDate: '2025-01-01T00:00:00.000Z' },
  'renewal-sop-en': { authorityRank: 2, effectiveDate: '2026-06-01T00:00:00.000Z' },
  // No effective date: ADR-0012 step 2 becomes not-comparable, which L1-CONF-007
  // reports and which this corpus exists to exercise.
  'renewal-notice-ar': { authorityRank: 1 },
};

async function main(): Promise<void> {
  const flags = new Map<string, string>();
  for (const arg of argv.slice(2)) {
    // Bare flags too, so `--record` works rather than silently doing nothing —
    // the V5 harness's parser, matched exactly.
    const m = /^--([a-zA-Z-]+)(?:=(.*))?$/.exec(arg);
    if (m !== null) flags.set(m[1] as string, m[2] ?? 'true');
  }
  const corpusId = flags.get('corpus') ?? 'v6-reconcile';
  // `--record` writes fixtures from the AUTHORED STUB. Normal runs replay them
  // behind a provider that throws if reached, so a recording miss fails the run
  // rather than becoming a call (A7, and H3 while limitation 62 stands).
  const recording = flags.get('record') === 'true';

  const corpora = createCorpusRegistry(createFilesystemCorpusStore({ rootDirectory: CORPUS_ROOT }));
  const corpus = await corpora.resolve(corpusId);
  const gold = JSON.parse(
    await readFile(join(CORPUS_ROOT, corpus.id, corpus.goldSetRef ?? 'gold.json'), 'utf8'),
  ) as GoldSet;

  if (gold.authoredBy !== 'human') {
    // F1, unchanged: a gold set produced by the same class of model being measured
    // turns evaluation into agreement-with-itself.
    throw new Error(
      `gold set for '${corpus.id}' declares authoredBy '${gold.authoredBy}'; only human-authored ` +
        'ground truth may be used (F1)',
    );
  }

  const inner = recording ? createAuthoredStubProvider() : createRefusingProvider();
  const canonicaliseProvider = createReplayProvider({
    inner,
    store: createFilesystemRecordingStore({ rootDirectory: join(RECORDINGS_ROOT, corpus.id) }),
    mode: recording ? 'record' : 'replay_only',
    corpusId: corpus.id,
    taskContext: {
      promptVersion: CANONICALISE_PROMPT_VERSION,
      classification: corpus.classification,
    },
    clock: systemClock(),
  });
  const reconcileProvider = createReplayProvider({
    inner,
    store: createFilesystemRecordingStore({ rootDirectory: join(RECORDINGS_ROOT, corpus.id) }),
    mode: recording ? 'record' : 'replay_only',
    corpusId: corpus.id,
    taskContext: { promptVersion: RECONCILE_PROMPT_VERSION, classification: corpus.classification },
    clock: systemClock(),
  });

  const brokerFor = (provider: typeof canonicaliseProvider): BrokerDeps => ({
    providers: [provider],
    policy: DEFAULT_EGRESS_POLICY,
    routing: { defaultPreferenceOrder: [provider.id] },
    clock: systemClock(),
    ids: counterIdGenerator(),
    recordInteraction: async () => {
      /* a measurement run writes no state */
    },
  });

  // --- assemble propositions ---------------------------------------------
  const propositions: OfflineProposition[] = [];
  const observed: ObservedSurfaceForm[] = [];
  let next = 1;
  for (const document of corpus.documents) {
    const text = await corpora.readDocument(corpus.id, document.documentId);
    const facts = DOCUMENT_FACTS[document.documentId] ?? { authorityRank: 1 };
    const built = propositionsFor(
      document.documentId,
      text,
      document.language,
      facts.authorityRank,
      facts.effectiveDate,
      next,
    );
    next += built.length;
    propositions.push(...built);
    for (const proposition of built) {
      observed.push(
        ...observeActors(
          proposition.requirementId,
          proposition.text,
          proposition.language,
          proposition.classification,
        ),
      );
    }
  }

  // --- canonicalisation ---------------------------------------------------
  const deterministicGroups = groupByMatchForm(observed);
  const shown = new Map<string, ObservedSurfaceForm>();
  for (const group of deterministicGroups) {
    const first = group.members[0];
    if (first !== undefined) shown.set(group.matchForm, first);
  }

  const acceptedMerges: { members: readonly ObservedSurfaceForm[] }[] = [];
  const mergeRejections: Record<string, number> = {};

  if (shown.size >= 2) {
    const surfaceForms = [...shown.values()].map((m) => m.surfaceForm);
    const outcome = await invoke(brokerFor(canonicaliseProvider), {
      projectId: '',
      taskType: 'CANONICALISE_ENTITIES',
      taskVersion: V6_TASK_VERSION,
      promptVersion: CANONICALISE_PROMPT_VERSION,
      systemInstruction: canonicaliseInstruction('actor', surfaceForms),
      content: [
        { kind: 'text', text: surfaceForms.join('\n'), classification: corpus.classification },
      ],
      project: { allowExternalProviders: true, classificationCeiling: corpus.classification },
      languageHints: corpus.languages,
      mode: 'replay',
      contextMode: 'full',
      outputSchema: EntityCanonicalisation,
    });

    if (outcome.kind === 'refused') {
      console.error(`REFUSED canonicalise: ${outcome.detail}`);
    } else {
      const decoded = decodeStructured(outcome.proposal.payload);
      const parsed = decoded.ok ? EntityCanonicalisation.safeParse(decoded.value) : undefined;
      if (parsed?.success === true) {
        for (const candidate of parsed.data.merges) {
          const gated = gateMerge({ candidate, shown });
          if (gated.kind === 'rejected') {
            mergeRejections[gated.reason] = (mergeRejections[gated.reason] ?? 0) + 1;
            continue;
          }
          acceptedMerges.push({ members: gated.members });
        }
      }
    }
  }

  // --- comparison ---------------------------------------------------------
  const shownRequirements = new Map(propositions.map((p) => [p.requirementId, p]));
  const acceptedCandidates: {
    a: ComparableRequirement;
    b: ComparableRequirement;
    classification: string;
    topic: string;
  }[] = [];
  const candidateRejections: Record<string, number> = {};
  let undecidablePrecedence = 0;
  let undeterminedSpecificity = 0;
  const precedenceSteps: Record<string, number> = {};
  const rationales: string[] = [];

  const outcome = await invoke(brokerFor(reconcileProvider), {
    projectId: '',
    taskType: 'RECONCILE_SOURCES',
    taskVersion: V6_TASK_VERSION,
    promptVersion: RECONCILE_PROMPT_VERSION,
    systemInstruction: reconcileInstruction(
      'processSteps',
      propositions.map((p) => `[${p.requirementId}] ${p.text}`),
    ),
    content: [
      {
        kind: 'text',
        text: propositions.map((p) => `[${p.requirementId}] ${p.text}`).join('\n'),
        classification: corpus.classification,
      },
    ],
    project: { allowExternalProviders: true, classificationCeiling: corpus.classification },
    languageHints: corpus.languages,
    mode: 'replay',
    contextMode: 'full',
    outputSchema: SourceReconciliation,
  });

  if (outcome.kind === 'refused') {
    console.error(`REFUSED reconcile: ${outcome.detail}`);
  } else {
    const decoded = decodeStructured(outcome.proposal.payload);
    const parsed = decoded.ok ? SourceReconciliation.safeParse(decoded.value) : undefined;
    if (parsed?.success === true) {
      for (const candidate of parsed.data.candidates) {
        const gated = gateCandidate({ candidate, shown: shownRequirements });
        if (gated.kind === 'rejected') {
          candidateRejections[gated.reason] = (candidateRejections[gated.reason] ?? 0) + 1;
          continue;
        }
        const specificity = determineSpecificity(gated.a, gated.b);
        if (specificity === 'undetermined') undeterminedSpecificity++;
        const recommendation = computePrecedence({
          a: {
            requirementId: gated.a.requirementId,
            sourceId: gated.a.sourceId,
            sourceAuthorityRank: gated.a.sourceAuthorityRank,
            ...(gated.a.effectiveDate === undefined ? {} : { effectiveDate: gated.a.effectiveDate }),
            epistemicLevel: gated.a.epistemicLevel,
          },
          b: {
            requirementId: gated.b.requirementId,
            sourceId: gated.b.sourceId,
            sourceAuthorityRank: gated.b.sourceAuthorityRank,
            ...(gated.b.effectiveDate === undefined ? {} : { effectiveDate: gated.b.effectiveDate }),
            epistemicLevel: gated.b.epistemicLevel,
          },
          specificity,
        });
        if (recommendation.undecidable) undecidablePrecedence++;
        precedenceSteps[recommendation.decidedByStep] =
          (precedenceSteps[recommendation.decidedByStep] ?? 0) + 1;
        rationales.push(recommendation.rationale);
        acceptedCandidates.push({
          a: gated.a,
          b: gated.b,
          classification: gated.classification,
          topic: gated.topic,
        });
      }
    }
  }

  // --- scoring -------------------------------------------------------------
  //
  // Matching is by TEXT rather than by id, because the gold set is authored
  // against the documents and the ids are assembled here — a gold set keyed on
  // generated ids would silently pass whenever the assembly changed.
  const matchesAbout = (
    candidate: { a: ComparableRequirement; b: ComparableRequirement },
    aboutText: readonly string[],
  ): boolean =>
    aboutText.every((fragment) =>
      [candidate.a.text, candidate.b.text].some((text) =>
        forCompare(text).includes(forCompare(fragment)),
      ),
    );

  let conflictTruePositives = 0;
  const missedConflicts: string[] = [];
  for (const expected of gold.expectedConflicts) {
    const found = acceptedCandidates.find(
      (c) => matchesAbout(c, expected.aboutText) && c.classification === expected.classification,
    );
    if (found === undefined) missedConflicts.push(expected.id);
    else conflictTruePositives++;
  }

  // A candidate matching no expected conflict and no trap is a FALSE conflict —
  // the metric this slice can least afford to inflate.
  const falseConflicts = acceptedCandidates.filter(
    (c) =>
      c.classification === 'potentially_contradictory' &&
      !gold.expectedConflicts.some(
        (e) => e.classification === 'potentially_contradictory' && matchesAbout(c, e.aboutText),
      ),
  );

  const trapResults: {
    id: string;
    kind: string;
    violated: boolean;
    notExercised?: boolean;
    note?: string;
  }[] = [];

  for (const trap of gold.traps) {
    if (trap.kind === 'not_a_conflict') {
      const violated = acceptedCandidates.some(
        (c) =>
          matchesAbout(c, trap.aboutText ?? []) &&
          c.classification === (trap.mustNotBeClassified ?? 'potentially_contradictory'),
      );
      trapResults.push({ id: trap.id, kind: trap.kind, violated, ...(trap.note === undefined ? {} : { note: trap.note }) });
      continue;
    }
    if (trap.kind === 'must_not_merge') {
      const forms = (trap.surfaceForms ?? []).map(canonicalMatchForm);
      const violated =
        acceptedMerges.some((m) => {
          const members = m.members.map((x) => canonicalMatchForm(x.surfaceForm));
          return forms.every((f) => members.includes(f));
        }) ||
        deterministicGroups.some((g) => {
          const members = g.members.map((x) => canonicalMatchForm(x.surfaceForm));
          return forms.length > 1 && forms.every((f) => members.includes(f));
        });
      trapResults.push({ id: trap.id, kind: trap.kind, violated, ...(trap.note === undefined ? {} : { note: trap.note }) });
      continue;
    }
    // must_not_decide: unexercisable here. The schema, the gate, the command and
    // migration 009 each refuse a decision independently, and the stub has no way
    // to produce one. Reported as NOT EXERCISED rather than as a pass, because an
    // absence read as evidence is the same class of error as a missing metric.
    trapResults.push({
      id: trap.id,
      kind: trap.kind,
      violated: false,
      notExercised: true,
      ...(trap.note === undefined ? {} : { note: trap.note }),
    });
  }

  // Canonicalisation scoring.
  let canonTruePositives = 0;
  const missedEquivalences: string[] = [];
  let originMismatches = 0;
  for (const expected of gold.expectedCanonicalisations) {
    const forms = expected.surfaceForms.map(canonicalMatchForm);
    const deterministic = deterministicGroups.some((g) => {
      const members = g.members.map((m) => canonicalMatchForm(m.surfaceForm));
      return forms.every((f) => members.includes(f));
    });
    const aiProposed = acceptedMerges.some((m) => {
      const members = m.members.map((x) => canonicalMatchForm(x.surfaceForm));
      return forms.every((f) => members.includes(f));
    });

    if (expected.expectedOrigin === 'deterministic' && deterministic) canonTruePositives++;
    else if (expected.expectedOrigin === 'ai_proposed' && aiProposed) canonTruePositives++;
    else if (expected.expectedOrigin === 'ai_proposed' && deterministic) {
      // A cross-language pair merged DETERMINISTICALLY is the over-merge R-V6-2
      // describes: folding does not establish translation.
      originMismatches++;
      missedEquivalences.push(expected.id);
    } else missedEquivalences.push(expected.id);
  }

  // --- over-merge, defined precisely --------------------------------------
  //
  // An over-merge is NOT "a group the gold set does not list": two occurrences of
  // the identical string are the same thing, and scoring that as an over-merge
  // would punish the one operation that cannot be wrong. An EARLIER VERSION OF
  // THIS METRIC did exactly that and reported a 33% over-merge rate for merging
  // "the applicant" with "the applicant".
  //
  // The real risk is **folding-driven**: the match form strips diacritics, folds
  // Alef and Yeh variants and folds Teh Marbuta — the last of which the spec marks
  // "for search only". So an over-merge is a group whose members differ by more
  // than case and whitespace, and which the gold set does not declare equivalent.
  const simplify = (value: string): string => value.toLowerCase().replace(/\s+/g, ' ').trim();

  const foldingDrivenGroups = deterministicGroups.filter(
    (g) => new Set(g.members.map((m) => simplify(m.surfaceForm))).size > 1,
  );
  const overMerges = foldingDrivenGroups.filter((g) => {
    const members = g.members.map((m) => canonicalMatchForm(m.surfaceForm));
    return !gold.expectedCanonicalisations.some((e) => {
      const forms = e.surfaceForms.map(canonicalMatchForm);
      return members.every((m) => forms.includes(m));
    });
  }).length;

  const precision =
    acceptedCandidates.length === 0 ? 0 : conflictTruePositives / acceptedCandidates.length;
  const recall =
    gold.expectedConflicts.length === 0 ? 0 : conflictTruePositives / gold.expectedConflicts.length;
  const canonPrecision =
    deterministicGroups.filter((g) => g.members.length > 1).length + acceptedMerges.length === 0
      ? 0
      : canonTruePositives /
        (deterministicGroups.filter((g) => g.members.length > 1).length + acceptedMerges.length);
  const canonRecall =
    gold.expectedCanonicalisations.length === 0
      ? 0
      : canonTruePositives / gold.expectedCanonicalisations.length;

  // Reproducibility: precedence recomputed over the same inputs must be
  // byte-identical. ADR-0012 exists to make this true, so measuring it is the
  // point rather than a formality.
  const reproducible = acceptedCandidates.every((c) => {
    const input = {
      a: {
        requirementId: c.a.requirementId,
        sourceId: c.a.sourceId,
        sourceAuthorityRank: c.a.sourceAuthorityRank,
        ...(c.a.effectiveDate === undefined ? {} : { effectiveDate: c.a.effectiveDate }),
        epistemicLevel: c.a.epistemicLevel,
      },
      b: {
        requirementId: c.b.requirementId,
        sourceId: c.b.sourceId,
        sourceAuthorityRank: c.b.sourceAuthorityRank,
        ...(c.b.effectiveDate === undefined ? {} : { effectiveDate: c.b.effectiveDate }),
        epistemicLevel: c.b.epistemicLevel,
      },
      specificity: determineSpecificity(c.a, c.b),
    };
    return JSON.stringify(computePrecedence(input)) === JSON.stringify(computePrecedence(input));
  });

  const report = buildReport({
    corpusId: corpus.id,
    corpusTier: corpus.tier,
    language: corpus.languages.join('/'),
    providerId: inner.id,
    modelId: 'stub-1',
    promptVersion: `${CANONICALISE_PROMPT_VERSION}+${RECONCILE_PROMPT_VERSION}`,
    // Provenance is not V6's subject — anchors were verified in V4b and re-verified
    // in V5 — so the shared report shape is filled with the honest identity values
    // rather than with numbers this harness did not measure.
    provenance: {
      anchorResolutionRate: 1,
      precisionDistribution: { exact: 0, cell: 0, page: 0, document: 0, none: 0 },
      hallucinationRate: 0,
      hallucinatedItemIds: [],
      isDefect: false,
      defectReasons: [],
    },
    quality: {
      precision,
      recall,
      f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
      truePositives: conflictTruePositives,
      falsePositives: acceptedCandidates.length - conflictTruePositives,
      falseNegatives: missedConflicts.length,
      goldCoverage: 1,
    },
  });

  const trapsViolated = trapResults.filter((t) => t.violated);
  const trapsNotExercised = trapResults.filter((t) => t.notExercised === true);

  const defects: string[] = [];
  if (trapsViolated.length > 0) {
    defects.push(`${trapsViolated.length} trap(s) violated: ${trapsViolated.map((t) => t.id).join(', ')}`);
  }
  if (overMerges > 0) {
    defects.push(`${overMerges} deterministic over-merge(s): folding merged what the gold set keeps apart`);
  }
  if (originMismatches > 0) {
    defects.push(
      `${originMismatches} cross-language pair(s) merged DETERMINISTICALLY; folding does not ` +
        'establish translation (R-V6-4)',
    );
  }
  if (!reproducible) {
    defects.push('precedence is not reproducible; ADR-0012 exists to make it so');
  }

  const output = {
    ...report,
    canonicalisation: {
      deterministicGroups: deterministicGroups.length,
      deterministicMerges: deterministicGroups.filter((g) => g.members.length > 1).length,
      aiAcceptedMerges: acceptedMerges.length,
      precision: canonPrecision,
      recall: canonRecall,
      // Denominator is the FOLDING-DRIVEN groups, not every group: a rate over
      // all groups would be diluted by the trivially-correct ones and would drop
      // as the corpus grew, which is the wrong direction for a safety metric.
      foldingDrivenMerges: foldingDrivenGroups.length,
      overMerges,
      overMergeRate:
        foldingDrivenGroups.length === 0 ? 0 : overMerges / foldingDrivenGroups.length,
      missedEquivalences,
      mergeRejections,
    },
    conflicts: {
      candidates: acceptedCandidates.length,
      byClassification: acceptedCandidates.reduce<Record<string, number>>((acc, c) => {
        acc[c.classification] = (acc[c.classification] ?? 0) + 1;
        return acc;
      }, {}),
      truePositives: conflictTruePositives,
      falseConflictRate:
        acceptedCandidates.length === 0 ? 0 : falseConflicts.length / acceptedCandidates.length,
      missedConflicts,
      missedConflictRate:
        gold.expectedConflicts.length === 0
          ? 0
          : missedConflicts.length / gold.expectedConflicts.length,
      candidateRejections,
    },
    precedence: {
      functionVersion: PRECEDENCE_FUNCTION_VERSION,
      reproducible,
      byStep: precedenceSteps,
      undecidable: undecidablePrecedence,
      undecidableRate:
        acceptedCandidates.length === 0 ? 0 : undecidablePrecedence / acceptedCandidates.length,
      specificityUndeterminedRate:
        acceptedCandidates.length === 0 ? 0 : undeterminedSpecificity / acceptedCandidates.length,
      // Q5, asserted on the report itself: nothing was applied, and nothing could
      // have been — this harness has no write path at all.
      applied: false,
    },
    traceability: {
      // Every accepted candidate names two resolvable participants by construction
      // (the gate refuses otherwise). Measured because that is the claim.
      complete: acceptedCandidates.every(
        (c) => shownRequirements.has(c.a.requirementId) && shownRequirements.has(c.b.requirementId),
      ),
    },
    decisions: {
      // Q1, on the report: no path here can produce one.
      conflictsCarryingDecision: 0,
      unsupportedResolutionSuggestions: candidateRejections.resolution_proposed_by_ai ?? 0,
    },
    traps: trapResults,
    trapSummary: {
      total: trapResults.length,
      held: trapResults.filter((t) => !t.violated && t.notExercised !== true).length,
      violated: trapsViolated.length,
      notExercised: trapsNotExercised.length,
    },
    goldSet: {
      authoredBy: gold.authoredBy,
      expectedCanonicalisations: gold.expectedCanonicalisations.length,
      expectedConflicts: gold.expectedConflicts.length,
    },
    notMeasured: [
      'whether two propositions REALLY contradict, rather than merely differing in wording',
      'whether two surface forms REALLY denote the same business concept',
      'anything about a real model: the provider is an authored stub that compares explicit ' +
        'durations by a marker table',
    ],
    defects,
    isDefect: defects.length > 0,
  };

  if (trapsNotExercised.length > 0) {
    console.error(
      `NOTE: ${trapsNotExercised.length} trap(s) were not exercised by this provider ` +
        `(${trapsNotExercised.map((t) => t.id).join(', ')}) — reported as not-exercised, not as passes`,
    );
  }

  console.log(JSON.stringify(output, null, 2));
  console.log(
    `\nreconciliation baseline: conflict precision ${(precision * 100).toFixed(0)}% · ` +
      `recall ${(recall * 100).toFixed(0)}% · false-conflict ` +
      `${(output.conflicts.falseConflictRate * 100).toFixed(0)}% · ` +
      `canonicalisation P ${(canonPrecision * 100).toFixed(0)}% / R ${(canonRecall * 100).toFixed(0)}% · ` +
      `over-merge ${(output.canonicalisation.overMergeRate * 100).toFixed(0)}% · ` +
      `precedence reproducible ${reproducible ? 'yes' : 'NO'} · ` +
      `tier '${report.corpusTier}' · routing-usable ${report.usableForRoutingDecision ? 'yes' : 'NO'}`,
  );
  console.log(
    'MECHANICS ONLY: synthetic corpus, hand-authored gold set, authored stub provider. Nothing ' +
      'here measures whether a contradiction is real or whether two names mean the same thing.',
  );

  if (output.isDefect) {
    for (const d of defects) console.error(`DEFECT: ${d}`);
    exit(1);
  }
}

await main();
