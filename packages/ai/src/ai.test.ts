/**
 * Tests for @asdp/ai.
 *
 * Phase 1 acceptance criteria 8 and 9, and Spike S6:
 *   - a RESTRICTED payload provably cannot reach an external adapter, asserted
 *     AT THE TRANSPORT BOUNDARY rather than by inspecting the router's intent
 *   - a PROHIBITED source produces no interaction at all
 *   - the degradation ladder is exercised against a reduced-capability adapter
 *   - vision has no degradation path: the task is refused, not downgraded
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import type { AiInteraction, AiRequest, AiResponse, ContentPart } from '@asdp/schemas';
import {
  DEFAULT_EGRESS_POLICY,
  EgressViolationError,
  LADDER,
  TASK_SPECS,
  assertTransportPermitted,
  classifyContent,
  createClaudeProvider,
  createNullProvider,
  createPrivateEndpointProvider,
  evaluateEgress,
  invoke,
  planDegradation,
  requiredCapabilitiesFor,
  route,
  taskSpec,
  type BrokerDeps,
  type EgressPolicy,
  type ProjectEgressSettings,
} from './index.ts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function text(t: string, classification: ContentPart['classification']): ContentPart {
  return { kind: 'text', text: t, classification };
}
function image(classification: ContentPart['classification']): ContentPart {
  return { kind: 'image', mediaType: 'image/png', dataRef: 'blob://1', classification };
}

const OPEN_PROJECT: ProjectEgressSettings = {
  allowExternalProviders: true,
  classificationCeiling: 'RESTRICTED',
};
const ONPREM_PROJECT: ProjectEgressSettings = {
  allowExternalProviders: false,
  classificationCeiling: 'RESTRICTED',
};

/** Records every payload that reaches the wire, so tests can assert on egress. */
const wireLog: { providerId: string; classification: string }[] = [];

function claudeWithTransport() {
  return createClaudeProvider({
    models: [
      {
        modelId: 'model-large',
        displayName: 'Large',
        contextUnits: 1_000_000,
        maxOutputUnits: 64_000,
        capabilities: [
          'schemaConstrainedOutput', 'nativeCitations', 'largeContext',
          'promptCaching', 'vision', 'documentInput', 'deepReasoning', 'toolCalling',
        ],
        inputUnitCost: 5, cachedInputUnitCost: 0.5, outputUnitCost: 25,
        qualityTierByLanguage: { en: 'A', ar: 'A' },
      },
    ],
    retentionDays: 0,
    trainingOptOut: true,
    transport: async (request: AiRequest): Promise<AiResponse> => {
      wireLog.push({ providerId: 'claude-hosted', classification: classifyContent(request.content) });
      return {
        outputs: [{ ok: true }],
        citations: [{ quote: 'q', sourceRef: 's' }],
        usage: { inputUnits: 10, cachedInputUnits: 0, outputUnits: 5, costEstimate: 0, latencyMs: 1 },
        providerMeta: { providerId: 'claude-hosted', modelId: 'model-large', capabilityTier: 'A' },
        degradations: [],
      };
    },
  });
}

/** Deliberately reduced: no citations, small context, no caching, no vision. */
function privateWithTransport() {
  return createPrivateEndpointProvider({
    providerId: 'asdp-private-llm',
    endpointUrl: 'http://internal/model',
    modelId: 'local-small',
    contextUnits: 32_000,
    maxOutputUnits: 4_000,
    capabilities: ['schemaConstrainedOutput'],
    qualityTierByLanguage: { en: 'B', ar: 'C' },
    transport: async (request: AiRequest): Promise<AiResponse> => {
      wireLog.push({ providerId: 'asdp-private-llm', classification: classifyContent(request.content) });
      return {
        outputs: [{ ok: true }],
        citations: [],
        usage: { inputUnits: 8, cachedInputUnits: 0, outputUnits: 4, costEstimate: 0, latencyMs: 1 },
        providerMeta: { providerId: 'asdp-private-llm', modelId: 'local-small', capabilityTier: 'B' },
        degradations: [],
      };
    },
  });
}

