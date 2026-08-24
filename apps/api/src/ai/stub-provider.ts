/**
 * The authored stub provider (V4a).
 *
 * **Not a model, and it says so everywhere it can**: the provider id is
 * `synthetic-stub`, every profile it returns carries a limitation saying it was
 * authored, and the recordings it produces are labelled with that provider id so
 * a baseline report can never quote them as a model measurement.
 *
 * It exists because no live provider has ever been called in this repository.
 * Without it there would be nothing to replay, so CI could not be reproducible
 * and the capture path could not be exercised at all. Running the real capture
 * path against a deterministic stub proves the *plumbing* — the chain from source
 * to broker to recording to replay — which is exactly what V4a claims and no more.
 *
 * Deliberately dumb: it counts headings, table separators and Arabic characters.
 * A stub that looked clever would invite someone to read its output as a
 * measurement of something.
 */

import type { AiProvider } from '@asdp/ai';
import {
  SourceProfile,
  type AiRequest,
  type AiResponse,
  type EvidenceExtraction,
  type EntityCanonicalisation,
  type FramePopulation,
  type ProviderDescriptor,
  type SourceReconciliation,
} from '@asdp/schemas';

export const STUB_PROVIDER_ID = 'synthetic-stub';

function stubDescriptor(): ProviderDescriptor {
  return {
    providerId: STUB_PROVIDER_ID,
    displayName: 'Synthetic stub (authored, not a model)',
    deploymentClass: 'on_premise',
    models: [
      {
        modelId: 'stub-1',
        displayName: 'Authored stub',
        contextUnits: 1_000_000,
        maxOutputUnits: 8192,
        capabilities: ['schemaConstrainedOutput'],
        costModel: { inputUnitCost: 0, cachedInputUnitCost: 0, outputUnitCost: 0, currency: 'USD' },
        qualityTierByLanguage: { en: 'unknown', ar: 'unknown' },
      },
    ],
    // On-premise and authored: nothing is retained, and there is no model to
    // train. Stated rather than left to a default.
    dataHandling: { retentionDays: 0, trainingOptOut: true, residencyRegion: 'local' },
    enabled: true,
  };
}

const ZERO_COST = {
  estimatedInputUnits: 0,
  estimatedOutputUnits: 0,
  estimatedCost: 0,
  currency: 'USD',
} as const;

/** Profile a document from its SHAPE. Deterministic, offline, and honest about it. */
export function profileFromShape(text: string): SourceProfile {
  const headings = [...text.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => (m[1] as string).trim());
  const arabic = /[\u0600-\u06FF]/.test(text);
  const latin = /[A-Za-z]{3}/.test(text);
  const languages = arabic && latin ? ['ar', 'en'] : arabic ? ['ar'] : ['en'];

  const documentKind = /operating procedure|\u0625\u062C\u0631\u0627\u0621 \u062A\u0634\u063A\u064A\u0644\u064A/.test(text)
    ? 'sop'
    : /policy|\u0633\u064A\u0627\u0633\u0629/.test(text)
      ? 'policy'
      : /business requirements|requirements/i.test(text)
        ? 'brd'
        : 'other';

  return {
    documentKind,
    languages,
    observed: {
      hasNumberedSections: /^#{1,6}\s+[\d\u0661-\u0669]/m.test(text),
      hasTables: text.includes('|---'),
      hasDecisionLogic: /\bwhen\b|\bunless\b|approved|refused/i.test(text),
      hasFormFields: /required documents/i.test(text),
      hasProcessNarrative: /step/i.test(text),
    },
    sectionHeadings: headings,
    summary:
      `Authored stub profile: ${documentKind} in ${languages.join('/')} with ` +
      `${headings.length} section heading(s). Not a model reading.`,
    limitations: [
      'produced by the authored stub provider, not by a model; it describes document shape only',
    ],
  };
}

