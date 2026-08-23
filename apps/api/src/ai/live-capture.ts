/**
 * The explicitly invoked capture path (V4a) — **the only place a live provider
 * can be reached**.
 *
 * ```
 * npm run ai:capture -- --corpus=v4a-profile --provider=stub
 * npm run ai:capture -- --corpus=v4a-profile --provider=claude --model=<id>
 * npm run ai:capture -- --corpus=v4a-profile --provider=claude --mode=verify
 * ```
 *
 * **A7, and this file is why the rule is mechanical.** `npm run verify`, the test
 * suite and CI never reach this module: nothing imports it, it is executed
 * directly as an entrypoint, and the checker rule `live-path-confinement` fails
 * the build if any module or test imports it. Live evaluation stays a separately
 * triggered capability, so a provider outage or a model revision can never turn
 * the build red.
 *
 * **E1 is enforced here, at the boundary.** `assertDevelopmentCeiling` refuses to
 * send anything above `INTERNAL` to an externally hosted provider, on top of the
 * production egress gate that already refuses `RESTRICTED` and above. Development
 * convenience is not a reason to send real confidential material outside.
 *
 * ## `--provider=stub` is not a live call, and says so
 *
 * The stub produces deterministic, authored responses and records them under the
 * provider id `synthetic-stub`. That is how this repository has fixtures at all:
 * no live provider has ever been called here, so there is nothing captured to
 * replay. Running the capture path against a stub proves the path and makes CI
 * reproducible; it measures the plumbing, not a model. A recording whose provider
 * id is a real provider is a captured one, and the difference is visible in the
 * recording, its key, and every baseline that quotes it.
 */

import { argv, env, exit } from 'node:process';
import { join } from 'node:path';
import {
  DEFAULT_EGRESS_POLICY,
  assertDevelopmentCeiling,
  assertTransportPermitted,
  createClaudeProvider,
  createClaudeTransport,
  invoke,
  type AiProvider,
  type BrokerDeps,
} from '@asdp/ai';
import {
  createFilesystemCorpusStore,
  createFilesystemRecordingStore,
  createCorpusRegistry,
  createReplayProvider,
  assertNotHeldOut,
  type ReplayMode,
} from '@asdp/eval';
import { EvidenceExtraction, SourceProfile, type Classification } from '@asdp/schemas';
import { profileInstruction, PROFILE_PROMPT_VERSION, PROFILE_TASK_VERSION } from './broker-profiler.ts';
import {
  extractInstruction,
  EXTRACT_PROMPT_VERSION,
  EXTRACT_TASK_VERSION,
} from './broker-extractor.ts';
import { planForUnits, unitsForDocument } from './extraction-plan.ts';
import { counterIdGenerator, systemClock } from '../repo-memory.ts';
import { CORPUS_ROOT, RECORDINGS_ROOT } from './corpus-paths.ts';
import { createAuthoredStubProvider } from './stub-provider.ts';

interface Args {
  readonly corpus: string;
  /** Which pass to capture. Both use the same confined path and the same gates. */
  readonly task: 'profile' | 'extract';
  readonly provider: 'stub' | 'claude';
  readonly model: string;
  readonly mode: ReplayMode;
  readonly ceiling: Classification;
}

function parseArgs(): Args {
  const flags = new Map<string, string>();
  for (const arg of argv.slice(2)) {
    const match = /^--([a-zA-Z-]+)=(.*)$/.exec(arg);
    if (match !== null) flags.set(match[1] as string, match[2] as string);
  }
  const task = flags.get('task') ?? 'profile';
  if (task !== 'profile' && task !== 'extract') {
    throw new Error(`unknown --task '${task}'; expected 'profile' or 'extract'`);
  }
  const provider = flags.get('provider') ?? 'stub';
  if (provider !== 'stub' && provider !== 'claude') {
    throw new Error(`unknown --provider '${provider}'; expected 'stub' or 'claude'`);
  }
  const mode = (flags.get('mode') ?? 'record') as ReplayMode;
  if (mode !== 'record' && mode !== 'verify' && mode !== 'replay_only') {
    throw new Error(`unknown --mode '${mode}'; expected 'record', 'verify' or 'replay_only'`);
  }
  return {
    corpus: flags.get('corpus') ?? 'v4a-profile',
    task,
    provider,
    model: flags.get('model') ?? 'claude-sonnet-5',
    mode,
    // E1: INTERNAL by default, and lowering it is possible while raising it is
    // the thing a reviewer would need to see. It is a flag, not a silent default.
    ceiling: (flags.get('ceiling') ?? 'INTERNAL') as Classification,
  };
}