function brokerDeps(providers = [claudeWithTransport(), privateWithTransport()], policy: EgressPolicy = DEFAULT_EGRESS_POLICY): {
  deps: BrokerDeps;
  interactions: AiInteraction[];
} {
  const interactions: AiInteraction[] = [];
  let counter = 0;
  return {
    interactions,
    deps: {
      providers,
      policy,
      routing: { defaultPreferenceOrder: ['claude-hosted', 'asdp-private-llm'] },
      clock: { nowIso: () => '2026-08-22T00:00:00.000Z' },
      ids: { next: (p: string) => `${p}-${++counter}` },
      recordInteraction: async (i) => {
        interactions.push(i);
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Task specs
// ---------------------------------------------------------------------------

describe('task specifications', () => {
  test('every task type has a spec', () => {
    assert.equal(TASK_SPECS.length, 18);
    for (const s of TASK_SPECS) {
      assert.doesNotThrow(() => taskSpec(s.taskType));
    }
  });

  test('vision becomes REQUIRED when content includes an image', () => {
    assert.ok(!requiredCapabilitiesFor('EXTRACT_EVIDENCE', false).includes('vision'));
    assert.ok(requiredCapabilitiesFor('EXTRACT_EVIDENCE', true).includes('vision'));
  });

  test('commentary tasks require no capabilities', () => {
    assert.equal(taskSpec('EXPLAIN_ELEMENT').required.length, 0);
    assert.equal(taskSpec('EXPLAIN_ELEMENT').commentaryOnly, true);
  });
});

// ---------------------------------------------------------------------------
// Egress gate — acceptance criterion 8
// ---------------------------------------------------------------------------

describe('egress policy gate (ADR-0021)', () => {
  const claude = claudeWithTransport().descriptor();
  const local = privateWithTransport().descriptor();

  test('INTERNAL content may reach an external provider', () => {
    const d = evaluateEgress('EXTRACT_EVIDENCE', [text('x', 'INTERNAL')], claude, DEFAULT_EGRESS_POLICY, OPEN_PROJECT);
    assert.equal(d.allowed, true);
  });

  test('RESTRICTED content may NOT reach an external provider', () => {
    const d = evaluateEgress('EXTRACT_EVIDENCE', [text('x', 'RESTRICTED')], claude, DEFAULT_EGRESS_POLICY, OPEN_PROJECT);
    assert.equal(d.allowed, false);
    if (d.allowed) return;
    assert.equal(d.reason, 'deployment_class_not_permitted');
  });

  test('RESTRICTED content MAY reach an on-premise provider', () => {
    const d = evaluateEgress('EXTRACT_EVIDENCE', [text('x', 'RESTRICTED')], local, DEFAULT_EGRESS_POLICY, OPEN_PROJECT);
    assert.equal(d.allowed, true);
  });

  test('PROHIBITED content reaches no provider at all', () => {
    for (const p of [claude, local]) {
      const d = evaluateEgress('EXTRACT_EVIDENCE', [text('x', 'PROHIBITED')], p, DEFAULT_EGRESS_POLICY, OPEN_PROJECT);
      assert.equal(d.allowed, false);
      if (d.allowed) continue;
      assert.equal(d.reason, 'prohibited_content');
    }
  });

  test('classification is the MAXIMUM over content, never an average', () => {
    const mixed = [text('a', 'PUBLIC'), text('b', 'RESTRICTED'), text('c', 'INTERNAL')];
    assert.equal(classifyContent(mixed), 'RESTRICTED');
    const d = evaluateEgress('EXTRACT_EVIDENCE', mixed, claude, DEFAULT_EGRESS_POLICY, OPEN_PROJECT);
    assert.equal(d.allowed, false, 'one restricted item blocks the whole request');
  });

  test('an on-premise-only project forbids external providers at every classification', () => {
    const d = evaluateEgress('EXTRACT_EVIDENCE', [text('x', 'PUBLIC')], claude, DEFAULT_EGRESS_POLICY, ONPREM_PROJECT);
    assert.equal(d.allowed, false);
    if (d.allowed) return;
    assert.equal(d.reason, 'project_forbids_external');
  });

  test('a provider retaining data beyond policy is rejected', () => {
    // Isolate the retention rule: at CONFIDENTIAL the deployment-class check
    // fires first (correctly — it is the primary discriminator), so retention is
    // tested at a classification where the provider is otherwise permitted.
    const policy: EgressPolicy = {
      ...DEFAULT_EGRESS_POLICY,
      maxRetentionDays: { ...DEFAULT_EGRESS_POLICY.maxRetentionDays, INTERNAL: 7 },
    };
    const retaining = { ...claude, dataHandling: { ...claude.dataHandling, retentionDays: 30 } };
    const d = evaluateEgress('EXTRACT_EVIDENCE', [text('x', 'INTERNAL')], retaining, policy, OPEN_PROJECT);
    assert.equal(d.allowed, false);
    if (d.allowed) return;
    assert.equal(d.reason, 'retention_exceeds_policy');
    assert.match(d.detail, /retains data for 30 day/);
  });

  test('deployment class is checked before retention — the primary discriminator', () => {
    // Documents the precedence explicitly, so a future reordering is caught.
    const retaining = { ...claude, dataHandling: { ...claude.dataHandling, retentionDays: 30 } };
    const d = evaluateEgress('EXTRACT_EVIDENCE', [text('x', 'RESTRICTED')], retaining, DEFAULT_EGRESS_POLICY, OPEN_PROJECT);
    assert.equal(d.allowed, false);
    if (d.allowed) return;
    assert.equal(d.reason, 'deployment_class_not_permitted');
  });

  test('a provider without training opt-out is rejected above PUBLIC', () => {
    const optIn = { ...claude, dataHandling: { ...claude.dataHandling, trainingOptOut: false } };
    const d = evaluateEgress('EXTRACT_EVIDENCE', [text('x', 'INTERNAL')], optIn, DEFAULT_EGRESS_POLICY, OPEN_PROJECT);
    assert.equal(d.allowed, false);
    if (d.allowed) return;
    assert.equal(d.reason, 'training_opt_out_required');
  });

  test('CONFIDENTIAL content routed externally requires redaction', () => {
    const permissive: EgressPolicy = {
      ...DEFAULT_EGRESS_POLICY,
      allowedDeploymentClasses: {
        ...DEFAULT_EGRESS_POLICY.allowedDeploymentClasses,
        CONFIDENTIAL: ['external_hosted', 'vpc', 'on_premise'],
      },
      maxRetentionDays: {},
    };
    const d = evaluateEgress('EXTRACT_EVIDENCE', [text('x', 'CONFIDENTIAL')], claude, permissive, OPEN_PROJECT);
    assert.equal(d.allowed, true);
    if (!d.allowed) return;
    assert.equal(d.redactionRequired, true);
  });
});

// ---------------------------------------------------------------------------
// SPIKE S6 — the transport-boundary assertion
// ---------------------------------------------------------------------------

describe('SPIKE S6: transport-boundary enforcement', () => {
  test('assertTransportPermitted throws for RESTRICTED → external', () => {
    const claude = claudeWithTransport().descriptor();
    assert.throws(
      () => assertTransportPermitted([text('secret', 'RESTRICTED')], claude),
      EgressViolationError,
    );
  });

  test('assertTransportPermitted throws for PROHIBITED → any provider', () => {
    for (const p of [claudeWithTransport().descriptor(), privateWithTransport().descriptor()]) {
      assert.throws(() => assertTransportPermitted([text('x', 'PROHIBITED')], p), EgressViolationError);
    }
  });

  test('A RESTRICTED PAYLOAD CANNOT REACH THE EXTERNAL ADAPTER EVEN IF THE BROKER IS BYPASSED', async () => {
    // This is the assertion that matters: the guard is at the point of egress,
    // not merely at the point of intent. A caller that skips the router still
    // cannot leak.
    const before = wireLog.length;
    const provider = claudeWithTransport();
    await assert.rejects(
      () =>
        provider.invoke(
          {
            taskType: 'EXTRACT_EVIDENCE',
            taskVersion: '1',
            systemInstruction: 'x',
            content: [text('national id 784-1990-1234567-1', 'RESTRICTED')],
            outputContract: { mode: 'schema' },
            citationMode: 'native',
            determinism: 'deterministic',
            reasoningTier: 'standard',
            languageHints: [],
          },
          'model-large',
        ),
      EgressViolationError,
    );
    assert.equal(wireLog.length, before, 'NOTHING reached the wire');
  });

  test('the same payload does reach an on-premise adapter', async () => {
    const before = wireLog.length;
    const provider = privateWithTransport();
    await provider.invoke(
      {
        taskType: 'EXTRACT_EVIDENCE',
        taskVersion: '1',
        systemInstruction: 'x',
        content: [text('restricted content', 'RESTRICTED')],
        outputContract: { mode: 'schema' },
        citationMode: 'post_hoc',
        determinism: 'deterministic',
        reasoningTier: 'standard',
        languageHints: [],
      },
      'local-small',
    );
    assert.equal(wireLog.length, before + 1);
    assert.equal(wireLog[wireLog.length - 1]?.providerId, 'asdp-private-llm');
  });
});

// ---------------------------------------------------------------------------
// Degradation ladder — acceptance criterion 9
// ---------------------------------------------------------------------------

describe('degradation ladder (ADR-0022)', () => {
  test('every rung declares a consequence', () => {
    for (const r of LADDER) {
      assert.ok(r.consequence.length > 20, `${r.missing} needs a stated consequence`);
    }
  });

  test('VISION HAS NO RUNG: the task is refused, never downgraded', () => {
    const vision = LADDER.find((r) => r.missing === 'vision');
    assert.ok(vision !== undefined);
    assert.equal(vision?.degradation, null);
    assert.equal(vision?.refusesTask, true);
  });

  test('missing native citations maps to post_hoc, never to none', () => {
    const plan = planDegradation(
      ['schemaConstrainedOutput'],
      ['nativeCitations', 'largeContext'],
      ['schemaConstrainedOutput'],
    );
    assert.equal(plan.refused, false);
    assert.ok(plan.degradations.includes('post_hoc_citations'));
    assert.ok(plan.degradations.includes('chunked_context'));
  });

  test('missing schema-constrained output yields a BOUNDED repair loop', () => {
    const plan = planDegradation([], ['nativeCitations'], []);
    assert.equal(plan.repairAttempts, 3, 'bounded, not unlimited');
  });

  test('a full-capability provider needs no degradation', () => {
    const plan = planDegradation(
      ['schemaConstrainedOutput'],
      ['nativeCitations', 'largeContext', 'promptCaching'],
      ['schemaConstrainedOutput', 'nativeCitations', 'largeContext', 'promptCaching'],
    );
    assert.deepEqual(plan.degradations, []);
    assert.equal(plan.repairAttempts, 0);
  });

  test('a missing REQUIRED capability refuses rather than degrades', () => {
    const plan = planDegradation(['vision'], [], ['schemaConstrainedOutput']);
    assert.equal(plan.refused, true);
    assert.match(plan.refusalReason ?? '', /vision/);
  });
});

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

describe('routing (ai-provider-abstraction.md §7)', () => {
  const providers = [claudeWithTransport().descriptor(), privateWithTransport().descriptor()];

  test('prefers the configured provider when both are eligible', () => {
    const r = route('EXTRACT_EVIDENCE', [text('x', 'INTERNAL')], providers, DEFAULT_EGRESS_POLICY, OPEN_PROJECT, {
      defaultPreferenceOrder: ['claude-hosted', 'asdp-private-llm'],
    });
    assert.equal(r.kind, 'routed');
    if (r.kind !== 'routed') return;
    assert.equal(r.record.selectedProvider, 'claude-hosted');
    assert.deepEqual(r.record.plan?.degradations, [], 'no degradation needed');
  });

  test('POLICY FORCES THE ON-PREMISE PROVIDER for RESTRICTED content, and records why', () => {
    const r = route('EXTRACT_EVIDENCE', [text('x', 'RESTRICTED')], providers, DEFAULT_EGRESS_POLICY, OPEN_PROJECT, {
      defaultPreferenceOrder: ['claude-hosted', 'asdp-private-llm'],
    });
    assert.equal(r.kind, 'routed');
    if (r.kind !== 'routed') return;
    assert.equal(r.record.selectedProvider, 'asdp-private-llm');
    // The rejection is recorded and answerable.
    const rejection = r.record.rejectedProviders.find((x) => x.providerId === 'claude-hosted');
    assert.ok(rejection !== undefined, 'the external provider rejection must be recorded');
    assert.match(rejection?.reason ?? '', /deployment_class_not_permitted/);
    // And the degradation is planned and recorded.
    assert.ok((r.record.plan?.degradations.length ?? 0) > 0, 'reduced capability ⇒ degradation');
    assert.equal(r.record.capabilityTier, 'B');
  });

  test('a task override changes the preference order', () => {
    const r = route('TRANSLATE_TEXT', [text('x', 'INTERNAL')], providers, DEFAULT_EGRESS_POLICY, OPEN_PROJECT, {
      defaultPreferenceOrder: ['claude-hosted', 'asdp-private-llm'],
      taskOverrides: { TRANSLATE_TEXT: ['asdp-private-llm', 'claude-hosted'] },
    });
    assert.equal(r.kind, 'routed');
    if (r.kind !== 'routed') return;
    assert.equal(r.record.selectedProvider, 'asdp-private-llm');
  });

  test('measured Arabic quality tier can exclude a provider', () => {
    const r = route('EXTRACT_EVIDENCE', [text('التحقق', 'RESTRICTED')], providers, DEFAULT_EGRESS_POLICY, OPEN_PROJECT, {
      defaultPreferenceOrder: ['asdp-private-llm'],
      minimumQualityTier: 'B',
    }, ['ar']);
    // The private endpoint is tier C for Arabic, so it is excluded and nothing
    // else is eligible for RESTRICTED content.
    assert.equal(r.kind, 'refused');
    if (r.kind !== 'refused') return;
    assert.match(
      r.record.rejectedProviders.map((x) => x.reason).join(' '),
      /measured quality tier 'C' for 'ar'/,
    );
  });

  test('VISION ON RESTRICTED CONTENT IS REFUSED — the OD-1 scope consequence', () => {
    // The only vision-capable provider is external, and RESTRICTED content may
    // not go there. Vision has no degradation path, so the task is refused.
    const r = route('EXTRACT_EVIDENCE', [image('RESTRICTED')], providers, DEFAULT_EGRESS_POLICY, OPEN_PROJECT, {
      defaultPreferenceOrder: ['claude-hosted', 'asdp-private-llm'],
    });
    assert.equal(r.kind, 'refused');
    if (r.kind !== 'refused') return;
    assert.match(r.detail, /vision/i);
  });

  test('a refusal names the blocker rather than degrading silently', () => {
    const r = route('EXTRACT_EVIDENCE', [text('x', 'PROHIBITED')], providers, DEFAULT_EGRESS_POLICY, OPEN_PROJECT, {
      defaultPreferenceOrder: ['claude-hosted'],
    });
    assert.equal(r.kind, 'refused');
    if (r.kind !== 'refused') return;
    assert.equal(r.record.eligibleProviders.length, 0);
    assert.match(r.detail, /no provider may receive PROHIBITED content/);
  });
});

// ---------------------------------------------------------------------------
// Broker — invariant I1 and I8
// ---------------------------------------------------------------------------

describe('proposal broker (ADR-0004)', () => {
  test('THE BROKER EMITS A PROPOSAL, NEVER DOMAIN STATE', async () => {
    const { deps, interactions } = brokerDeps();
    const outcome = await invoke(deps, {
      projectId: 'p1',
      taskType: 'EXTRACT_EVIDENCE',
      taskVersion: '1',
      promptVersion: 'prompt-1',
      systemInstruction: 'extract',
      content: [text('policy text', 'INTERNAL')],
      project: OPEN_PROJECT,
    });
    assert.equal(outcome.kind, 'proposal');
    if (outcome.kind !== 'proposal') return;
    assert.equal(outcome.proposal.status, 'pending', 'always pending: a human must accept it');
    assert.equal(outcome.proposal.reviewedBy, undefined);
    assert.equal(interactions.length, 1, 'the interaction is recorded by the broker itself');
  });

  test('the interaction records the full routing decision (invariant I8)', async () => {
    const { deps, interactions } = brokerDeps();
    await invoke(deps, {
      projectId: 'p1',
      taskType: 'EXTRACT_EVIDENCE',
      taskVersion: '1',
      promptVersion: 'prompt-1',
      systemInstruction: 'extract',
      content: [text('restricted', 'RESTRICTED')],
      project: OPEN_PROJECT,
    });
    const i = interactions[0];
    assert.ok(i !== undefined);
    assert.equal(i?.providerId, 'asdp-private-llm');
    assert.equal(i?.deploymentClass, 'on_premise');
    assert.equal(i?.routing.contentClassification, 'RESTRICTED');
    assert.ok(i?.routing.rejectedProviders.length ?? 0 > 0, 'why each provider was rejected');
    assert.ok((i?.routing.degradations.length ?? 0) > 0, 'degradations recorded');
    assert.equal(i?.humanVerdict, 'pending');
  });

  test('a refusal offers concrete options and records NO interaction', async () => {
    const { deps, interactions } = brokerDeps();
    const outcome = await invoke(deps, {
      projectId: 'p1',
      taskType: 'EXTRACT_EVIDENCE',
      taskVersion: '1',
      promptVersion: 'prompt-1',
      systemInstruction: 'extract',
      content: [text('x', 'PROHIBITED')],
      project: OPEN_PROJECT,
    });
    assert.equal(outcome.kind, 'refused');
    if (outcome.kind !== 'refused') return;
    assert.ok(outcome.options.length > 0);
    assert.match(outcome.options.join(' '), /deterministic parsing/);
    assert.equal(interactions.length, 0, 'a PROHIBITED source produces no AiInteraction at all');
  });

  test('a vision refusal offers transcription rather than a silent downgrade', async () => {
    const { deps } = brokerDeps();
    const outcome = await invoke(deps, {
      projectId: 'p1',
      taskType: 'EXTRACT_EVIDENCE',
      taskVersion: '1',
      promptVersion: 'prompt-1',
      systemInstruction: 'extract',
      content: [image('RESTRICTED')],
      project: OPEN_PROJECT,
    });
    assert.equal(outcome.kind, 'refused');
    if (outcome.kind !== 'refused') return;
    assert.match(outcome.options.join(' '), /manual transcription/);
  });

  test('citations are never dropped: absent native support the mode is post_hoc', async () => {
    const { deps, interactions } = brokerDeps();
    await invoke(deps, {
      projectId: 'p1',
      taskType: 'EXTRACT_EVIDENCE',
      taskVersion: '1',
      promptVersion: 'prompt-1',
      systemInstruction: 'extract',
      content: [text('restricted', 'RESTRICTED')],
      project: OPEN_PROJECT,
    });
    assert.ok(interactions[0]?.routing.degradations.includes('post_hoc_citations'));
  });

  test('a provider failure surfaces visibly, with no silent fallback', async () => {
    const failing = createPrivateEndpointProvider({
      providerId: 'asdp-private-llm',
      endpointUrl: 'http://internal/model',
      modelId: 'local-small',
      contextUnits: 32_000,
      maxOutputUnits: 4_000,
      capabilities: ['schemaConstrainedOutput'],
      transport: async () => {
        throw new Error('endpoint unreachable');
      },
    });
    const { deps } = brokerDeps([failing]);
    const outcome = await invoke(deps, {
      projectId: 'p1',
      taskType: 'EXTRACT_EVIDENCE',
      taskVersion: '1',
      promptVersion: 'prompt-1',
      systemInstruction: 'extract',
      content: [text('x', 'INTERNAL')],
      project: OPEN_PROJECT,
    });
    assert.equal(outcome.kind, 'refused');
    if (outcome.kind !== 'refused') return;
    assert.match(outcome.detail, /endpoint unreachable/);
  });
});

// ---------------------------------------------------------------------------
// Null provider
// ---------------------------------------------------------------------------

describe('null provider', () => {
  test('the application stays navigable and HONEST with no AI at all', async () => {
    const nul = createNullProvider();
    assert.equal((await nul.health()).ok, true);
    assert.deepEqual(nul.descriptor().models[0]?.capabilities, []);
    await assert.rejects(
      () =>
        nul.invoke(
          {
            taskType: 'EXTRACT_EVIDENCE', taskVersion: '1', systemInstruction: 'x',
            content: [text('x', 'PUBLIC')], outputContract: { mode: 'schema' },
            citationMode: 'none', determinism: 'deterministic', reasoningTier: 'standard',
            languageHints: [],
          },
          'none',
        ),
      /no AI provider is configured/,
    );
  });

  test('routing to the null provider refuses every capability-requiring task', () => {
    const r = route('EXTRACT_EVIDENCE', [text('x', 'PUBLIC')], [createNullProvider().descriptor()],
      DEFAULT_EGRESS_POLICY, OPEN_PROJECT, { defaultPreferenceOrder: ['null'] });
    assert.equal(r.kind, 'refused');
  });
});

// ---------------------------------------------------------------------------
// Token accounting
// ---------------------------------------------------------------------------

describe('token accounting (ADR-0020 §3.1)', () => {
  test('a non-native count is FLAGGED as non-native, never presented as authoritative', async () => {
    const provider = claudeWithTransport();
    const count = await provider.countTokens('التحقق من الهوية', 'model-large');
    assert.equal(count.providerNative, false, 'must be flagged');
  });

  test('a provider-native counter is flagged as native', async () => {
    const provider = createClaudeProvider({
      models: [{
        modelId: 'm', displayName: 'm', contextUnits: 1000, maxOutputUnits: 100,
        capabilities: ['schemaConstrainedOutput'],
        inputUnitCost: 1, cachedInputUnitCost: 1, outputUnitCost: 1,
      }],
      retentionDays: 0,
      trainingOptOut: true,
      tokenCounter: async () => 42,
    });
    const count = await provider.countTokens('x', 'm');
    assert.equal(count.units, 42);
    assert.equal(count.providerNative, true);
  });
});
