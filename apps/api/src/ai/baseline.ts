/**
 * The V4a evaluation baseline — **E5**, and it runs entirely offline.
 *
 * ```
 * npm run eval:baseline -- --corpus=v4a-profile
 * ```
 *
 * **A pass is not successful merely because the call and the schema worked.** So
 * this measures what a profiling pass can be measured on — schema validity,
 * reproducibility from fixtures, degradation behaviour, and agreement with the
 * corpus labels — and it *names* the metrics it cannot produce rather than
 * omitting them. An omitted metric reads as "fine"; a named gap reads as a gap.
 *
 * `replay_only` with a provider that throws if invoked: a recording miss fails
 * the run rather than quietly becoming a network call (**A7**). That is also the
 * reproducibility check — every case runs twice and the results are compared.
 *
 * Exits non-zero when the report is a defect. Reproducibility below 100% is a
 * defect, not a score: replay exists so the same input yields the same output, and
 * if it does not, this is measuring noise rather than the pass.
 */

import { argv, exit } from 'node:process';
import { join } from 'node:path';
import { DEFAULT_EGRESS_POLICY, invoke, type BrokerDeps } from '@asdp/ai';
import {
  buildPassBaseline,
  createCorpusRegistry,
  createFilesystemCorpusStore,
  createFilesystemRecordingStore,
  createReplayProvider,
  type PassObservation,
} from '@asdp/eval';
import { SourceProfile } from '@asdp/schemas';
import {
  PROFILE_PROMPT_VERSION,
  PROFILE_TASK_VERSION,
  decodeStructured,
  profileInstruction,
} from './broker-profiler.ts';
import { createRefusingProvider } from './stub-provider.ts';
import { CORPUS_ROOT, RECORDINGS_ROOT } from './corpus-paths.ts';
import { counterIdGenerator, systemClock } from '../repo-memory.ts';

/** Metrics that belong to `EXTRACT_EVIDENCE`, listed rather than omitted (E5). */
const NOT_APPLICABLE = [
  {
    metric: 'extractionPrecision',
    reason: 'V4a implements no extraction pass; measured in V4b against EXTRACT_EVIDENCE',
  },
  {
    metric: 'extractionRecall',
    reason: 'V4a implements no extraction pass; measured in V4b against EXTRACT_EVIDENCE',
  },
  {
    metric: 'citationProvenanceValidity',
    reason: 'a profile carries no citations and mints no anchors, so there is nothing to resolve',
  },
  {
    metric: 'hallucinatedEvidenceRate',
    reason:
      'the rate counts items claimed as EXTRACTED with no resolvable anchor; a profile claims no ' +
      'extracted items, so the metric is undefined rather than zero',
  },
] as const;

async function main(): Promise<void> {
  const flags = new Map<string, string>();
  for (const arg of argv.slice(2)) {
    const match = /^--([a-zA-Z-]+)=(.*)$/.exec(arg);
    if (match !== null) flags.set(match[1] as string, match[2] as string);
  }
  const corpusId = flags.get('corpus') ?? 'v4a-profile';

  const corpora = createCorpusRegistry(createFilesystemCorpusStore({ rootDirectory: CORPUS_ROOT }));
  const corpus = await corpora.resolve(corpusId);
  const store = createFilesystemRecordingStore({
    rootDirectory: join(RECORDINGS_ROOT, corpus.id),
  });

  const inner = createRefusingProvider();
  const provider = createReplayProvider({
    inner,
    store,
    mode: 'replay_only',
    corpusId: corpus.id,
    taskContext: { promptVersion: PROFILE_PROMPT_VERSION, classification: corpus.classification },
    clock: systemClock(),
  });

  const deps: BrokerDeps = {
    providers: [provider],
    policy: DEFAULT_EGRESS_POLICY,
    routing: { defaultPreferenceOrder: [provider.id] },
    clock: systemClock(),
    ids: counterIdGenerator(),
    recordInteraction: async () => {
      // A measurement run writes no state. The interaction shape is exercised by
      // the application's own tests; this run is about the numbers.
    },
  };

  const observations: PassObservation[] = [];
  let providerId = inner.id;
  let modelId = 'unknown';

  for (const document of corpus.documents) {
    const text = await corpora.readDocument(corpus.id, document.documentId);
    const call = {
      projectId: '',
      taskType: 'PROFILE_SOURCE' as const,
      taskVersion: PROFILE_TASK_VERSION,
      promptVersion: PROFILE_PROMPT_VERSION,
      systemInstruction: profileInstruction(),
      content: [{ kind: 'text' as const, text, classification: corpus.classification }],
      project: { allowExternalProviders: true, classificationCeiling: corpus.classification },
      languageHints: [document.language],
      mode: 'replay' as const,
      contextMode: 'full' as const,
      outputSchema: SourceProfile,
    };

    const first = await invoke(deps, call);
    // Run twice: replay must be deterministic, and this is where that is checked
    // rather than assumed.
    const second = await invoke(deps, call);

    if (first.kind === 'refused' || second.kind === 'refused') {
      observations.push({
        caseId: document.documentId,
        schemaValid: false,
        reproducible: first.kind === second.kind,
        degradations: (first.routing.plan?.degradations ?? []).map(String),
        refused: true,
      });
      continue;
    }

    providerId = first.interaction.providerId;
    modelId = first.interaction.modelId;

    const decoded = decodeStructured(first.proposal.payload);
    const parsed = decoded.ok ? SourceProfile.safeParse(decoded.value) : undefined;

    observations.push({
      caseId: document.documentId,
      schemaValid: parsed?.success === true,
      reproducible:
        JSON.stringify(first.proposal.payload) === JSON.stringify(second.proposal.payload),
      degradations: [...first.interaction.routing.degradations],
      refused: false,
      // The corpus label, compared against what the pass reported. `sourceKind`
      // is the label because it is what a human recorded about the document.
      labelExpected: document.sourceKind,
      ...(parsed?.success === true ? { labelActual: parsed.data.documentKind } : {}),
    });
  }

  const report = buildPassBaseline({
    corpusId: corpus.id,
    corpusTier: corpus.tier,
    taskType: 'PROFILE_SOURCE',
    promptVersion: PROFILE_PROMPT_VERSION,
    providerId,
    modelId,
    observations,
    notApplicable: [...NOT_APPLICABLE],
    extraCaveats: [
      providerId === 'synthetic-stub'
        ? 'the recordings were produced by the AUTHORED STUB, not captured from a model: this ' +
          'measures the chain from source to broker to recording to replay, and says nothing ' +
          'about model quality'
        : 'recordings captured from a real provider',
    ],
  });

  console.log(JSON.stringify(report, null, 2));
  console.log(
    `\nbaseline: ${report.cases} case(s) on a '${report.corpusTier}' corpus · ` +
      `schema ${(report.schemaValidityRate * 100).toFixed(0)}% · ` +
      `reproducible ${(report.reproducibilityRate * 100).toFixed(0)}% · ` +
      `label agreement ${report.labelAgreement === undefined ? 'n/a' : `${(report.labelAgreement.rate * 100).toFixed(0)}%`} · ` +
      `routing-usable ${report.usableForRoutingDecision ? 'yes' : 'NO'}`,
  );

  if (report.isDefect) {
    for (const reason of report.defectReasons) console.error(`DEFECT: ${reason}`);
    exit(1);
  }
}

await main();