/**
 * Extract candidate evidence from document SHAPE, deterministically.
 *
 * Selects sentences containing a modal or obligation marker, in English or
 * Arabic, and quotes them **verbatim** with the unit id they came from. That is
 * enough to exercise the whole gate — unique matches, repeated sentences,
 * locator-disambiguated matches — without any model involved.
 *
 * Deliberately literal. It does not judge whether a sentence *is* a requirement,
 * because a stub that appeared to judge would invite someone to read its output
 * as a measurement of judgement.
 */
export function extractFromShape(text: string, unitIds: readonly string[]): EvidenceExtraction {
  const items: EvidenceExtraction['items'] = [];
  // Units are separated by a blank line in the assembled chunk text, matching how
  // `planChunks` joins them — so the nth block is the nth offered unit id.
  const blocks = text.split(/\n\n+/);

  blocks.forEach((block, blockIndex) => {
    const unitId = unitIds[blockIndex];
    // Sentence-ish split that keeps Arabic full stops and avoids eating the
    // terminator, because the quote has to be findable verbatim.
    for (const raw of block.split(/(?<=[.!?۔])\s+/)) {
      const sentence = raw.trim();
      if (sentence.length === 0) continue;
      if (!/\b(must|shall|may not|required|within)\b|يجب|خلال|يُشترط/i.test(sentence)) continue;
      items.push({
        quote: sentence,
        ...(unitId === undefined ? {} : { locator: { unitId } }),
        // A fixed value, and a middling one: a self-rating that varied would look
        // like a judgement the stub is not making. It nudges confidence by 0 (0.5).
        modelSelfRating: 0.5,
      });
    }
  });

  return {
    items,
    limitations: [
      'produced by the authored stub provider, not by a model; it selects sentences by marker word',
    ],
  };
}

/**
 * Marker word to RAF slot, for the frame-population stub.
 *
 * A lookup table, and it is meant to look like one. The stub is not deciding what
 * a sentence *means*; it is matching a marker and naming the slot the marker
 * conventionally belongs to. Order matters — the first match wins — so the more
 * specific markers come first.
 *
 * Deliberately crude, for the reason the rest of this file is crude: a stub that
 * appeared to classify well would invite someone to read its output as a
 * measurement of classification.
 */
const SLOT_MARKERS: readonly { readonly pattern: RegExp; readonly slot: string; readonly category: string }[] = [
  { pattern: /escalat|تصعيد/i, slot: 'escalations', category: 'functional' },
  { pattern: /within \s*\d+\s*(?:working )?(?:day|hour|week)|خلال/i, slot: 'slasAndTimers', category: 'sla' },
  { pattern: /notif|إشعار/i, slot: 'notifications', category: 'notification' },
  { pattern: /reject|refus|approved|withdrawn|مرفوض|معتمد/i, slot: 'outcomes', category: 'functional' },
  { pattern: /must (?:submit|supply|provide|attach)|required document|يقدم/i, slot: 'inputs', category: 'data' },
  { pattern: /issue[ds]?\b|produce[ds]?\b|certificate|report/i, slot: 'outputs', category: 'data' },
  { pattern: /\bif\b|\bunless\b|\bwhen\b|eligib|إذا/i, slot: 'businessRules', category: 'business_rule' },
  { pattern: /officer|reviewer|applicant|manager|inspector|الموظف|المراجع/i, slot: 'actors', category: 'role' },
  { pattern: /\b(?:must|shall)\b|يجب/i, slot: 'processSteps', category: 'functional' },
];

/**
 * Propose requirements from evidence SHAPE, deterministically.
 *
 * Reads the `[evidence-id] text` lines the prompt supplied, matches each against
 * the marker table, and proposes the item **only if the matched slot is one this
 * pass offered** — which is what makes six passes produce six different answers
 * from one table rather than the same answer six times.
 *
 * The proposed text is the evidence text, **verbatim**. A stub that paraphrased
 * would be inventing the very thing V5 cannot verify, and a fluent stub would make
 * the evaluation look like a measurement of fluency.
 */
