/**
 * Tests for @asdp/domain.
 *
 * Phase 1 acceptance criteria 4, 5, 7 and the invariant obligations from
 * domain-model.md §8.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import type { Approval, Gate } from '@asdp/schemas';
import {
  canonicalJson,
  contentHash,
  canonicalText,
  textContentHash,
  computeBaselineHash,
  freezeBaseline,
  diffBaselines,
  canEnterStage,
  evaluateGate,
  approveGate,
  reopenIfInvalidated,
  isApprovalExpired,
  defaultGatePolicy,
  computeConfidence,
  requiresHumanConfirmation,
  permittedOnExecutablePath,
  InvariantViolation,
  assertD1_evidenceAnchorVerified,
  assertD2_evidenceOrRationale,
  assertD3_humanOnlyApproval,
  evaluateD4_g1Blockers,
  assertD7_asciiIdentifier,
  assertD7_variableName,
  assertD7_jobType,
  assertD9_artifactOrigin,
  deriveD10_requirementClassification,
  assertD10_classificationNotLowered,
  assertD12_releaseNotFrozen,
  assertD14_proposalApplication,
  allocateD15_requirementId,
  assertD15_notReused,
} from './index.ts';

// ---------------------------------------------------------------------------
// Canonicalisation (acceptance criterion 5)
// ---------------------------------------------------------------------------

describe('canonical serialisation (ADR-0016 §3)', () => {
  test('key order does not affect the canonical form', () => {
    const a = canonicalJson({ b: 1, a: 2, c: { z: 1, y: 2 } });
    const b = canonicalJson({ c: { y: 2, z: 1 }, a: 2, b: 1 });
    assert.equal(a, b);
  });

  test('DETERMINISM: identical logical value yields an identical hash', () => {
    const value = { name: 'Verify identity', retries: 3, tags: ['a', 'b'] };
    assert.equal(contentHash(value), contentHash({ ...value }));
  });

  test('UNICODE STABILITY: NFC and NFD Arabic yield ONE hash', () => {
    // The fixture must contain a character that actually decomposes, or the test
    // passes vacuously. Hamza-bearing letters (أ U+0623, إ U+0625) decompose;
    // plain Arabic letters do not — a fixture of 'التحقق من الهوية' proves nothing.
    const label = 'إتمام التحقق — أحمد علي';
    const nfc = { label: label.normalize('NFC') };
    const nfd = { label: label.normalize('NFD') };
    assert.notEqual(nfc.label, nfd.label, 'fixture must differ before canonicalisation');
    assert.equal(contentHash(nfc), contentHash(nfd));
  });

  test('nested and array values are also NFC-stabilised', () => {
    const label = 'أحمد';
    const nested = (form: 'NFC' | 'NFD') => ({
      steps: [{ name: label.normalize(form) }, { name: 'plain' }],
    });
    assert.notEqual(
      JSON.stringify(nested('NFC')),
      JSON.stringify(nested('NFD')),
      'fixture must differ before canonicalisation',
    );
    assert.equal(contentHash(nested('NFC')), contentHash(nested('NFD')));
  });

  test('a single field change alters the hash', () => {
    assert.notEqual(contentHash({ retries: 3 }), contentHash({ retries: 4 }));
  });

  test('undefined values are omitted, not serialised', () => {
    assert.equal(canonicalJson({ a: 1, b: undefined }), '{"a":1}');
  });

  test('rejects non-finite numbers and Date objects', () => {
    assert.throws(() => canonicalJson({ n: Number.NaN }), /non-finite/);
    assert.throws(() => canonicalJson({ d: new Date(0) }), /Date cannot be canonicalised/);
  });

  test('canonical text normalises line endings, trailing space and BOM', () => {
    const messy = '﻿line one   \r\nline two\t\r\n\r\n';
    assert.equal(canonicalText(messy), 'line one\nline two\n');
  });

  test('CANONICAL STABILITY: re-canonicalising is idempotent', () => {
    const once = canonicalText('a  \r\nb\r\n');
    assert.equal(canonicalText(once), once);
    assert.equal(textContentHash(once), textContentHash('a\nb'));
  });
});

// ---------------------------------------------------------------------------
// Baselines
// ---------------------------------------------------------------------------

describe('baselines (ADR-0016)', () => {
  const members = [
    { artifactId: 'art-b', versionId: 'v1', contentHash: 'b'.repeat(64) },
    { artifactId: 'art-a', versionId: 'v2', contentHash: 'a'.repeat(64) },
  ];
  const input = {
    projectId: 'p1',
    stage: 'requirements' as const,
    members,
    rafVersion: 'raf-1.1',
    rulePackVersion: 'rp-1.2',
    camundaTargetProfileId: 'camunda-8x-baseline',
  };

  test('member collection order does not affect the hash', () => {
    const h1 = computeBaselineHash(input);
    const h2 = computeBaselineHash({ ...input, members: [...members].reverse() });
    assert.equal(h1, h2);
  });

  test('a single member version change alters the hash', () => {
    const changed = [
      { artifactId: 'art-b', versionId: 'v2', contentHash: 'c'.repeat(64) },
      members[1]!,
    ];
    assert.notEqual(computeBaselineHash(input), computeBaselineHash({ ...input, members: changed }));
  });

  test('pinned versions are part of the hash', () => {
    assert.notEqual(
      computeBaselineHash(input),
      computeBaselineHash({ ...input, rulePackVersion: 'rp-1.1' }),
    );
    assert.notEqual(
      computeBaselineHash(input),
      computeBaselineHash({ ...input, camundaTargetProfileId: 'camunda-8x-next' }),
    );
  });

  test('freezing rejects a duplicate artifact', () => {
    assert.throws(
      () =>
        freezeBaseline('bl-1', {
          ...input,
          members: [members[0]!, { ...members[0]!, versionId: 'v9' }],
        }, '2026-08-22T00:00:00Z'),
      /ambiguous/,
    );
  });

  test('diff reports added, removed and changed artifacts', () => {
    const from = freezeBaseline('bl-1', input, '2026-08-22T00:00:00Z');
    const to = freezeBaseline(
      'bl-2',
      {
        ...input,
        members: [
          { artifactId: 'art-a', versionId: 'v3', contentHash: 'd'.repeat(64) },
          { artifactId: 'art-c', versionId: 'v1', contentHash: 'e'.repeat(64) },
        ],
      },
      '2026-08-22T01:00:00Z',
    );
    const d = diffBaselines(from, to);
    assert.deepEqual(d.added, ['art-c']);
    assert.deepEqual(d.removed, ['art-b']);
    assert.deepEqual(d.changed, ['art-a']);
  });
});

// ---------------------------------------------------------------------------
// Gates (acceptance criterion 7)
// ---------------------------------------------------------------------------

function gate(code: 'G0' | 'G1' | 'G2' | 'G3' | 'G4', status: Gate['status']): Gate {
  return { code, projectId: 'p1', status, policy: defaultGatePolicy(code) };
}

function allGates(overrides: Partial<Record<Gate['code'], Gate>> = {}) {
  const base = {
    G0: gate('G0', 'not_ready'),
    G1: gate('G1', 'not_ready'),
    G2: gate('G2', 'not_ready'),
    G3: gate('G3', 'not_ready'),
    G4: gate('G4', 'not_ready'),
  };
  return { ...base, ...overrides };
}

describe('read-locks — the structural prevention of silent conversion', () => {
  test('the specification stage is locked until G1 is approved', () => {
    const locked = canEnterStage('specification', { gates: allGates() });
    assert.equal(locked.allowed, false);
    if (locked.allowed) return;
    assert.equal(locked.blockingGate, 'G1');

    const open = canEnterStage('specification', {
      gates: allGates({ G1: gate('G1', 'approved') }),
    });
    assert.equal(open.allowed, true);
  });

  test('GENERATION is locked until G2 is approved', () => {
    const locked = canEnterStage('generation', {
      gates: allGates({ G1: gate('G1', 'approved') }),
    });
    assert.equal(locked.allowed, false);
    if (locked.allowed) return;
    assert.equal(locked.blockingGate, 'G2');
    assert.match(locked.reason, /read-locked/);
  });

  test('intake and analysis are never locked', () => {
    assert.equal(canEnterStage('intake', { gates: allGates() }).allowed, true);
    assert.equal(canEnterStage('analysis', { gates: allGates() }).allowed, true);
  });

  test('release is locked until G3 is approved', () => {
    assert.equal(canEnterStage('release', { gates: allGates() }).allowed, false);
    assert.equal(
      canEnterStage('release', { gates: allGates({ G3: gate('G3', 'approved') }) }).allowed,
      true,
    );
  });
});

describe('gate approval (ADR-0017)', () => {
  const baselineHash = 'a'.repeat(64);
  const attempt = {
    approver: 'user-approver',
    roleAtApproval: 'BusinessApprover' as const,
    baselineHash,
    validationRunId: 'run-1',
    contentAuthors: ['user-analyst'],
    existingApprovals: [] as Approval[],
  };

  test('a gate with blocking findings cannot be approved', () => {
    const g = evaluateGate(gate('G1', 'not_ready'), {
      blockingFindingIds: ['L4-SPEC-005@x'],
      baselineHash,
      validationRunId: 'run-1',
    });
    assert.equal(g.status, 'not_ready');
    const r = approveGate(g, attempt);
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.match(r.reason, /not ready/);
  });

  test('a clean evaluation makes the gate ready, and it can then be approved', () => {
    const g = evaluateGate(gate('G1', 'not_ready'), {
      blockingFindingIds: [],
      baselineHash,
      validationRunId: 'run-1',
    });
    assert.equal(g.status, 'ready');
    const r = approveGate(g, attempt);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.gate.status, 'approved');
    assert.equal(r.gate.approvedBaselineHash, baselineHash);
  });

  test('an unauthorised role is rejected', () => {
    const g = gate('G1', 'ready');
    const r = approveGate(g, { ...attempt, roleAtApproval: 'Viewer' });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.match(r.reason, /may not approve/);
  });

  test('SEGREGATION OF DUTIES: an author cannot approve their own content', () => {
    const g = gate('G1', 'ready');
    const r = approveGate(g, { ...attempt, approver: 'user-analyst' });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.match(r.reason, /segregation of duties/);
  });

  test('quorum of 2 keeps the gate closed after one signature', () => {
    const g = gate('G2', 'ready');
    assert.equal(g.policy.quorum, 2);
    const first = approveGate(g, { ...attempt, roleAtApproval: 'BusinessApprover' });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.gate.status, 'ready', 'still closed: quorum not met');

    const existing: Approval[] = [
      {
        id: 'ap-1',
        projectId: 'p1',
        gate: 'G2',
        baselineId: 'bl-1',
        signedBaselineHash: baselineHash,
        validationRunId: 'run-1',
        approver: 'user-approver',
        roleAtApproval: 'BusinessApprover',
        decision: 'approve',
        comment: '',
        at: '2026-08-22T00:00:00Z',
      },
    ];
    const second = approveGate(g, {
      ...attempt,
      approver: 'user-architect',
      roleAtApproval: 'ProcessArchitect',
      existingApprovals: existing,
    });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.gate.status, 'approved', 'quorum met');
  });

  test('the same approver cannot sign twice', () => {
    const g = gate('G2', 'ready');
    const existing: Approval[] = [
      {
        id: 'ap-1', projectId: 'p1', gate: 'G2', baselineId: 'bl-1',
        signedBaselineHash: baselineHash, validationRunId: 'run-1',
        approver: 'user-approver', roleAtApproval: 'BusinessApprover',
        decision: 'approve', comment: '', at: '2026-08-22T00:00:00Z',
      },
    ];
    const r = approveGate(g, { ...attempt, existingApprovals: existing });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.match(r.reason, /already approved/);
  });
});

describe('automatic reopening (acceptance criterion 7)', () => {
  const baselineHash = 'a'.repeat(64);
  const approval: Approval = {
    id: 'ap-1', projectId: 'p1', gate: 'G1', baselineId: 'bl-1',
    signedBaselineHash: baselineHash, validationRunId: 'run-1',
    approver: 'u', roleAtApproval: 'BusinessApprover',
    decision: 'approve', comment: '', at: '2026-08-22T00:00:00Z',
  };

  test('changing the baseline content reopens the gate', () => {
    const g: Gate = { ...gate('G1', 'approved'), approvedBaselineHash: baselineHash };
    const r = reopenIfInvalidated(g, approval, {
      baselineHash: 'b'.repeat(64),
      validationRunId: 'run-1',
    });
    assert.equal(r.reopened, true);
    assert.equal(r.gate.status, 'reopened');
    assert.equal(r.gate.approvedBaselineHash, undefined);
    assert.match(r.reason ?? '', /baseline content changed/);
  });

  test('changing the validation evidence reopens the gate', () => {
    const g: Gate = { ...gate('G1', 'approved'), approvedBaselineHash: baselineHash };
    const r = reopenIfInvalidated(g, approval, { baselineHash, validationRunId: 'run-2' });
    assert.equal(r.reopened, true);
    assert.match(r.reason ?? '', /validation evidence changed/);
  });

  test('an unchanged baseline and run keeps the gate approved', () => {
    const g: Gate = { ...gate('G1', 'approved'), approvedBaselineHash: baselineHash };
    const r = reopenIfInvalidated(g, approval, { baselineHash, validationRunId: 'run-1' });
    assert.equal(r.reopened, false);
    assert.equal(r.gate.status, 'approved');
  });

  test('an approval older than the policy expiry is expired', () => {
    assert.equal(isApprovalExpired(approval, defaultGatePolicy('G1'), '2026-09-01T00:00:00Z'), false);
    assert.equal(isApprovalExpired(approval, defaultGatePolicy('G1'), '2027-01-01T00:00:00Z'), true);
  });
});

// ---------------------------------------------------------------------------
// Confidence (ADR-0011)
// ---------------------------------------------------------------------------

describe('computed confidence (ADR-0011)', () => {
  const strong = {
    extractionMode: 'extracted' as const,
    evidenceCount: 3,
    sourceAuthorityRank: 0,
    crossSourceAgreement: 'corroborated' as const,
    anchorPrecision: 'exact' as const,
    providerCapabilityTier: 'A' as const,
    degradations: [],
  };

  test('well-sourced extracted content is HIGH', () => {
    assert.equal(computeConfidence(strong).band, 'HIGH');
  });

  test('inference with no evidence is LOW', () => {
    const r = computeConfidence({
      ...strong,
      extractionMode: 'inferred',
      evidenceCount: 0,
      anchorPrecision: 'none',
      crossSourceAgreement: 'silent',
    });
    assert.equal(r.band, 'LOW');
  });

  test('POLICY-DRIVEN ROUTING IS VISIBLE: a lower provider tier reduces confidence', () => {
    const tierA = computeConfidence(strong);
    const tierC = computeConfidence({ ...strong, providerCapabilityTier: 'C' });
    assert.ok(tierC.score < tierA.score, 'tier C must score lower than tier A');
    assert.match(tierC.explanation, /provider tier C/);
  });

  test('degradation reduces confidence and is named in the explanation', () => {
    const clean = computeConfidence(strong);
    const degraded = computeConfidence({
      ...strong,
      degradations: ['chunked_context', 'post_hoc_citations'],
    });
    assert.ok(degraded.score < clean.score);
    assert.match(degraded.explanation, /degraded extraction/);
    assert.match(degraded.explanation, /chunked_context/);
  });

  test('contradiction reduces confidence sharply', () => {
    const r = computeConfidence({ ...strong, crossSourceAgreement: 'contradicted' });
    assert.notEqual(r.band, 'HIGH');
    assert.match(r.explanation, /contradicted/);
  });

  test('the band is explainable in one sentence', () => {
    const r = computeConfidence({ ...strong, evidenceCount: 1, crossSourceAgreement: 'silent' });
    assert.ok(r.explanation.startsWith(r.band));
    assert.ok(r.explanation.endsWith('.'));
    assert.ok(r.explanation.length < 250);
  });

  test('the function version is recorded so old bands stay interpretable', () => {
    assert.equal(computeConfidence(strong).version, 'confidence-1');
  });

  test('inferred content always requires human confirmation', () => {
    assert.equal(requiresHumanConfirmation('HIGH', 'inferred'), true);
    assert.equal(requiresHumanConfirmation('LOW', 'extracted'), true);
    assert.equal(requiresHumanConfirmation('HIGH', 'extracted'), false);
  });

  test('unconfirmed inference may not sit on an executable path (L4-TRACE-005)', () => {
    assert.equal(permittedOnExecutablePath('HIGH', 'inferred', false), false);
    assert.equal(permittedOnExecutablePath('HIGH', 'inferred', true), true);
    assert.equal(permittedOnExecutablePath('LOW', 'extracted', false), false);
    assert.equal(permittedOnExecutablePath('HIGH', 'extracted', false), true);
  });
});

// ---------------------------------------------------------------------------
// Invariants
// ---------------------------------------------------------------------------

describe('domain invariants D1–D15', () => {
  test('D1 rejects unverified evidence anchors', () => {
    assert.throws(() => assertD1_evidenceAnchorVerified(false), InvariantViolation);
    assert.doesNotThrow(() => assertD1_evidenceAnchorVerified(true));
  });

  test('D2 requires evidence at L1/L2 and a rationale for inference', () => {
    assert.throws(() => assertD2_evidenceOrRationale('L1', 'extracted', 0, undefined), /D2/);
    assert.throws(() => assertD2_evidenceOrRationale('L3', 'inferred', 0, '  '), /inferenceRationale/);
    assert.doesNotThrow(() => assertD2_evidenceOrRationale('L1', 'extracted', 1, undefined));
    assert.doesNotThrow(() => assertD2_evidenceOrRationale('L3', 'inferred', 0, 'stated reason'));
  });

  test('D3 forbids AI from setting L4 — the structural expression of ADR-0007', () => {
    assert.throws(() => assertD3_humanOnlyApproval('L4', 'ai'), /only a human-initiated command/);
    assert.throws(() => assertD3_humanOnlyApproval('L4', 'system'), /D3/);
    assert.doesNotThrow(() => assertD3_humanOnlyApproval('L4', 'human'));
    assert.doesNotThrow(() => assertD3_humanOnlyApproval('L2', 'ai'), 'AI may propose L2');
  });

  test('D4 enumerates every G1 blocker', () => {
    const reasons = evaluateD4_g1Blockers({
      blockingFlagCount: 2,
      unresolvedConflictCount: 1,
      unansweredBlockingQuestionCount: 3,
      nonL4RequirementCount: 4,
      emptyRequiredSlotCount: 1,
    });
    assert.equal(reasons.length, 5);
    assert.equal(
      evaluateD4_g1Blockers({
        blockingFlagCount: 0, unresolvedConflictCount: 0,
        unansweredBlockingQuestionCount: 0, nonL4RequirementCount: 0,
        emptyRequiredSlotCount: 0,
      }).length,
      0,
    );
  });

  test('D7 enforces ASCII identifiers, FEEL-safe variables and job types', () => {
    assert.doesNotThrow(() => assertD7_asciiIdentifier('element id', 'Activity_verify_1'));
    assert.throws(() => assertD7_asciiIdentifier('element id', 'نشاط_1'), /must be ASCII/);
    assert.throws(() => assertD7_variableName('application.amount'), /FEEL operators/);
    assert.throws(() => assertD7_variableName('مبلغ'), /D7/);
    assert.doesNotThrow(() => assertD7_jobType('identity.verify'));
    assert.throws(() => assertD7_jobType('IdentityVerify'), /domain>\.<action/);
  });

  test('D9 admits only compiler and import origins — never human (ADR-0002)', () => {
    assert.doesNotThrow(() => assertD9_artifactOrigin('compiler'));
    assert.doesNotThrow(() => assertD9_artifactOrigin('import'));
    assert.throws(() => assertD9_artifactOrigin('human'), /never hand-authored/);
  });

  test('D10 derives classification as the maximum and forbids unauthorised lowering', () => {
    assert.equal(
      deriveD10_requirementClassification(['INTERNAL', 'CONFIDENTIAL'], ['PUBLIC']),
      'CONFIDENTIAL',
    );
    assert.throws(
      () => assertD10_classificationNotLowered('RESTRICTED', 'INTERNAL', false),
      /requires an authorised, audited act/,
    );
    assert.doesNotThrow(() => assertD10_classificationNotLowered('RESTRICTED', 'INTERNAL', true));
    assert.doesNotThrow(() => assertD10_classificationNotLowered('INTERNAL', 'RESTRICTED', false));
  });

  test('D12 freezes a handed-off release permanently', () => {
    assert.throws(() => assertD12_releaseNotFrozen('handed_off'), /frozen permanently/);
    assert.doesNotThrow(() => assertD12_releaseNotFrozen('candidate'));
  });

  test('D14 permits proposal application only by a human', () => {
    assert.throws(() => assertD14_proposalApplication('ai'), /human-initiated/);
    assert.doesNotThrow(() => assertD14_proposalApplication('human'));
  });

  test('D15 allocates monotonic requirement ids and forbids reuse', () => {
    assert.equal(allocateD15_requirementId(41), 'REQ-0042');
    assert.equal(allocateD15_requirementId(0), 'REQ-0001');
    assert.throws(
      () => assertD15_notReused('REQ-0042', new Set(['REQ-0042'])),
      /may never be reused/,
    );
    assert.doesNotThrow(() => assertD15_notReused('REQ-0043', new Set(['REQ-0042'])));
  });
});
