/**
 * `EXTRACT_EVIDENCE` evaluation — **F1**, and item 10 of the V4b-core scope.
 *
 * ```
 * npm run eval:extract -- --corpus=v4b-extract
 * ```
 *
 * Runs the **real** extraction path offline: the real ingestion adapter produces
 * units, the real chunk planner assembles context, the real broker invokes a
 * **replay** provider, and the real gate decides what would be persisted. The
 * only thing missing is the database, and nothing about the decision depends on
 * it — which is why the gate lives in its own module rather than in the command.
 *
 * **A7:** `replay_only` over recorded fixtures, behind a provider that throws if
 * it is ever reached. A recording miss fails the run; it never becomes a call.
 *
 * ## What is measured, and what a number here is worth
 *
 * Precision, recall and F1 against a **hand-authored** gold set; the
 * unsupported-evidence rate; citation validity; and the trap outcomes that prove
 * §4.4 is enforced rather than described. The corpus tier is `synthetic`, so
 * `usableForRoutingDecision` is false and **no real-world model-quality claim
 * follows from any of it** (**F1**). What it does establish is that the pipeline
 * accepts what it should, rejects what it must, and does so reproducibly.
 */

import { argv, exit } from 'node:process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DEFAULT_EGRESS_POLICY, invoke, type BrokerDeps } from '@asdp/ai';
import {
  buildReport,
  computeExtractionQuality,
  computeProvenanceMetrics,
  createCorpusRegistry,
  createFilesystemCorpusStore,
  createFilesystemRecordingStore,
  createReplayProvider,
  type ExtractedItem,
  type GoldItem,
} from '@asdp/eval';
import { toMatchText } from '@asdp/text';
import { EvidenceExtraction } from '@asdp/schemas';
import { EXTRACT_PROMPT_VERSION, EXTRACT_TASK_VERSION, extractInstruction } from './broker-extractor.ts';
import { decodeStructured } from './broker-profiler.ts';
import { gateCandidate, scopesFor } from './extraction-gate.ts';
import { createRefusingProvider } from './stub-provider.ts';
import { CORPUS_ROOT, RECORDINGS_ROOT } from './corpus-paths.ts';
import { planForUnits, unitsForDocument } from './extraction-plan.ts';
import { counterIdGenerator, systemClock } from '../repo-memory.ts';