export function populateFrameFromShape(
  batchText: string,
  offeredSlots: readonly string[],
): FramePopulation {
  const items: FramePopulation['items'] = [];

  for (const line of batchText.split(/\n+/)) {
    const parsed = /^\[([^\]]+)\]\s*(.+)$/.exec(line.trim());
    if (parsed === null) continue;
    const evidenceItemId = (parsed[1] as string).trim();
    const text = (parsed[2] as string).trim();

    const marker = SLOT_MARKERS.find(
      (m) => m.pattern.test(text) && offeredSlots.includes(m.slot),
    );
    if (marker === undefined) continue;

    items.push({
      slot: marker.slot,
      text,
      category: marker.category as FramePopulation['items'][number]['category'],
      evidenceItemIds: [evidenceItemId],
      // Fixed and middling, so it nudges confidence by zero. A self-rating that
      // varied would look like a judgement the stub is not making.
      modelSelfRating: 0.5,
    });
  }

  return {
    items,
    limitations: [
      'produced by the authored stub provider, not by a model; it matches marker words to slots ' +
        'and restates the evidence verbatim, so it demonstrates nothing about interpretation',
    ],
  };
}

/**
 * Propose merges from surface-form SHAPE, deterministically.
 *
 * The stub merges nothing at all, and that is the honest answer for a stub. Exact
 * match-form equality has already been settled by code before this call, so what
 * remains is the semantic equivalence a real model would supply — synonyms,
 * abbreviations, cross-language pairs — and a stub that faked those would be
 * rigged in the one direction the evaluation is meant to measure.
 *
 * It reports that in `limitations` rather than returning an empty list silently,
 * because "no merges" and "I do not do merges" are different claims.
 */
export function canonicaliseFromShape(): EntityCanonicalisation {
  return {
    merges: [],
    limitations: [
      'produced by the authored stub provider, not by a model; it proposes NO semantic merges, ' +
        'because exact match-form equality is already settled by code and everything else needs ' +
        'judgement a stub does not have',
    ],
  };
}

/**
 * Propose reconciliation candidates from SHAPE, deterministically.
 *
 * Pairs propositions within the slot it was given and classifies each pair by a
 * marker table: two statements carrying different explicit durations are
 * `potentially_contradictory`; two carrying the same duration in different words
 * are `equivalent`; anything else naming different required things is
 * `complementary`.
 *
 * Deliberately crude, and it will be wrong often — which is the point. A stub
 * that classified well would invite someone to read the evaluation as a
 * measurement of classification.
 */
export function reconcileFromShape(batchText: string): SourceReconciliation {
  const items: { id: string; text: string }[] = [];
  for (const line of batchText.split(/\n+/)) {
    const parsed = /^\[([^\]]+)\]\s*(.+)$/.exec(line.trim());
    if (parsed === null) continue;
    items.push({ id: (parsed[1] as string).trim(), text: (parsed[2] as string).trim() });
  }

  const candidates: SourceReconciliation['candidates'] = [];

  /** Explicit durations, in days. Words are folded to numbers so 90 !== 30 is visible. */
  const durationOf = (text: string): number | undefined => {
    const words: Record<string, number> = {
      one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, ten: 10,
      fourteen: 14, thirty: 30, sixty: 60, ninety: 90,
    };
    const numeric = /\b(\d+)\s+(day|days|working day|working days|month|months)\b/i.exec(text);
    if (numeric !== null) {
      const n = Number(numeric[1]);
      return /month/i.test(numeric[2] as string) ? n * 30 : n;
    }
    const worded = /\b(one|two|three|four|five|six|seven|ten|fourteen|thirty|sixty|ninety)\s+(day|days|working day|working days|month|months)\b/i.exec(text);
    if (worded !== null) {
      const n = words[(worded[1] as string).toLowerCase()] ?? 0;
      return /month/i.test(worded[2] as string) ? n * 30 : n;
    }
    return undefined;
  };

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i] as { id: string; text: string };
      const b = items[j] as { id: string; text: string };
      const da = durationOf(a.text);
      const db = durationOf(b.text);
      if (da === undefined || db === undefined) continue;

      candidates.push({
        requirementIds: [a.id, b.id],
        classification: da === db ? 'equivalent' : 'potentially_contradictory',
        topic: 'stated time limit',
        explanation:
          da === db
            ? `both state a limit of ${da} day(s), worded differently`
            : `one states ${da} day(s) and the other ${db} day(s); they cannot both hold`,
        modelSelfRating: 0.5,
      });
    }
  }

  return {
    candidates,
    limitations: [
      'produced by the authored stub provider, not by a model; it compares explicit durations by ' +
        'a marker table and understands nothing else',
    ],
  };
}

