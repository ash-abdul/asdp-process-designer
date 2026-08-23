/**
 * `POPULATE_FRAME` evaluation — V5, and **J5** in its operative form.
 *
 * ```
 * npm run eval:frame -- --corpus=v5-frame
 * ```
 *
 * Runs the **real** path offline, end to end: the real ingestion adapter produces
 * units, the real extraction gate produces `EvidenceItem`s, the real batch planner
 * assembles context, the real broker invokes a **replay** provider once per pass,
 * and **the real proposal gate** decides what would be persisted. The only thing
 * missing is the database, and nothing about the decision depends on it — which is
 * why the gate lives in its own module rather than in the command.
 *
 * **A7:** `replay_only` over recorded fixtures, behind a provider that throws if it
 * is ever reached. A recording miss fails the run; it never becomes a call.
 *
 * ## What a number here is worth
 *
 * **Less than it looks, and the report says so on every line.** The corpus is
 * synthetic, the gold set is hand-authored, and the provider is an authored stub
 * that matches marker words to slots. Every mechanical metric below — citation
 * validity, anchor resolution, slot legality, classification monotonicity — is a
 * **defect detector**, not a quality score.
 *
 * And one metric is missing on purpose. **Whether a proposition faithfully
 * represents the evidence it cites cannot be measured here at all**: it is a
 * semantic judgement, it needs human labels, and the stub restates evidence
 * verbatim so it could not be exercised even if the labels existed. That is the
 * central V5 risk (v5-proposal.md §18, R-V5-1), and reporting a number in its place
 * would be worse than reporting nothing.
 */

import { argv, exit } from 'node:process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DEFAULT_EGRESS_POLICY, invoke, type BrokerDeps } from '@asdp/ai';
import {
  buildReport,
  computeExtractionQuality,
  computeProvenanceMetrics,
  computeSlotAccuracy,
  createCorpusRegistry,
  createFilesystemCorpusStore,
  createFilesystemRecordingStore,
  createReplayProvider,
  type ExtractedItem,
  type GoldItem,
} from '@asdp/eval';
import { RAF_VERSION, RAF_SLOT_KEYS, computeFrameCoverage, type RafSlotKey, type SlotObservation } from '@asdp/raf';
import { toMatchText } from '@asdp/text';
import { EvidenceExtraction, FramePopulation, type EvidenceItem } from '@asdp/schemas';
import { EXTRACT_PROMPT_VERSION, EXTRACT_TASK_VERSION, extractInstruction } from './broker-extractor.ts';
import {
  FRAME_PROMPT_VERSION,
  FRAME_TASK_VERSION,
  frameInstruction,
  renderEvidenceBatch,
} from './broker-frame-populator.ts';
import { decodeStructured } from './broker-profiler.ts';
import { gateCandidate, scopesFor } from './extraction-gate.ts';
import { gateProposal, duplicateKey, type EligibleEvidence } from './proposal-gate.ts';
import { deriveFlags } from './requirement-flags.ts';
import { FRAME_PASSES, FRAME_PASS_VERSION, slotBriefFor } from './frame-passes.ts';
import { createRefusingProvider, createAuthoredStubProvider } from './stub-provider.ts';
import { CORPUS_ROOT, RECORDINGS_ROOT } from './corpus-paths.ts';
import { planForUnits, unitsForDocument } from './extraction-plan.ts';
import { counterIdGenerator, systemClock } from '../repo-memory.ts';

interface GoldProposition {
  readonly id: string;
  /** The RAF slot a human says this belongs in. */
  readonly slot: string;
  /** The proposition text, as the gold set states it. */
  readonly text: string;
  /** The evidence a human says supports it, by verbatim quote. */
  readonly supportedByQuote: string;
}
interface GoldTrap {
  readonly id: string;
  readonly text: string;
  readonly mustNotBecomeRequirement: string;
  readonly note?: string;
}
interface GoldDocument {
  readonly documentId: string;
  readonly expected: readonly GoldProposition[];
  readonly traps: readonly GoldTrap[];
}
interface GoldSet {
  readonly corpusId: string;
  readonly authoredBy: string;
  readonly documents: readonly GoldDocument[];
}

