/**
 * Tests for the live Claude transport — **offline, with an injected fetch**.
 *
 * **A7 / D5:** this file makes no network call. Every test passes a `fetchImpl`
 * double, which is what the transport's config exists for, and the checker rule
 * `no-live-ai-in-tests` enforces that a bare construction (or one injecting the
 * real global fetch) cannot appear here.
 *
 * The point of testing the vendor surface offline: this file is the ONLY place a
 * vendor-shaped request is constructed, so if its mapping is wrong, every AI call
 * in the product is wrong in a way nothing else can catch. It stayed untested at
 * commit `dc2e683` because the first version of the checker rule banned the
 * factory outright rather than banning network egress.
 *
 * What is asserted here is *shape and refusal*, never quality — no model runs.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import type { AiRequest, ContentPart } from '@asdp/schemas';
import { ClaudeTransportError, createClaudeTransport } from './index.ts';

// ---------------------------------------------------------------------------
// Doubles
// ---------------------------------------------------------------------------

/** A stand-in endpoint. Never contacted — every test injects a fetch double. */
const ENDPOINT = 'https://provider.invalid/v1/messages';

interface Captured {
  url: string;
  init: RequestInit;
  body: Record<string, unknown>;
}

/**
 * A fetch double returning a scripted provider payload.
 *
 * Records the request so the vendor mapping can be asserted, and counts calls so
 * a test can prove a refusal happened BEFORE any request was attempted.
 */
function scriptedFetch(
  payload: unknown,
  options: { status?: number; bodyText?: string } = {},
): { impl: typeof fetch; calls: Captured[] } {
  const calls: Captured[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      init: init ?? {},
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
    });
    const status = options.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      json: async () => payload,
      text: async () => options.bodyText ?? JSON.stringify(payload),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const OK_PAYLOAD = {
  id: 'msg_scripted_1',
  content: [{ type: 'text', text: '{"regions":[]}' }],
  usage: { input_tokens: 120, output_tokens: 34, cache_read_input_tokens: 100 },
  stop_reason: 'end_turn',
};

function textPart(text: string): ContentPart {
  return { kind: 'text', text, classification: 'INTERNAL' };
}