async function main(): Promise<void> {
  const args = parseArgs();

  const corpora = createCorpusRegistry(createFilesystemCorpusStore({ rootDirectory: CORPUS_ROOT }));
  const corpus = await corpora.resolve(args.corpus);
  // A held-out corpus may only be measured, never used to iterate on a prompt.
  assertNotHeldOut(corpus, args.mode === 'verify' ? 'measurement' : 'iteration');

  const store = createFilesystemRecordingStore({
    rootDirectory: join(RECORDINGS_ROOT, corpus.id),
  });

  let inner: AiProvider;
  if (args.provider === 'stub') {
    inner = createAuthoredStubProvider();
  } else {
    const apiKey = env.ASDP_AI_API_KEY ?? '';
    if (apiKey.trim().length === 0) {
      throw new Error(
        'ASDP_AI_API_KEY is not set. A live capture needs a credential, and this path is the only ' +
          'place in the system that uses one.',
      );
    }
    inner = createClaudeProvider({
      transport: createClaudeTransport({ apiKey }),
      // Costs are configuration, not knowledge this path invents: zero here means
      // "not configured", and a cost of zero on a live interaction is visible in
      // the record rather than hidden behind a guess.
      models: [
        {
          modelId: args.model,
          displayName: args.model,
          contextUnits: 200_000,
          maxOutputUnits: 8192,
          capabilities: ['schemaConstrainedOutput', 'vision', 'largeContext'],
          inputUnitCost: 0,
          cachedInputUnitCost: 0,
          outputUnitCost: 0,
        },
      ],
      retentionDays: 0,
      trainingOptOut: true,
    });
  }

  const provider = createReplayProvider({
    inner,
    store,
    mode: args.mode,
    corpusId: corpus.id,
    taskContext: {
      // The prompt version is part of the recording key, so a prompt change misses
      // rather than replaying an answer to a different question.
      promptVersion: args.task === 'extract' ? EXTRACT_PROMPT_VERSION : PROFILE_PROMPT_VERSION,
      classification: corpus.classification,
    },
    clock: systemClock(),
    onDrift: (report) => {
      if (report.drifted) {
        console.error(`DRIFT ${report.keyHash}: ${report.detail ?? 'output changed'}`);
      }
    },
  });

  const deps: BrokerDeps = {
    providers: [provider],
    policy: DEFAULT_EGRESS_POLICY,
    routing: { defaultPreferenceOrder: [provider.id] },
    clock: systemClock(),
    ids: counterIdGenerator(),
    recordInteraction: async () => {
      // A capture run writes recordings, not domain state. There is no database
      // here on purpose: this path must not be able to mutate the application.
    },
  };

  let captured = 0;
  let drifted = 0;

  for (const document of corpus.documents) {
    const text = await corpora.readDocument(corpus.id, document.documentId);

    // One request per chunk for extraction, one per document for profiling. The
    // planner is SHARED with the evaluation harness, because a recording is keyed
    // on the instruction and the content — if the two built requests differently,
    // every replay would miss for a reason unrelated to extraction.
    const requests =
      args.task === 'extract'
        ? planForUnits(unitsForDocument(document.documentId, text)).chunks.map((chunk, index, all) => ({
            label: `${document.documentId} ${chunk.chunkId}`,
            instruction: extractInstruction(chunk.unitIds),
            text: chunk.text,
            chunkCount: all.length,
          }))
        : [
            {
              label: document.documentId,
              instruction: profileInstruction(),
              text,
              chunkCount: 1,
            },
          ];

    for (const request of requests) {
      const content = [
        { kind: 'text' as const, text: request.text, classification: corpus.classification },
      ];

      // Both gates, in order: the permanent policy, then E1's development ceiling.
      assertTransportPermitted(content, inner.descriptor());
      assertDevelopmentCeiling(content, inner.descriptor(), args.ceiling);

      const outcome = await invoke(deps, {
        projectId: '',
        taskType: args.task === 'extract' ? 'EXTRACT_EVIDENCE' : 'PROFILE_SOURCE',
        taskVersion: args.task === 'extract' ? EXTRACT_TASK_VERSION : PROFILE_TASK_VERSION,
        promptVersion: args.task === 'extract' ? EXTRACT_PROMPT_VERSION : PROFILE_PROMPT_VERSION,
        systemInstruction: request.instruction,
        content,
        project: { allowExternalProviders: true, classificationCeiling: args.ceiling },
        languageHints: [document.language],
        mode: args.provider === 'claude' ? 'live' : 'replay',
        contextMode: request.chunkCount > 1 ? 'chunked' : 'full',
        ...(request.chunkCount > 1 ? { chunkCount: request.chunkCount } : {}),
        outputSchema: args.task === 'extract' ? EvidenceExtraction : SourceProfile,
      });

      if (outcome.kind === 'refused') {
        console.error(`REFUSED ${request.label}: ${outcome.detail}`);
        continue;
      }
      captured++;
      console.log(
        `${args.mode === 'verify' ? 'verified' : 'recorded'} ${request.label} ` +
          `(${inner.id}, ${corpus.tier} corpus)`,
      );
    }
  }

  console.log(
    `\n${args.mode} complete: ${captured} request(s) over ${corpus.documents.length} document(s), ` +
      `provider '${inner.id}'${args.provider === 'stub' ? ' — AUTHORED, not captured from a model' : ''}.`,
  );
  if (drifted > 0) exit(1);
}

await main();