/** Normalisation used for gold comparison: the same match form anchors use. */
const forCompare = (s: string): string => toMatchText(s).replace(/\s+/g, ' ').trim();

async function main(): Promise<void> {
  const flags = new Map<string, string>();
  for (const arg of argv.slice(2)) {
    const m = /^--([a-zA-Z-]+)(?:=(.*))?$/.exec(arg);
    if (m !== null) flags.set(m[1] as string, m[2] ?? 'true');
  }
  const corpusId = flags.get('corpus') ?? 'v5-frame';
  // `--record` regenerates fixtures against the authored stub. It is NOT a live
  // call and cannot become one: the inner provider is the stub, which has no
  // network. Normal runs and CI use replay_only.
  const recording = flags.get('record') === 'true';

  const corpora = createCorpusRegistry(createFilesystemCorpusStore({ rootDirectory: CORPUS_ROOT }));
  const corpus = await corpora.resolve(corpusId);
  const gold = JSON.parse(
    await readFile(join(CORPUS_ROOT, corpus.id, corpus.goldSetRef ?? 'gold.json'), 'utf8'),
  ) as GoldSet;

  if (gold.authoredBy !== 'human') {
    // F1, unchanged in V5: AI-generated expected output is never authoritative
    // ground truth. A gold set produced by the same class of model being measured
    // turns evaluation into agreement-with-itself.
    throw new Error(
      `gold set for '${corpus.id}' declares authoredBy '${gold.authoredBy}'; only human-authored ` +
        'ground truth may be used (F1)',
    );
  }

  const inner = recording ? createAuthoredStubProvider() : createRefusingProvider();
  const store = createFilesystemRecordingStore({ rootDirectory: join(RECORDINGS_ROOT, corpus.id) });
  const clock = systemClock();

  const extractProvider = createReplayProvider({
    inner,
    store,
    mode: recording ? 'record' : 'replay_only',
    corpusId: corpus.id,
    taskContext: { promptVersion: EXTRACT_PROMPT_VERSION, classification: corpus.classification },
    clock,
  });
  const frameProvider = createReplayProvider({
    inner,
    store,
    mode: recording ? 'record' : 'replay_only',
    corpusId: corpus.id,
    taskContext: { promptVersion: FRAME_PROMPT_VERSION, classification: corpus.classification },
    clock,
  });

  const brokerFor = (provider: typeof extractProvider): BrokerDeps => ({
    providers: [provider],
    policy: DEFAULT_EGRESS_POLICY,
    routing: { defaultPreferenceOrder: [provider.id] },
    clock,
    ids: counterIdGenerator(),
    recordInteraction: async () => {
      /* a measurement run writes no state */
    },
  });

  const extractDeps = brokerFor(extractProvider);
  const frameDeps = brokerFor(frameProvider);

  const proposals: ExtractedItem[] = [];
  const goldItems: GoldItem[] = [];
  const rejectionCounts: Record<string, number> = {};
  const flagCounts: Record<string, number> = {};
  const trapResults: {
    id: string;
    text: string;
    expected: string;
    becameRequirement: boolean;
    rejectionReason?: string;
    notExercised?: boolean;
  }[] = [];
  const perPass: Record<string, { proposed: number; accepted: number; rejected: number }> = {};
  const observations: SlotObservation[] = [];

  let proposedTotal = 0;
  let ungroundedAccepted = 0;
  let unresolvedCitationAccepted = 0;
  let nonDraftWritten = 0;
  let citationsChecked = 0;
  let crossSlotDuplicates = 0;
  const degradations = new Set<string>();

  for (const pass of FRAME_PASSES) perPass[pass.id] = { proposed: 0, accepted: 0, rejected: 0 };

  for (const document of corpus.documents) {
    const text = await corpora.readDocument(corpus.id, document.documentId);
    const units = unitsForDocument(document.documentId, text);
    const goldDoc = gold.documents.find((d) => d.documentId === document.documentId);
    for (const item of goldDoc?.expected ?? []) {
      goldItems.push({ id: item.id, quote: item.text, expectedSlot: item.slot });
    }

    // --- stage 1: the REAL extraction path, producing evidence ------------
    const scopes = scopesFor(units);
    const extractPlan = planForUnits(units);
    const evidence: EligibleEvidence[] = [];
    let evidenceSeq = 0;

    for (const chunk of extractPlan.chunks) {
      const outcome = await invoke(extractDeps, {
        projectId: '',
        taskType: 'EXTRACT_EVIDENCE',
        taskVersion: EXTRACT_TASK_VERSION,
        promptVersion: EXTRACT_PROMPT_VERSION,
        systemInstruction: extractInstruction(chunk.unitIds),
        content: [{ kind: 'text', text: chunk.text, classification: corpus.classification }],
        project: { allowExternalProviders: true, classificationCeiling: corpus.classification },
        languageHints: [document.language],
        mode: 'replay',
        contextMode: extractPlan.chunks.length > 1 ? 'chunked' : 'full',
        outputSchema: EvidenceExtraction,
      });
      if (outcome.kind === 'refused') {
        console.error(`EXTRACT REFUSED ${document.documentId} ${chunk.chunkId}: ${outcome.detail}`);
        continue;
      }
      const decoded = decodeStructured(outcome.proposal.payload);
      const parsed = decoded.ok ? EvidenceExtraction.safeParse(decoded.value) : undefined;
      if (parsed?.success !== true) continue;

      for (const candidate of parsed.data.items) {
        const gated = gateCandidate({
          sourceId: document.documentId,
          storedText: text,
          candidate,
          scopesByUnitId: scopes.byUnitId,
          scopesByHeading: scopes.byHeading,
          extractorVersion: EXTRACT_PROMPT_VERSION,
          confidenceInputs: {
            sourceAuthorityRank: 0,
            providerCapabilityTier: outcome.interaction.capabilityTier,
            degradations: outcome.interaction.routing.degradations,
          },
        });
        if (gated.kind === 'rejected') continue;
        if (evidence.some((e) => e.item.anchor.quoteChecksum === gated.anchor.quoteChecksum)) continue;

        evidenceSeq++;
        const item: EvidenceItem = {
          id: `${document.documentId}-ev-${evidenceSeq}`,
          projectId: 'eval',
          sourceId: document.documentId,
          anchor: gated.anchor,
          verbatimText: gated.anchor.quote,
          language: gated.anchor.language,
          extractedBy: 'ai',
          aiInteractionId: outcome.interaction.id,
          citationMode: 'post_hoc',
          anchorVerified: true,
          classification: corpus.classification,
          computedConfidence: gated.confidence.score,
          confidenceBand: gated.confidence.band,
          confidenceFunctionVersion: gated.confidence.version,
          createdBy: 'eval',
          createdAt: '1970-01-01T00:00:00.000Z',
        };
        evidence.push({
          item,
          storedText: text,
          sourceAuthorityRank: 0,
          sourceKind: document.sourceKind,
          sourcePrimaryLanguage: document.language,
        });
      }
    }

    if (evidence.length === 0) {
      console.error(`NO EVIDENCE for ${document.documentId}; nothing to populate the frame from`);
      continue;
    }

    // --- stage 2: the REAL frame passes, through the REAL proposal gate ---
    const byId = new Map(evidence.map((e) => [e.item.id, e]));
    const held = new Set<string>();
    // The same proposition offered into two DIFFERENT slots by two passes.
    // Measured rather than collapsed: collapsing would mean choosing a slot on
    // pass order, which is an arbitrary pick of exactly the kind §4.4 taught this
    // codebase to refuse. Counted here so the cost is visible — see limitation 66.
    const textOnly = new Set<string>();
    const bySlot = new Map<string, { count: number; evidenceIds: Set<string>; bands: string[] }>();

    for (const pass of FRAME_PASSES) {
      const outcome = await invoke(frameDeps, {
        projectId: '',
        taskType: 'POPULATE_FRAME',
        taskVersion: FRAME_TASK_VERSION,
        promptVersion: FRAME_PROMPT_VERSION,
        systemInstruction: frameInstruction(pass.title, slotBriefFor(pass)),
        content: [
          {
            kind: 'text',
            text: renderEvidenceBatch(
              evidence.map((e) => ({ evidenceItemId: e.item.id, verbatimText: e.item.verbatimText })),
            ),
            classification: corpus.classification,
          },
        ],
        project: { allowExternalProviders: true, classificationCeiling: corpus.classification },
        languageHints: [document.language],
        mode: 'replay',
        contextMode: 'full',
        outputSchema: FramePopulation,
      });

      if (outcome.kind === 'refused') {
        console.error(`FRAME REFUSED ${document.documentId} ${pass.id}: ${outcome.detail}`);
        continue;
      }
      for (const d of outcome.interaction.routing.degradations) degradations.add(String(d));

      const decoded = decodeStructured(outcome.proposal.payload);
      const parsed = decoded.ok ? FramePopulation.safeParse(decoded.value) : undefined;
      if (parsed?.success !== true) {
        console.error(`UNUSABLE FRAME OUTPUT ${document.documentId} ${pass.id}`);
        continue;
      }

      for (const proposal of parsed.data.items) {
        proposedTotal++;
        (perPass[pass.id] as { proposed: number }).proposed++;

        const gated = gateProposal({
          proposal,
          batch: byId,
          passSlots: pass.slots,
          passId: pass.id,
          confidenceInputs: {
            providerCapabilityTier: outcome.interaction.capabilityTier,
            degradations: outcome.interaction.routing.degradations,
          },
        });

        const trap = goldDoc?.traps.find((t) => forCompare(t.text) === forCompare(proposal.text));

        if (gated.kind === 'rejected') {
          (perPass[pass.id] as { rejected: number }).rejected++;
          rejectionCounts[gated.reason] = (rejectionCounts[gated.reason] ?? 0) + 1;
          if (trap !== undefined) {
            trapResults.push({
              id: trap.id,
              text: trap.text,
              expected: trap.mustNotBecomeRequirement,
              becameRequirement: false,
              rejectionReason: gated.reason,
            });
          }
          continue;
        }

        const key = duplicateKey(gated.slot, gated.text, gated.evidence.map((e) => e.evidenceItemId));
        if (held.has(key)) {
          (perPass[pass.id] as { rejected: number }).rejected++;
          rejectionCounts.duplicate = (rejectionCounts.duplicate ?? 0) + 1;
          continue;
        }
        const acrossSlots = duplicateKey('*', gated.text, gated.evidence.map((e) => e.evidenceItemId));
        if (textOnly.has(acrossSlots)) crossSlotDuplicates++;
        textOnly.add(acrossSlots);

        held.add(key);
        (perPass[pass.id] as { accepted: number }).accepted++;

        if (trap !== undefined) {
          trapResults.push({
            id: trap.id,
            text: trap.text,
            expected: trap.mustNotBecomeRequirement,
            becameRequirement: true,
          });
        }

        // --- defect detectors, not quality scores -------------------------
        //
        // Each of these is impossible by construction if the gate is correct,
        // which is exactly why it is measured rather than assumed.
        if (gated.evidence.length === 0) ungroundedAccepted++;
        for (const link of gated.evidence) {
          citationsChecked++;
          const cited = byId.get(link.evidenceItemId);
          if (cited === undefined || !forCompare(cited.storedText).includes(forCompare(cited.item.anchor.quote))) {
            unresolvedCitationAccepted++;
          }
        }
        // J4: everything V5 produces is a draft. The gate does not set status, so
        // this counts what the COMMAND would write — and the command has one value.
        if (('status' in gated ? (gated as { status?: string }).status : 'draft') !== 'draft') {
          nonDraftWritten++;
        }

        const citedEvidence = gated.evidence
          .map((e) => byId.get(e.evidenceItemId))
          .filter((e): e is EligibleEvidence => e !== undefined);
        for (const flag of deriveFlags(gated, citedEvidence)) {
          flagCounts[flag.kind] = (flagCounts[flag.kind] ?? 0) + 1;
        }

        const slotHeld = bySlot.get(gated.slot) ?? { count: 0, evidenceIds: new Set<string>(), bands: [] };
        slotHeld.count++;
        for (const e of gated.evidence) slotHeld.evidenceIds.add(e.evidenceItemId);
        slotHeld.bands.push(gated.confidence.band);
        bySlot.set(gated.slot, slotHeld);

        proposals.push({
          id: `${document.documentId}:${pass.id}:${proposals.length}`,
          quote: gated.text,
          mode: gated.derivation === 'extracted' ? 'extracted' : 'interpreted',
          anchorResolved: true,
          anchorPrecision: citedEvidence[0]?.item.anchor.precision ?? 'exact',
          assignedSlot: gated.slot,
        });
      }
    }

    for (const [slot, value] of bySlot) {
      observations.push({
        slot: slot as RafSlotKey,
        itemCount: value.count,
        evidenceCount: value.evidenceIds.size,
        distinctSourceCount: 1,
        sourceInventory: [
          {
            sourceId: document.documentId,
            sourceKind: document.sourceKind,
            primaryLanguage: document.language,
            authorityRank: 0,
            itemCount: value.count,
          },
        ],
        confidenceBand: value.bands.includes('LOW')
          ? 'LOW'
          : value.bands.includes('MEDIUM')
            ? 'MEDIUM'
            : 'HIGH',
        epistemicMix: { l1: 0, l2: value.count, l3: 0, l4: 0 },
      });
    }
  }

  // A trap the run never produced was NOT tested. Reporting it as a pass would be
  // the same class of error as omitting a metric: an absence read as evidence.
  for (const goldDoc of gold.documents) {
    for (const trap of goldDoc.traps) {
      if (!trapResults.some((t) => t.id === trap.id)) {
        trapResults.push({
          id: trap.id,
          text: trap.text,
          expected: trap.mustNotBecomeRequirement,
          becameRequirement: false,
          notExercised: true,
        });
      }
    }
  }

  const provenance = computeProvenanceMetrics(proposals);
  const slotAccuracy = computeSlotAccuracy(proposals, goldItems, forCompare);
  // The shared metric, not a local reimplementation: a harness that computed its
  // own precision would be measuring a second definition of the word.
  const quality = computeExtractionQuality(proposals, goldItems, forCompare);
  const coverage = computeFrameCoverage(observations, RAF_VERSION);

  const report = buildReport({
    corpusId: corpus.id,
    corpusTier: corpus.tier,
    language: corpus.languages.join('/'),
    providerId: inner.id,
    modelId: 'stub-1',
    promptVersion: FRAME_PROMPT_VERSION,
    provenance,
    quality,
  });

  const trapsFailed = trapResults.filter((t) => t.becameRequirement);
  const trapsNotExercised = trapResults.filter((t) => t.notExercised === true);
  const defects: string[] = [];
  if (ungroundedAccepted > 0) {
    defects.push(
      `${ungroundedAccepted} accepted proposal(s) cite no evidence — invariant D2 makes this ` +
        'impossible, so a non-zero count is a defect rather than a score',
    );
  }
  if (unresolvedCitationAccepted > 0) {
    defects.push(
      `${unresolvedCitationAccepted} accepted citation(s) do not resolve against their source; ` +
        'ADR-0008 forbids building on them',
    );
  }
  if (nonDraftWritten > 0) {
    defects.push(`${nonDraftWritten} proposal(s) were not draft; J4 permits no other status`);
  }
  if (trapsFailed.length > 0) {
    defects.push(
      `${trapsFailed.length} trap(s) became requirements: ${trapsFailed.map((t) => t.id).join(', ')}`,
    );
  }
  if (provenance.isDefect) defects.push(...provenance.defectReasons);

  const output = {
    ...report,
    framePasses: {
      version: FRAME_PASS_VERSION,
      count: FRAME_PASSES.length,
      perPass,
    },
    proposals: {
      proposed: proposedTotal,
      accepted: proposals.length,
      rejectionCounts,
      // Defect detectors. Every one of these should be zero, and a non-zero value
      // is a bug rather than a bad score.
      ungroundedAcceptedRate: proposals.length === 0 ? 0 : ungroundedAccepted / proposals.length,
      unresolvedCitationRate: citationsChecked === 0 ? 0 : unresolvedCitationAccepted / citationsChecked,
      traceabilityCompleteness: proposals.length === 0 ? 1 : 1 - ungroundedAccepted / proposals.length,
      nonDraftWritten,
      citationsChecked,
      // Not a defect and not a target: a statement genuinely relevant to two
      // slots is a real thing. It DOES inflate per-slot item counts in coverage,
      // which is why it is reported rather than left to be discovered.
      crossSlotDuplicates,
      flagCounts,
      degradations: [...degradations],
    },
    slotAssignment: { ...slotAccuracy, slotsInFrame: RAF_SLOT_KEYS.length },
    coverage: {
      missingInformation: coverage.missingInformation.length,
      g1Blockers: coverage.g1Blockers,
      // The coverage arithmetic has no conflicts input and cannot acquire one
      // here: J2 keeps reconciliation in V6.
      conflictsDetected: null,
    },
    traps: trapResults,
    trapSummary: {
      total: trapResults.length,
      rejectedAsRequired: trapResults.filter((t) => !t.becameRequirement && t.notExercised !== true)
        .length,
      becameRequirement: trapsFailed.length,
      notExercised: trapsNotExercised.length,
    },
    goldSet: { authoredBy: gold.authoredBy, expectedItems: goldItems.length },
    // The metric that is deliberately absent, named so its absence is legible.
    notMeasured: {
      semanticFaithfulness:
        'Whether each proposition faithfully represents the evidence it cites is a SEMANTIC ' +
        'judgement. It requires human labels over representative material, the authored stub ' +
        'restates evidence verbatim so it could not be exercised here in any case, and reporting ' +
        'a number in its place would be worse than reporting none. This is the central V5 risk ' +
        '(v5-proposal.md §18, R-V5-1).',
    },
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
    `\nframe baseline: precision ${(quality.precision * 100).toFixed(0)}% · ` +
      `recall ${(quality.recall * 100).toFixed(0)}% · F1 ${(quality.f1 * 100).toFixed(0)}% · ` +
      `slot accuracy ${(slotAccuracy.accuracy * 100).toFixed(0)}% (${slotAccuracy.scored} scored) · ` +
      `ungrounded ${(output.proposals.ungroundedAcceptedRate * 100).toFixed(0)}% · ` +
      `traceability ${(output.proposals.traceabilityCompleteness * 100).toFixed(0)}% · ` +
      `tier '${report.corpusTier}' · routing-usable ${report.usableForRoutingDecision ? 'yes' : 'NO'}`,
  );
  console.log(
    'MECHANICS ONLY: synthetic corpus, hand-authored gold set, authored stub provider. ' +
      'Nothing here measures how well a model interprets evidence.',
  );

  if (output.isDefect) {
    for (const d of defects) console.error(`DEFECT: ${d}`);
    exit(1);
  }
}

await main();