/** A provider that answers deterministically, offline, from document shape. */
export function createAuthoredStubProvider(): AiProvider {
  const descriptor = stubDescriptor();
  return {
    id: STUB_PROVIDER_ID,
    descriptor: () => descriptor,
    health: async () => ({ ok: true, detail: 'authored stub; no network' }),
    async invoke(request: AiRequest): Promise<AiResponse> {
      const text = request.content.map((c) => (c.kind === 'text' ? c.text : '')).join('\n');
      // The unit ids the prompt offered, read back out of the instruction. The
      // stub is answering the same prompt a model would, which keeps the
      // recording key honest: change the prompt and the recording misses.
      const offered = /using ONLY these ids: ([^.\n]+)/.exec(request.systemInstruction);
      const unitIds =
        offered === null ? [] : (offered[1] as string).split(',').map((s) => s.trim()).filter(Boolean);

      // The slots this pass offered, read back out of the instruction — the same
      // trick the unit ids use, and for the same reason: the stub answers the
      // prompt a model would answer, so changing the prompt misses the recording
      // rather than silently replaying an answer to a different question.
      const offeredSlots = [...request.systemInstruction.matchAll(/^- ([a-zA-Z]+)(?: \(required\))?:/gm)]
        .map((m) => m[1] as string);

      const payload =
        request.taskType === 'EXTRACT_EVIDENCE'
          ? extractFromShape(text, unitIds)
          : request.taskType === 'POPULATE_FRAME'
            ? populateFrameFromShape(text, offeredSlots)
            : request.taskType === 'CANONICALISE_ENTITIES'
              ? canonicaliseFromShape()
              : request.taskType === 'RECONCILE_SOURCES'
                ? reconcileFromShape(text)
                : profileFromShape(text);

      return {
        outputs: [JSON.stringify(payload)],
        citations: [],
        usage: {
          inputUnits: text.length,
          cachedInputUnits: 0,
          outputUnits: 0,
          costEstimate: 0,
          latencyMs: 0,
        },
        providerMeta: { providerId: STUB_PROVIDER_ID, modelId: 'stub-1', capabilityTier: 'unknown' },
        degradations: [],
      };
    },
    estimateCost: () => ZERO_COST,
    // Character count, and `providerNative: false` says so — an estimate that
    // claimed to be a provider count would be a small lie in a cost report.
    countTokens: async (text: string) => ({ units: text.length, providerNative: false }),
  };
}

/**
 * A provider that THROWS if invoked, wearing the stub's descriptor.
 *
 * Used behind `replay_only`, where it is the proof rather than a fallback: if the
 * baseline ever reaches a provider, this turns a silent network call into a loud
 * failure. A recording miss should fail; it should never be filled in.
 */
export function createRefusingProvider(): AiProvider {
  const descriptor = stubDescriptor();
  return {
    id: STUB_PROVIDER_ID,
    descriptor: () => descriptor,
    health: async () => ({ ok: true, detail: 'replay_only; provider is never contacted' }),
    invoke: async () => {
      throw new Error(
        'the baseline runs in replay_only mode and must not reach a provider; a recording miss is ' +
          'a missing fixture, not a reason to make a call (A7)',
      );
    },
    estimateCost: () => ZERO_COST,
    countTokens: async (text: string) => ({ units: text.length, providerNative: false }),
  };
}
