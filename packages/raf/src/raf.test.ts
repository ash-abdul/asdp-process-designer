/**
 * Tests for @asdp/raf.
 *
 * The point of owning the frame in code (ADR-0010) is that gap analysis is
 * arithmetic: reproducible, provider-independent, auditable. These tests assert
 * exactly that.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  RAF_VERSION,
  RAF_SLOTS,
  RAF_SLOT_KEYS,
  REQUIRED_SLOT_KEYS,
  DISJOINTNESS_RULES,
  slotDefinition,
  resolveDisjointSlot,
  slotStatus,
  computeFrameCoverage,
  requiredSlotSummary,
  type SlotObservation,
  type RafSlotKey,
} from './index.ts';

const EMPTY_MIX = { l1: 0, l2: 0, l3: 0, l4: 0 };

function obs(slot: RafSlotKey, over: Partial<SlotObservation> = {}): SlotObservation {
  return {
    slot,
    itemCount: 1,
    evidenceCount: 2,
    distinctSourceCount: 2,
    sourceInventory: [],
    confidenceBand: 'HIGH',
    epistemicMix: { l1: 2, l2: 0, l3: 0, l4: 2 },
    ...over,
  };
}

describe('frame definition', () => {
  test('v1.1 has exactly 27 slots', () => {
    assert.equal(RAF_SLOTS.length, 27);
    assert.equal(RAF_SLOT_KEYS.length, 27);
    assert.equal(RAF_VERSION, 'raf-1.1');
  });

  test('slot keys are unique', () => {
    assert.equal(new Set(RAF_SLOT_KEYS).size, 27);
  });

  test('nine slots are required for executability', () => {
    assert.equal(REQUIRED_SLOT_KEYS.length, 9);
    for (const k of [
      'businessObjective', 'serviceDescription', 'actors', 'trigger',
      'processSteps', 'outcomes', 'inputs', 'outputs', 'dataRequirements',
    ] as const) {
      assert.ok(REQUIRED_SLOT_KEYS.includes(k), `${k} must be required`);
    }
  });

  test('the v1.1 additions are present', () => {
    for (const k of ['scopeAndExclusions', 'successMeasures', 'currentStateProcess'] as const) {
      assert.ok(RAF_SLOT_KEYS.includes(k), `${k} added in v1.1`);
    }
  });

  test('the merged v1.0 slots are absent', () => {
    const keys = RAF_SLOT_KEYS as readonly string[];
    assert.ok(!keys.includes('complianceAndPolicyBasis'), 'merged into constraints');
    assert.ok(!keys.includes('openIssuesFromSources'), 'merged into openQuestions');
  });

  test('successMeasures populates SpecKpi — the traceability hole v1.1 closed', () => {
    assert.ok(slotDefinition('successMeasures').populates.includes('SpecKpi'));
  });

  test('every slot has a business question and a group', () => {
    for (const s of RAF_SLOTS) {
      assert.ok(s.question.length > 10, `${s.key} needs a question`);
      assert.ok(s.group.length > 0);
    }
  });

  test('unknown slot keys are rejected', () => {
    assert.throws(() => slotDefinition('nonsense' as RafSlotKey), /unknown RAF slot/);
  });
});

describe('disjointness rules (new in v1.1)', () => {
  test('four pairs are defined', () => {
    assert.equal(DISJOINTNESS_RULES.length, 4);
  });

  test('every rule references real slots', () => {
    for (const r of DISJOINTNESS_RULES) {
      assert.ok(RAF_SLOT_KEYS.includes(r.primary));
      assert.ok(RAF_SLOT_KEYS.includes(r.secondary));
      assert.ok(r.rule.length > 40, 'the rule must actually state the distinction');
    }
  });

  test('an item satisfying both members is assigned to the primary and counted ONCE', () => {
    const r = resolveDisjointSlot(['responsibilities', 'actors']);
    assert.equal(r.slot, 'actors', 'primary wins');
    assert.equal(r.crossReference, 'responsibilities');
    assert.ok((r.rule ?? '').length > 0);
  });

  test('exceptions beats escalations for a dual-candidate item', () => {
    const r = resolveDisjointSlot(['escalations', 'exceptions']);
    assert.equal(r.slot, 'exceptions');
  });

  test('a single candidate is returned unchanged with no cross-reference', () => {
    const r = resolveDisjointSlot(['decisions']);
    assert.equal(r.slot, 'decisions');
    assert.equal(r.crossReference, undefined);
  });

  test('no candidates is an error, not a silent default', () => {
    assert.throws(() => resolveDisjointSlot([]), /no candidate slots/);
  });
});

describe('slot status is deterministic', () => {
  test('adequate when well-sourced', () => {
    assert.equal(slotStatus(obs('processSteps')), 'adequate');
  });

  test('empty when no items', () => {
    assert.equal(slotStatus(obs('processSteps', { itemCount: 0 })), 'empty');
  });

  test('weak when everything is inferred (no evidence)', () => {
    assert.equal(slotStatus(obs('decisions', { evidenceCount: 0 })), 'weak');
  });

  test('weak when confidence is LOW', () => {
    assert.equal(slotStatus(obs('decisions', { confidenceBand: 'LOW' })), 'weak');
  });

  test('weak when inference outweighs evidence', () => {
    assert.equal(
      slotStatus(obs('decisions', { epistemicMix: { l1: 1, l2: 0, l3: 3, l4: 0 } })),
      'weak',
    );
  });

  test('a required slot with a single source is weak', () => {
    assert.equal(slotStatus(obs('trigger', { distinctSourceCount: 1 })), 'weak');
    assert.equal(
      slotStatus(obs('decisions', { distinctSourceCount: 1 })),
      'adequate',
      'non-required slots tolerate a single source',
    );
  });

  test('BLOCKED_BY_POLICY takes precedence over empty — governance is not a content gap', () => {
    const blocked = slotStatus(
      obs('slasAndTimers', {
        itemCount: 0,
        blockedByPolicy: { classification: 'RESTRICTED', provider: 'claude-hosted' },
      }),
    );
    assert.equal(blocked, 'blocked_by_policy', 'must NOT be reported as empty');
  });

  test('status is reproducible for identical observations', () => {
    const o = obs('processSteps', { confidenceBand: 'MEDIUM' });
    assert.equal(slotStatus(o), slotStatus({ ...o }));
  });
});

describe('frame coverage', () => {
  test('omitted slots are treated as empty, never as adequate', () => {
    const c = computeFrameCoverage([obs('businessObjective')], RAF_VERSION);
    assert.equal(c.slots.length, 27);
    const steps = c.slots.find((s) => s.slot === 'processSteps');
    assert.equal(steps?.status, 'empty', 'an omitted slot cannot pass as adequate');
  });

  test('required empty slots become G1 blockers', () => {
    const c = computeFrameCoverage([], RAF_VERSION);
    assert.equal(c.g1Blockers.length, 9, 'all nine required slots block');
    assert.ok(c.g1Blockers.includes('trigger'));
  });

  test('required weak slots need acknowledgement, not blocking', () => {
    const observations = REQUIRED_SLOT_KEYS.map((k) => obs(k, { distinctSourceCount: 1 }));
    const c = computeFrameCoverage(observations, RAF_VERSION);
    assert.equal(c.g1Blockers.length, 0, 'weak does not block');
    assert.equal(c.g1Acknowledgements.length, 9, 'weak requires acknowledgement');
  });

  test('policy-blocked slots are reported separately from missing content', () => {
    const c = computeFrameCoverage(
      [
        obs('slasAndTimers', {
          itemCount: 0,
          blockedByPolicy: { classification: 'RESTRICTED', provider: 'claude-hosted' },
        }),
      ],
      RAF_VERSION,
    );
    assert.deepEqual(c.blockedByPolicy, ['slasAndTimers']);
    const slot = c.slots.find((s) => s.slot === 'slasAndTimers');
    assert.match(slot?.blockedReason ?? '', /analysis denied/);
    assert.match(slot?.blockedReason ?? '', /RESTRICTED/);
  });

  test('a fully populated frame has no blockers', () => {
    const observations = RAF_SLOT_KEYS.map((k) => obs(k));
    const c = computeFrameCoverage(observations, RAF_VERSION);
    assert.equal(c.g1Blockers.length, 0);
    assert.equal(c.missingInformation.length, 0);
    assert.equal(requiredSlotSummary(c).adequate, 9);
  });

  test('source inventory makes provenance visible per slot (v1.1)', () => {
    const c = computeFrameCoverage(
      [
        obs('slasAndTimers', {
          sourceInventory: [
            { sourceId: 's1', sourceKind: 'policy', primaryLanguage: 'ar', authorityRank: 0, itemCount: 2 },
            { sourceId: 's2', sourceKind: 'email', primaryLanguage: 'en', authorityRank: 4, itemCount: 1 },
          ],
        }),
      ],
      RAF_VERSION,
    );
    const slot = c.slots.find((s) => s.slot === 'slasAndTimers');
    assert.equal(slot?.sourceInventory.length, 2);
    assert.equal(slot?.sourceInventory[0]?.primaryLanguage, 'ar');
  });

  test('PROVIDER INDEPENDENCE: the same items yield the same coverage regardless of provider', () => {
    // The frame is filled by AI but measured by code, so a weaker provider that
    // fills the same slots produces a comparable report (ADR-0010 consequence 2).
    const fromStrongProvider = computeFrameCoverage(RAF_SLOT_KEYS.map((k) => obs(k)), RAF_VERSION);
    const fromWeakProvider = computeFrameCoverage(RAF_SLOT_KEYS.map((k) => obs(k)), RAF_VERSION);
    assert.deepEqual(
      fromStrongProvider.slots.map((s) => s.status),
      fromWeakProvider.slots.map((s) => s.status),
    );
  });
});