function requestWith(
  content: readonly ContentPart[],
  determinism: AiRequest['determinism'] = 'deterministic',
): AiRequest {
  return {
    taskType: 'EXTRACT_EVIDENCE',
    taskVersion: '1',
    systemInstruction: 'Report only what is legibly present.',
    content: [...content],
    outputContract: { mode: 'schema' },
    citationMode: 'none',
    determinism,
    reasoningTier: 'standard',
    languageHints: [],
  };
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

describe('claude transport — construction', () => {
  test('an empty API key is refused at construction, not at call time', () => {
    assert.throws(
      () => createClaudeTransport({ apiKey: '   ', fetchImpl: scriptedFetch(OK_PAYLOAD).impl }),
      ClaudeTransportError,
    );
  });

  test('a configured endpoint is used verbatim — no silent default elsewhere', async () => {
    const fake = scriptedFetch(OK_PAYLOAD);
    const transport = createClaudeTransport({
      apiKey: 'k', endpoint: ENDPOINT, fetchImpl: fake.impl,
    });
    await transport(requestWith([textPart('hello')]), 'model-x');
    assert.equal(fake.calls[0]?.url, ENDPOINT);
  });
});

// ---------------------------------------------------------------------------
// Request shape — the vendor mapping
// ---------------------------------------------------------------------------

describe('claude transport — request shape', () => {
  test('sends the pinned API version, the key header, and the neutral request mapped', async () => {
    const fake = scriptedFetch(OK_PAYLOAD);
    const transport = createClaudeTransport({
      apiKey: 'secret-key', endpoint: ENDPOINT, fetchImpl: fake.impl, maxOutputTokens: 2048,
    });

    await transport(requestWith([textPart('read this')]), 'model-x');

    const call = fake.calls[0];
    assert.ok(call !== undefined);
    assert.equal(call.init.method, 'POST');
    const headers = call.init.headers as Record<string, string>;
    assert.equal(headers['x-api-key'], 'secret-key');
    // Pinned deliberately: a version change is a deliberate act, not a drift.
    assert.equal(headers['anthropic-version'], '2023-06-01');
    assert.equal(headers['content-type'], 'application/json');

    assert.equal(call.body.model, 'model-x');
    assert.equal(call.body.max_tokens, 2048);
    assert.equal(call.body.system, 'Report only what is legibly present.');
    const messages = call.body.messages as { role: string; content: unknown[] }[];
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.role, 'user');
    assert.deepEqual(messages[0]?.content, [{ type: 'text', text: 'read this' }]);
  });

  test('the determinism TIER maps to temperature — extraction is reproducible', async () => {
    for (const [tier, expected] of [
      ['deterministic', 0],
      ['balanced', 0.5],
      ['creative', 1],
    ] as const) {
      const fake = scriptedFetch(OK_PAYLOAD);
      const transport = createClaudeTransport({
        apiKey: 'k', endpoint: ENDPOINT, fetchImpl: fake.impl,
      });
      await transport(requestWith([textPart('x')], tier), 'model-x');
      assert.equal(fake.calls[0]?.body.temperature, expected, tier);
    }
  });

  test('an image part is resolved through the callback, never inlined by the caller', async () => {
    const fake = scriptedFetch(OK_PAYLOAD);
    const asked: string[] = [];
    const transport = createClaudeTransport({
      apiKey: 'k',
      endpoint: ENDPOINT,
      fetchImpl: fake.impl,
      resolveImage: async (dataRef) => {
        asked.push(dataRef);
        return { mediaType: 'image/png', base64: 'QUJD' };
      },
    });

    await transport(
      requestWith([
        { kind: 'image', mediaType: 'image/png', dataRef: 'blob:abc', classification: 'INTERNAL' },
      ]),
      'model-x',
    );

    // The content part carried a REFERENCE; the bytes are fetched only once the
    // call is permitted, which is what keeps egress decisions on references.
    assert.deepEqual(asked, ['blob:abc']);
    const messages = fake.calls[0]?.body.messages as { content: unknown[] }[];
    assert.deepEqual(messages[0]?.content, [
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'QUJD' } },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Refusals — nothing is dropped silently
// ---------------------------------------------------------------------------

describe('claude transport — refusals', () => {
  test('an image part with NO resolver is refused BEFORE any request is attempted', async () => {
    const fake = scriptedFetch(OK_PAYLOAD);
    const transport = createClaudeTransport({
      apiKey: 'k', endpoint: ENDPOINT, fetchImpl: fake.impl,
    });

    await assert.rejects(
      () =>
        transport(
          requestWith([
            { kind: 'image', mediaType: 'image/png', dataRef: 'blob:abc', classification: 'INTERNAL' },
          ]),
          'model-x',
        ),
      ClaudeTransportError,
    );
    // The refusal must precede the request: sending a call with the image
    // silently omitted would attribute the answer to evidence that never left.
    assert.equal(fake.calls.length, 0, 'no request may be attempted');
  });

  test('a part kind this provider cannot carry is refused, not dropped', async () => {
    const fake = scriptedFetch(OK_PAYLOAD);
    const transport = createClaudeTransport({
      apiKey: 'k', endpoint: ENDPOINT, fetchImpl: fake.impl,
    });

    await assert.rejects(
      () =>
        transport(
          requestWith([
            {
              kind: 'document',
              mediaType: 'application/pdf',
              dataRef: 'blob:doc',
              classification: 'INTERNAL',
            },
          ]),
          'model-x',
        ),
      ClaudeTransportError,
    );
    assert.equal(fake.calls.length, 0);
  });

  test('a non-2xx response becomes an error carrying the status', async () => {
    const fake = scriptedFetch({}, { status: 429, bodyText: 'rate limited' });
    const transport = createClaudeTransport({
      apiKey: 'k', endpoint: ENDPOINT, fetchImpl: fake.impl,
    });
    await assert.rejects(
      () => transport(requestWith([textPart('x')]), 'model-x'),
      (err: unknown) =>
        err instanceof ClaudeTransportError &&
        err.message.includes('429') &&
        err.message.includes('rate limited'),
    );
  });

  test('a transport-level failure is wrapped, never leaked raw', async () => {
    const impl = (async () => {
      throw new Error('socket hang up');
    }) as unknown as typeof fetch;
    const transport = createClaudeTransport({ apiKey: 'k', endpoint: ENDPOINT, fetchImpl: impl });
    await assert.rejects(
      () => transport(requestWith([textPart('x')]), 'model-x'),
      (err: unknown) =>
        err instanceof ClaudeTransportError && err.message.includes('socket hang up'),
    );
  });
});

// ---------------------------------------------------------------------------
// Response mapping
// ---------------------------------------------------------------------------

describe('claude transport — response mapping', () => {
  test('text blocks are joined, usage is mapped, and no quality claim is made', async () => {
    const fake = scriptedFetch({
      ...OK_PAYLOAD,
      content: [
        { type: 'text', text: 'part one ' },
        { type: 'thinking', text: 'ignored' },
        { type: 'text', text: 'part two' },
      ],
    });
    const transport = createClaudeTransport({
      apiKey: 'k', endpoint: ENDPOINT, fetchImpl: fake.impl,
    });

    const response = await transport(requestWith([textPart('x')]), 'model-x');

    assert.deepEqual(response.outputs, ['part one part two']);
    assert.equal(response.usage.inputUnits, 120);
    assert.equal(response.usage.outputUnits, 34);
    assert.equal(response.usage.cachedInputUnits, 100);
    assert.equal(response.providerMeta.providerId, 'claude');
    assert.equal(response.providerMeta.modelId, 'model-x');
    // ADR-0011: confidence is computed by us, never taken from the provider, so
    // a single response has no basis for a tier claim.
    assert.equal(response.providerMeta.capabilityTier, 'unknown');
    assert.equal(response.providerMeta.requestId, 'msg_scripted_1');
    assert.deepEqual(response.citations, []);
    assert.deepEqual(response.degradations, []);
  });

  test('a TRUNCATED response is a named degradation, not a shorter document', async () => {
    const fake = scriptedFetch({ ...OK_PAYLOAD, stop_reason: 'max_tokens' });
    const transport = createClaudeTransport({
      apiKey: 'k', endpoint: ENDPOINT, fetchImpl: fake.impl,
    });
    const response = await transport(requestWith([textPart('x')]), 'model-x');
    // ADR-0022: a cut-off extraction otherwise looks exactly like a document that
    // contained less.
    assert.deepEqual(response.degradations, ['chunked_context']);
  });

  test('a response with no content yields an empty output rather than throwing', async () => {
    const fake = scriptedFetch({ id: 'msg_2' });
    const transport = createClaudeTransport({
      apiKey: 'k', endpoint: ENDPOINT, fetchImpl: fake.impl,
    });
    const response = await transport(requestWith([textPart('x')]), 'model-x');
    // The schema-enforcement layer above decides whether empty is acceptable;
    // this transport does not interpret the payload.
    assert.deepEqual(response.outputs, ['']);
    assert.equal(response.usage.inputUnits, 0);
  });
});