interface GoldExpected {
  readonly id: string;
  readonly quote: string;
  readonly location: { readonly section?: string; readonly unitOrdinal?: number };
}
interface GoldTrap {
  readonly id: string;
  readonly quote: string;
  readonly mustNotBecomeEvidence: string;
  readonly note?: string;
}
interface GoldDocument {
  readonly documentId: string;
  readonly expected: readonly GoldExpected[];
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
    const m = /^--([a-zA-Z-]+)=(.*)$/.exec(arg);
    if (m !== null) flags.set(m[1] as string, m[2] as string);
  }
  const corpusId = flags.get('corpus') ?? 'v4b-extract';

  const corpora = createCorpusRegistry(createFilesystemCorpusStore({ rootDirectory: CORPUS_ROOT }));
  const corpus = await corpora.resolve(corpusId);
  const gold = JSON.parse(
    await readFile(join(CORPUS_ROOT, corpus.id, corpus.goldSetRef ?? 'gold.json'), 'utf8'),
  ) as GoldSet;

  if (gold.authoredBy !== 'human') {
    // F1: AI-generated expected output is never authoritative ground truth. A gold
    // set produced by the same class of model being measured turns evaluation into
    // agreement-with-itself.
    throw new Error(
      `gold set for '${corpus.id}' declares authoredBy '${gold.authoredBy}'; only human-authored ` +
        'ground truth may be used (F1)',
    );
  }

  const inner = createRefusingProvider();
  const provider = createReplayProvider({
    inner,
    store: createFilesystemRecordingStore({ rootDirectory: join(RECORDINGS_ROOT, corpus.id) }),
    mode: 'replay_only',
    corpusId: corpus.id,
    taskContext: { promptVersion: EXTRACT_PROMPT_VERSION, classification: corpus.classification },
    clock: systemClock(),
  });

  const deps: BrokerDeps = {
    providers: [provider],
    policy: DEFAULT_EGRESS_POLICY,
    routing: { defaultPreferenceOrder: [provider.id] },
    clock: systemClock(),
    ids: counterIdGenerator(),
    recordInteraction: async () => {
      /* a measurement run writes no state */
    },
  };

  const extracted: ExtractedItem[] = [];
  const goldItems: GoldItem[] = [];
  const rejectionCounts: Record<string, number> = {};
  const trapResults: {
    id: string;
    quote: string;
    expected: string;
    becameEvidence: boolean;
    rejectionReason?: string;
    /** True when the pass never produced this candidate, so nothing was tested. */
    notExercised?: boolean;
  }[] = [];
  const perDocument: Record<string, { accepted: number; rejected: number; candidates: number }> = {};
  let candidatesTotal = 0;
  let unsupportedAccepted = 0;
  let chunkedDocuments = 0;
  const degradations = new Set<string>();

  for (const document of corpus.documents) {
    const text = await corpora.readDocument(corpus.id, document.documentId);
    const units = unitsForDocument(document.documentId, text);
    const goldDoc = gold.documents.find((d) => d.documentId === document.documentId);
    for (const item of goldDoc?.expected ?? []) {
      goldItems.push({ id: item.id, quote: item.quote });
    }

    const plan = planForUnits(units);
    if (plan.chunked) chunkedDocuments++;

    const scopes = scopesFor(units);
    const stats = { accepted: 0, rejected: 0, candidates: 0 };
    const acceptedChecksums = new Set<string>();

    for (const [index, chunk] of plan.chunks.entries()) {
      const outcome = await invoke(deps, {
        projectId: '',
        taskType: 'EXTRACT_EVIDENCE',
        taskVersion: EXTRACT_TASK_VERSION,
        promptVersion: EXTRACT_PROMPT_VERSION,
        systemInstruction: extractInstruction(chunk.unitIds),
        content: [{ kind: 'text', text: chunk.text, classification: corpus.classification }],
        project: { allowExternalProviders: true, classificationCeiling: corpus.classification },
        languageHints: [document.language],
        mode: 'replay',
        contextMode: plan.chunks.length > 1 ? 'chunked' : 'full',
        ...(plan.chunks.length > 1 ? { chunkCount: plan.chunks.length } : {}),
        outputSchema: EvidenceExtraction,
      });

      if (outcome.kind === 'refused') {
        console.error(`REFUSED ${document.documentId} ${chunk.chunkId}: ${outcome.detail}`);
        continue;
      }
      for (const d of outcome.interaction.routing.degradations) degradations.add(String(d));

      const decoded = decodeStructured(outcome.proposal.payload);
      const parsed = decoded.ok ? EvidenceExtraction.safeParse(decoded.value) : undefined;
      if (parsed?.success !== true) {
        console.error(`UNUSABLE OUTPUT ${document.documentId} ${chunk.chunkId}`);
        continue;
      }

      for (const candidate of parsed.data.items) {
        candidatesTotal++;
        stats.candidates++;
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

        if (gated.kind === 'rejected') {
          stats.rejected++;
          rejectionCounts[gated.reason] = (rejectionCounts[gated.reason] ?? 0) + 1;
          const trap = goldDoc?.traps.find((t) => forCompare(t.quote) === forCompare(candidate.quote));
          if (trap !== undefined) {
            trapResults.push({
              id: trap.id,
              quote: trap.quote,
              expected: trap.mustNotBecomeEvidence,
              becameEvidence: false,
              rejectionReason: gated.reason,
            });
          }
          continue;
        }

        if (acceptedChecksums.has(gated.anchor.quoteChecksum)) continue;
        acceptedChecksums.add(gated.anchor.quoteChecksum);
        stats.accepted++;

        // A trap that became evidence is the defect the traps exist to catch.
        const trap = goldDoc?.traps.find((t) => forCompare(t.quote) === forCompare(candidate.quote));
        if (trap !== undefined) {
          trapResults.push({
            id: trap.id,
            quote: trap.quote,
            expected: trap.mustNotBecomeEvidence,
            becameEvidence: true,
          });
        }

        // "Unsupported" means accepted while absent from the document. The gate
        // makes this impossible by construction — which is exactly why it is
        // measured rather than assumed.
        if (!forCompare(text).includes(forCompare(gated.anchor.quote))) unsupportedAccepted++;

        extracted.push({
          id: `${document.documentId}:${gated.anchor.quoteChecksum.slice(0, 8)}`,
          quote: gated.anchor.quote,
          mode: 'extracted',
          anchorResolved: true,
          anchorPrecision: gated.anchor.precision,
        });
      }
    }
    perDocument[document.documentId] = stats;
  }

  const provenance = computeProvenanceMetrics(extracted);
  const quality = computeExtractionQuality(extracted, goldItems, forCompare);
  const report = buildReport({
    corpusId: corpus.id,
    corpusTier: corpus.tier,
    language: corpus.languages.join('/'),
    providerId: inner.id,
    modelId: 'stub-1',
    promptVersion: EXTRACT_PROMPT_VERSION,
    provenance,
    quality,
  });

  // A trap the pass never produced was NOT tested. Reporting it as a pass would
  // be the same class of error as omitting a metric: it reads as evidence when it
  // is an absence. The authored stub can only quote text it was given, so a
  // fabrication trap is unexercisable here and is covered by unit test instead.
  for (const goldDoc of gold.documents) {
    for (const trap of goldDoc.traps) {
      if (!trapResults.some((t) => t.id === trap.id)) {
        trapResults.push({
          id: trap.id,
          quote: trap.quote,
          expected: trap.mustNotBecomeEvidence,
          becameEvidence: false,
          notExercised: true,
        });
      }
    }
  }

  const trapsFailed = trapResults.filter((t) => t.becameEvidence);
  const trapsNotExercised = trapResults.filter((t) => t.notExercised === true);
  const defects: string[] = [];
  if (unsupportedAccepted > 0) {
    defects.push(
      `${unsupportedAccepted} accepted item(s) are not present in their document — unsupported ` +
        'evidence must be impossible, not rare',
    );
  }
  if (trapsFailed.length > 0) {
    defects.push(
      `${trapsFailed.length} trap(s) became evidence: ${trapsFailed.map((t) => t.id).join(', ')}`,
    );
  }
  if (provenance.isDefect) defects.push(...provenance.defectReasons);

  const output = {
    ...report,
    extraction: {
      candidates: candidatesTotal,
      accepted: extracted.length,
      rejectionCounts,
      unsupportedAcceptedRate: extracted.length === 0 ? 0 : unsupportedAccepted / extracted.length,
      fabricatedCandidateRate:
        candidatesTotal === 0 ? 0 : (rejectionCounts.quote_not_found ?? 0) / candidatesTotal,
      ambiguityRejections: rejectionCounts.ambiguous_citation ?? 0,
      chunkedDocuments,
      degradations: [...degradations],
      perDocument,
    },
    traps: trapResults,
    trapSummary: {
      total: trapResults.length,
      rejectedAsRequired: trapResults.filter(
        (t) => !t.becameEvidence && t.notExercised !== true,
      ).length,
      becameEvidence: trapsFailed.length,
      notExercised: trapsNotExercised.length,
    },
    goldSet: { authoredBy: gold.authoredBy, expectedItems: goldItems.length },
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
    `\nextraction baseline: precision ${(quality.precision * 100).toFixed(0)}% · ` +
      `recall ${(quality.recall * 100).toFixed(0)}% · F1 ${(quality.f1 * 100).toFixed(0)}% · ` +
      `unsupported-accepted ${(output.extraction.unsupportedAcceptedRate * 100).toFixed(0)}% · ` +
      `ambiguity rejections ${output.extraction.ambiguityRejections} · ` +
      `tier '${report.corpusTier}' · routing-usable ${report.usableForRoutingDecision ? 'yes' : 'NO'}`,
  );

  if (output.isDefect) {
    for (const d of defects) console.error(`DEFECT: ${d}`);
    exit(1);
  }
}

await main();
