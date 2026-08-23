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
  type ProviderDescriptor,
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

/** A provider that answers deterministically, offline, from document shape. */
export function createAuthoredStubProvider(): AiProvider {
  const descriptor = stubDescriptor();
  return {
    id: STUB_PROVIDER_ID,
    descriptor: () => descriptor,
    health: async () => ({ ok: true, detail: 'authored stub; no network' }),
    async invoke(request: AiRequest): Promise<AiResponse> {
      const text = request.content.map((c) => (c.kind === 'text' ? c.text : '')).join('\n');
      return {
        outputs: [JSON.stringify(profileFromShape(text))],
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
