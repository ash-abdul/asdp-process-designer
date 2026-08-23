/**
 * Live Claude transport — plain `fetch`.
 *
 * **D2 (approved):** plain `fetch` behind the existing adapter boundary. The
 * Anthropic SDK is **not** introduced for convenience. Two reasons, and the second
 * is the one that matters:
 *
 *   1. `fetch` is built into Node 22, so this adds **no dependency** (**A4**).
 *   2. The `AiProvider` port already normalises everything an SDK would abstract —
 *      capabilities, degradations, routing, cost, citations. An SDK's types would
 *      be a second, vendor-shaped model of the same things, and vendor concepts
 *      leaking inward is exactly what ADR-0020 exists to prevent.
 *
 * **This file is the entire vendor surface.** Everything above it speaks
 * `AiRequest` / `AiResponse`. Replacing Claude with another provider means writing
 * a sibling of this file and changing configuration — nothing else.
 *
 * **A7 / D5:** this performs a real network call. It must never be reachable from
 * normal tests or CI, which is enforced mechanically by the checker rule
 * `no-live-ai-in-tests` rather than by convention.
 */

import type { AiRequest, AiResponse, ContentPart } from '@asdp/schemas';

/** Anthropic Messages API, pinned. A version change is a deliberate act. */
const API_VERSION = '2023-06-01';
const DEFAULT_ENDPOINT = 'https://api.anthropic.com/v1/messages';

export interface ClaudeTransportConfig {
  readonly apiKey: string;
  /** Overridable for a proxy or a gateway. Never a silent default to elsewhere. */
  readonly endpoint?: string;
  readonly maxOutputTokens?: number;
  readonly timeoutMs?: number;
  /** Injectable so tests can assert the request shape without a network call. */
  readonly fetchImpl?: typeof fetch;
  /**
   * Resolve an image `dataRef` to bytes.
   *
   * `ContentPart` carries a **reference**, not inline base64, so classification
   * and egress decisions are made on references and the bytes are fetched only
   * once a call is actually permitted. That means the transport cannot resolve
   * them itself — it has no blob store, and should not — so the application layer
   * supplies this.
   *
   * Absent, an image part is **refused**, not dropped.
   */
  readonly resolveImage?: (dataRef: string) => Promise<{ mediaType: string; base64: string }>;
}

export class ClaudeTransportError extends Error {}

/** Anthropic content blocks. The only vendor-shaped types in the codebase. */
type AnthropicBlock =
  | { readonly type: 'text'; readonly text: string }
  | {
      readonly type: 'image';
      readonly source: {
        readonly type: 'base64';
        readonly media_type: string;
        readonly data: string;
      };
    };

/**
 * Map our neutral content parts to Anthropic blocks.
 *
 * The one place a vendor shape is constructed. A part kind we cannot map is an
 * error rather than a silent omission: dropping content would send the model less
 * than the caller believed it sent, and the resulting answer would be attributed
 * to evidence that never left.
 */
async function toBlocks(
  content: readonly ContentPart[],
  resolveImage: ClaudeTransportConfig['resolveImage'],
): Promise<AnthropicBlock[]> {
  const blocks: AnthropicBlock[] = [];
  for (const part of content) {
    if (part.kind === 'text') {
      blocks.push({ type: 'text', text: part.text });
      continue;
    }
    if (part.kind === 'image') {
      if (resolveImage === undefined) {
        throw new ClaudeTransportError(
          'an image content part was supplied but no `resolveImage` was configured; refusing ' +
            'rather than sending a request that silently omits the image',
        );
      }
      const resolved = await resolveImage(part.dataRef);
      blocks.push({
        type: 'image',
        source: { type: 'base64', media_type: resolved.mediaType, data: resolved.base64 },
      });
      continue;
    }
    throw new ClaudeTransportError(
      `content part kind '${part.kind}' cannot be sent to this provider; refusing rather than ` +
        'dropping it silently',
    );
  }
  return blocks;
}

interface AnthropicResponse {
  readonly id?: string;
  readonly content?: readonly { readonly type: string; readonly text?: string }[];
  readonly usage?: {
    readonly input_tokens?: number;
    readonly output_tokens?: number;
    readonly cache_read_input_tokens?: number;
  };
  readonly stop_reason?: string;
}

/**
 * Build a live transport.
 *
 * Returns the function shape the Claude adapter already expects, so the adapter
 * itself is unchanged: it keeps its capability descriptor, its egress assertion and
 * its health check, and merely has something real to call.
 */
export function createClaudeTransport(
  config: ClaudeTransportConfig,
): (request: AiRequest, modelId: string) => Promise<AiResponse> {
  const endpoint = config.endpoint ?? DEFAULT_ENDPOINT;
  const doFetch = config.fetchImpl ?? fetch;
  const maxTokens = config.maxOutputTokens ?? 4096;
  const timeoutMs = config.timeoutMs ?? 120_000;

  if (config.apiKey.trim().length === 0) {
    throw new ClaudeTransportError('an API key is required to build a live Claude transport');
  }

  return async (request: AiRequest, modelId: string): Promise<AiResponse> => {
    const started = Date.now();

    // A bounded call. Without a timeout a hung provider becomes a hung ingest,
    // and the broker's latency budget would be advisory.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await doFetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': API_VERSION,
        },
        body: JSON.stringify({
          model: modelId,
          max_tokens: maxTokens,
          // Determinism tier maps to temperature. `deterministic` means 0, because
          // an extraction that varies between runs is not reproducible evidence.
          temperature: request.determinism === 'creative' ? 1 : request.determinism === 'balanced' ? 0.5 : 0,
          system: request.systemInstruction,
          messages: [{ role: 'user', content: await toBlocks(request.content, config.resolveImage) }],
        }),
        signal: controller.signal,
      });
    } catch (err) {
      throw new ClaudeTransportError(
        `provider request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      // The body often carries the actionable detail; truncated so a large error
      // page cannot become the whole log line.
      const body = await response.text().catch(() => '');
      throw new ClaudeTransportError(
        `provider returned ${response.status} ${response.statusText}: ${body.slice(0, 500)}`,
      );
    }

    const parsed = (await response.json()) as AnthropicResponse;
    const text = (parsed.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('');

    return {
      // The port's contract is a list of outputs; the schema-enforcement layer
      // above parses them. This transport does not interpret the payload.
      outputs: [text],
      citations: [],
      usage: {
        inputUnits: parsed.usage?.input_tokens ?? 0,
        cachedInputUnits: parsed.usage?.cache_read_input_tokens ?? 0,
        outputUnits: parsed.usage?.output_tokens ?? 0,
        costEstimate: 0,
        latencyMs: Date.now() - started,
      },
      providerMeta: {
        providerId: 'claude',
        modelId,
        // The measured tier belongs to the evaluation harness, not to a single
        // response. `unknown` is honest here: this transport has no basis for a
        // quality claim, and ADR-0011 forbids taking one from the model itself.
        capabilityTier: 'unknown',
        ...(parsed.id === undefined ? {} : { requestId: parsed.id }),
      },
      // A truncated response is reported as a DEGRADATION rather than accepted
      // silently: a cut-off extraction otherwise looks like a document that
      // simply contained less, and ADR-0022 requires degradations to be named.
      degradations: parsed.stop_reason === 'max_tokens' ? ['chunked_context'] : [],
    };
  };
}
