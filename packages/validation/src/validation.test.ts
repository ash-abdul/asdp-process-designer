/**
 * Tests for @asdp/validation — the L0 ingestion pack.
 *
 * Two obligations per rule, and both matter:
 *
 *   1. it FIRES on the condition it describes
 *   2. it does NOT fire on clean state
 *
 * A rule pack tested only for (1) will happily flag everything; one tested only
 * for (2) is indistinguishable from an empty function. Phase 1 found a test that
 * passed vacuously, so the clean-state assertion is not optional here.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { spanChecksum } from '@asdp/provenance';
import { codePointLength } from '@asdp/text';
import type { EvidenceItem, Finding, ProvenanceAnchor, Source, SourceUnit } from '@asdp/schemas';
import {
  ARABIC_REORDERING_CONFIDENCE_FLOOR,
  L0_INGESTION_RULES,
  MIN_UNIT_COVERAGE,
  allRules,
  evaluateL0Ingestion,
  summariseFindings,
  type IntakeState,
} from './index.ts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEXT = 'The applicant must supply a valid identity document.';
const ARABIC_TEXT = 'يجب على مقدم الطلب تقديم وثيقة هوية سارية.';

function anchor(text: string, start: number, end: number, over = TEXT): ProvenanceAnchor {
  const quote = Array.from(over).slice(start, end).join('');
  return {
    sourceId: 'src-1',
    target: { kind: 'text_range', charStart: start, charEnd: end },
    quote,
    quoteChecksum: spanChecksum(quote),
    language: 'en',
    direction: 'ltr',
    precision: 'exact',
    extractorVersion: 'test@1',
  };
}

function source(overrides: Partial<Source> = {}): Source {
  return {
    id: 'src-1',
    projectId: 'prj-1',
    filename: 'requirements.txt',
    mimeType: 'text/plain',
    byteSize: TEXT.length,
    sha256: 'a'.repeat(64),
    blobRef: 'sources/aa/aa/' + 'a'.repeat(64) + '.txt',
    uploadedBy: 'u-analyst',
    uploadedAt: '2026-08-22T10:00:00.000Z',
    kind: 'freetext',
    authorityRank: 100,
    effectiveDate: '2026-01-01T00:00:00.000Z',
    primaryLanguage: 'en',
    direction: 'ltr',
    languageRuns: [{ start: 0, end: codePointLength(TEXT), language: 'en', direction: 'ltr' }],
    classification: 'INTERNAL',
    status: 'parsed',
    textLength: codePointLength(TEXT),
    textSha256: 'b'.repeat(64),
    extractorVersion: 'freetext@1',
    extractionMethod: 'text',
    visionPageCount: 0,
    ...overrides,
  };
}

function unit(overrides: Partial<SourceUnit> = {}): SourceUnit {
  return {
    id: 'su-1',
    sourceId: 'src-1',
    projectId: 'prj-1',
    ordinal: 0,
    type: 'paragraph',
    text: TEXT,
    language: 'en',
    direction: 'ltr',
    anchor: anchor(TEXT, 0, codePointLength(TEXT)),
    ...overrides,
  };
}

function evidence(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    id: 'ev-1',
    projectId: 'prj-1',
    sourceId: 'src-1',
    sourceUnitId: 'su-1',
    anchor: anchor(TEXT, 4, 13),
    verbatimText: Array.from(TEXT).slice(4, 13).join(''),
    language: 'en',
    extractedBy: 'parser',
    citationMode: 'none',
    anchorVerified: true,
    classification: 'INTERNAL',
    createdBy: 'u-analyst',
    createdAt: '2026-08-22T10:05:00.000Z',
    ...overrides,
  };
}

/** Clean state: one parsed source, one covering unit, one verified evidence item. */
function cleanState(): IntakeState {
  return {
    sources: [source()],
    units: [unit()],
    evidence: [evidence()],
    textBySourceId: new Map([['src-1', TEXT]]),
  };
}

const ruleIds = (findings: readonly Finding[]): string[] =>
  [...new Set(findings.map((f) => f.ruleId))].sort();

const fired = (findings: readonly Finding[], id: string): boolean =>
  findings.some((f) => f.ruleId === id);

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

describe('L0 rule definitions match the catalogue', () => {
  test('all ten L0-ING rules are implemented', () => {
    const expected = Array.from({ length: 10 }, (_, i) => `L0-ING-${String(i + 1).padStart(3, '0')}`);
    assert.deepEqual(L0_INGESTION_RULES.map((r) => r.id).sort(), expected);
  });

  test('severities and gate assignment match validation-rule-catalog.md §L0', () => {
    const expected: Record<string, string> = {
      'L0-ING-001': 'error',
      'L0-ING-002': 'error',
      'L0-ING-003': 'error',
      'L0-ING-004': 'error',
      'L0-ING-005': 'warning',
      'L0-ING-006': 'error',
      'L0-ING-007': 'warning',
      'L0-ING-008': 'warning',
      'L0-ING-009': 'error',
      'L0-ING-010': 'info',
    };
    for (const rule of L0_INGESTION_RULES) {
      assert.equal(rule.severity, expected[rule.id], `${rule.id} severity`);
      assert.deepEqual(rule.gates, ['G1'], `${rule.id} gates`);
      assert.equal(rule.layer, 'L0');
    }
  });

  test('every rule carries a message key, a fix hint and documentation', () => {
    for (const rule of L0_INGESTION_RULES) {
      assert.ok(rule.messageKey.length > 0, `${rule.id} messageKey`);
      assert.ok(rule.fixHintKey.length > 0, `${rule.id} fixHintKey`);
      assert.ok(rule.documentation.length > 20, `${rule.id} needs real documentation`);
    }
  });

  test('ERROR rules guarding structural integrity are not profile-adjustable', () => {
    // validation-architecture.md: an ERROR protecting traceability cannot be
    // relaxed by a standards profile, or the guarantee is configurable away.
    for (const rule of L0_INGESTION_RULES) {
      if (rule.severity === 'error') {
        assert.equal(rule.profileAdjustable, false, `${rule.id} must not be adjustable`);
      }
    }
  });

  test('allRules exposes the pack', () => {
    assert.equal(allRules().length, 10);
  });
});

// ---------------------------------------------------------------------------
// Clean state
// ---------------------------------------------------------------------------

describe('clean intake state', () => {
  test('PRODUCES NO FINDINGS AT ALL', () => {
    const findings = evaluateL0Ingestion(cleanState(), 'vr-1');
    assert.deepEqual(findings, [], `expected none, got ${ruleIds(findings).join(', ')}`);
  });

  test('empty state produces no findings', () => {
    const findings = evaluateL0Ingestion(
      { sources: [], units: [], evidence: [], textBySourceId: new Map() },
      'vr-1',
    );
    assert.deepEqual(findings, []);
  });

  test('Arabic content is as clean as English content', () => {
    const findings = evaluateL0Ingestion(
      {
        sources: [
          source({
            primaryLanguage: 'ar',
            direction: 'rtl',
            textLength: codePointLength(ARABIC_TEXT),
            languageRuns: [
              { start: 0, end: codePointLength(ARABIC_TEXT), language: 'ar', direction: 'rtl' },
            ],
          }),
        ],
        units: [
          unit({
            text: ARABIC_TEXT,
            language: 'ar',
            direction: 'rtl',
            anchor: {
              ...anchor(ARABIC_TEXT, 0, codePointLength(ARABIC_TEXT), ARABIC_TEXT),
              language: 'ar',
              direction: 'rtl',
            },
          }),
        ],
        evidence: [],
        textBySourceId: new Map([['src-1', ARABIC_TEXT]]),
      },
      'vr-1',
    );
    assert.deepEqual(findings, [], ruleIds(findings).join(', '));
  });
});

// ---------------------------------------------------------------------------
// Each rule fires
// ---------------------------------------------------------------------------

describe('L0-ING-001 — parse failure is never silent', () => {
  test('fires on parse_failed and reports the recorded reason', () => {
    const findings = evaluateL0Ingestion(
      {
        sources: [source({ status: 'parse_failed', parseError: 'adapter threw on line 3' })],
        units: [],
        evidence: [],
        textBySourceId: new Map([['src-1', TEXT]]),
      },
      'vr-1',
    );
    assert.ok(fired(findings, 'L0-ING-001'));
    const f = findings.find((x) => x.ruleId === 'L0-ING-001') as Finding;
    assert.equal(f.messageParams.detail, 'adapter threw on line 3');
    assert.equal(f.severityAtGate.G1, 'error', 'it must BLOCK G1');
  });
});

describe('L0-ING-002 — every unit anchor resolves', () => {
  test('fires when the stored text no longer contains the anchored span', () => {
    const findings = evaluateL0Ingestion(
      { ...cleanState(), textBySourceId: new Map([['src-1', 'completely different content']]) },
      'vr-1',
    );
    assert.ok(fired(findings, 'L0-ING-002'));
    const f = findings.find((x) => x.ruleId === 'L0-ING-002') as Finding;
    assert.equal(f.severityAtGate.G1, 'error');
    assert.equal(f.messageParams.status, 'broken');
  });

  test('fires on a DRIFTED anchor too, because the checksum must verify', () => {
    // The quote is present but at a shifted offset. Within one extractor version
    // the text and units are written together, so drift is a defect.
    const shifted = `PREFIX. ${TEXT}`;
    const findings = evaluateL0Ingestion(
      { ...cleanState(), textBySourceId: new Map([['src-1', shifted]]) },
      'vr-1',
    );
    const f = findings.find((x) => x.ruleId === 'L0-ING-002');
    assert.ok(f !== undefined, 'a drifted anchor must be reported');
    assert.equal(f.messageParams.status, 'drifted');
  });

  test('fires when a source has no stored text at all', () => {
    const findings = evaluateL0Ingestion(
      { ...cleanState(), textBySourceId: new Map() },
      'vr-1',
    );
    assert.ok(fired(findings, 'L0-ING-002'));
  });

  test('the finding id is deterministic across runs', () => {
    const state: IntakeState = {
      ...cleanState(),
      textBySourceId: new Map([['src-1', 'different']]),
    };
    const a = evaluateL0Ingestion(state, 'vr-1').find((f) => f.ruleId === 'L0-ING-002');
    const b = evaluateL0Ingestion(state, 'vr-2').find((f) => f.ruleId === 'L0-ING-002');
    assert.equal(a?.id, b?.id, 'the same defect must have the same id in every run');
    assert.notEqual(a?.runId, b?.runId, 'but the run id differs');
  });
});

describe('L0-ING-003 — evidence anchors are verified', () => {
  test('fires when anchorVerified is false', () => {
    const findings = evaluateL0Ingestion(
      { ...cleanState(), evidence: [evidence({ anchorVerified: false })] },
      'vr-1',
    );
    assert.ok(fired(findings, 'L0-ING-003'));
    const f = findings.find((x) => x.ruleId === 'L0-ING-003') as Finding;
    assert.equal(f.severityAtGate.G1, 'error', 'invariant D1 blocks G1');
  });

  test('fires when a verified-looking anchor no longer resolves', () => {
    const findings = evaluateL0Ingestion(
      { ...cleanState(), textBySourceId: new Map([['src-1', 'unrelated text entirely']]) },
      'vr-1',
    );
    assert.ok(fired(findings, 'L0-ING-003'), 'anchorVerified=true is not taken on trust');
  });
});

describe('L0-ING-004 — NFC and language-tagged', () => {
  test('fires when the stored text is not NFC', () => {
    const decomposed = 'إجراء'.normalize('NFD');
    assert.notEqual(decomposed, decomposed.normalize('NFC'), 'fixture must actually decompose');
    const findings = evaluateL0Ingestion(
      {
        sources: [source({ textLength: codePointLength(decomposed), primaryLanguage: 'ar' })],
        units: [],
        evidence: [],
        textBySourceId: new Map([['src-1', decomposed]]),
      },
      'vr-1',
    );
    assert.ok(fired(findings, 'L0-ING-004'));
  });

  test('fires when no primary language could be determined', () => {
    const findings = evaluateL0Ingestion(
      {
        sources: [source({ primaryLanguage: 'und' })],
        units: [],
        evidence: [],
        textBySourceId: new Map([['src-1', TEXT]]),
      },
      'vr-1',
    );
    assert.ok(fired(findings, 'L0-ING-004'));
  });

  test('fires when no language runs were recorded', () => {
    const findings = evaluateL0Ingestion(
      {
        sources: [source({ languageRuns: [] })],
        units: [],
        evidence: [],
        textBySourceId: new Map([['src-1', TEXT]]),
      },
      'vr-1',
    );
    assert.ok(fired(findings, 'L0-ING-004'));
  });

  test('does NOT fire for content that has no language to determine', () => {
    // A document of whitespace, digits and punctuation has no determinable
    // language. That is an absence of content, which L0-ING-005 reports as a
    // warning — not a normalisation defect that should block G1 as an error.
    const noLetters = '   \n\n 123 -- 456 \n';
    const findings = evaluateL0Ingestion(
      {
        sources: [
          source({
            primaryLanguage: 'und',
            direction: 'neutral',
            languageRuns: [],
            textLength: codePointLength(noLetters),
          }),
        ],
        units: [],
        evidence: [],
        textBySourceId: new Map([['src-1', noLetters]]),
      },
      'vr-1',
    );
    assert.equal(fired(findings, 'L0-ING-004'), false, 'no letters means nothing to tag');
    assert.ok(fired(findings, 'L0-ING-005'), 'the real defect is reported, as a warning');
    assert.equal(summariseFindings(findings, 'G1').errors, 0, 'and it does not block G1');
  });
});

describe('L0-ING-005 — possible truncation', () => {
  test('fires when bytes were ingested but no text was extracted', () => {
    const findings = evaluateL0Ingestion(
      {
        sources: [source({ byteSize: 40_000, textLength: 0, languageRuns: [] })],
        units: [],
        evidence: [],
        textBySourceId: new Map(),
      },
      'vr-1',
    );
    assert.ok(fired(findings, 'L0-ING-005'));
    const f = findings.find((x) => x.ruleId === 'L0-ING-005') as Finding;
    assert.equal(f.severityAtGate.G1, 'warning', 'a sparse document is legitimate');
  });

  test('fires when text was extracted but produced no units', () => {
    const findings = evaluateL0Ingestion(
      {
        sources: [source()],
        units: [],
        evidence: [],
        textBySourceId: new Map([['src-1', TEXT]]),
      },
      'vr-1',
    );
    assert.ok(fired(findings, 'L0-ING-005'));
  });

  test('fires when unit coverage falls below the floor', () => {
    const long = `${TEXT} ${'padding words here. '.repeat(20)}`;
    const findings = evaluateL0Ingestion(
      {
        sources: [source({ textLength: codePointLength(long) })],
        // One short unit over a long document: three quarters of the text
        // produced nothing, which is what truncation looks like.
        units: [unit()],
        evidence: [],
        textBySourceId: new Map([['src-1', long]]),
      },
      'vr-1',
    );
    assert.ok(fired(findings, 'L0-ING-005'));
    assert.ok(MIN_UNIT_COVERAGE > 0 && MIN_UNIT_COVERAGE < 1);
  });

  test('does NOT fire when coverage is adequate', () => {
    const findings = evaluateL0Ingestion(cleanState(), 'vr-1');
    assert.equal(fired(findings, 'L0-ING-005'), false);
  });

  test('does not evaluate coverage for a source that failed to parse', () => {
    // L0-ING-001 already reports that case; a coverage warning on top would be
    // noise pointing at the same defect.
    const findings = evaluateL0Ingestion(
      {
        sources: [source({ status: 'parse_failed', parseError: 'boom', textLength: 0 })],
        units: [],
        evidence: [],
        textBySourceId: new Map(),
      },
      'vr-1',
    );
    assert.equal(fired(findings, 'L0-ING-005'), false);
    assert.ok(fired(findings, 'L0-ING-001'));
  });
});

describe('L0-ING-006 — classification present', () => {
  test('fires on an unknown classification value', () => {
    const findings = evaluateL0Ingestion(
      {
        sources: [source({ classification: 'SECRET' as never })],
        units: [],
        evidence: [],
        textBySourceId: new Map([['src-1', TEXT]]),
      },
      'vr-1',
    );
    assert.ok(fired(findings, 'L0-ING-006'));
  });

  test('does not fire for any valid level', () => {
    for (const level of ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED', 'PROHIBITED'] as const) {
      const findings = evaluateL0Ingestion(
        {
          sources: [source({ classification: level })],
          units: [unit()],
          evidence: [],
          textBySourceId: new Map([['src-1', TEXT]]),
        },
        'vr-1',
      );
      assert.equal(fired(findings, 'L0-ING-006'), false, `${level} is valid`);
    }
  });
});

describe('L0-ING-007 — vision-read pages recorded', () => {
  test('fires when the extraction method is vision but no pages were recorded', () => {
    const findings = evaluateL0Ingestion(
      {
        sources: [source({ extractionMethod: 'vision', visionPageCount: 0 })],
        units: [unit()],
        evidence: [],
        textBySourceId: new Map([['src-1', TEXT]]),
      },
      'vr-1',
    );
    assert.ok(fired(findings, 'L0-ING-007'), 'unrecorded vision escapes its confidence ceiling');
  });

  test('does not fire when vision pages ARE recorded', () => {
    const findings = evaluateL0Ingestion(
      {
        sources: [source({ extractionMethod: 'mixed', visionPageCount: 3 })],
        units: [unit()],
        evidence: [],
        textBySourceId: new Map([['src-1', TEXT]]),
      },
      'vr-1',
    );
    assert.equal(fired(findings, 'L0-ING-007'), false);
  });

  test('does not fire for a direct text read, which is all V1 produces', () => {
    assert.equal(fired(evaluateL0Ingestion(cleanState(), 'vr-1'), 'L0-ING-007'), false);
  });
});

describe('L0-ING-008 — low-confidence Arabic reordering', () => {
  test('fires below the confidence floor', () => {
    const findings = evaluateL0Ingestion(
      {
        sources: [source({ arabicReorderingConfidence: 0.4 })],
        units: [unit()],
        evidence: [],
        textBySourceId: new Map([['src-1', TEXT]]),
      },
      'vr-1',
    );
    assert.ok(fired(findings, 'L0-ING-008'));
    const f = findings.find((x) => x.ruleId === 'L0-ING-008') as Finding;
    assert.equal(f.messageParams.confidence, 0.4);
    assert.equal(f.messageParams.floor, ARABIC_REORDERING_CONFIDENCE_FLOOR);
  });

  test('does not fire at or above the floor', () => {
    const findings = evaluateL0Ingestion(
      {
        sources: [source({ arabicReorderingConfidence: ARABIC_REORDERING_CONFIDENCE_FLOOR })],
        units: [unit()],
        evidence: [],
        textBySourceId: new Map([['src-1', TEXT]]),
      },
      'vr-1',
    );
    assert.equal(fired(findings, 'L0-ING-008'), false);
  });

  test('does not fire when no reordering was performed', () => {
    assert.equal(fired(evaluateL0Ingestion(cleanState(), 'vr-1'), 'L0-ING-008'), false);
  });
});

describe('L0-ING-009 — imported model files parse', () => {
  test('fires when a BPMN import failed to parse', () => {
    const findings = evaluateL0Ingestion(
      {
        sources: [
          source({ kind: 'bpmn', status: 'parse_failed', parseError: 'unexpected root element' }),
        ],
        units: [],
        evidence: [],
        textBySourceId: new Map([['src-1', TEXT]]),
      },
      'vr-1',
    );
    assert.ok(fired(findings, 'L0-ING-009'));
    assert.ok(fired(findings, 'L0-ING-001'), 'and the generic parse-failure rule fires too');
  });

  test('fires when a parsed DMN yielded no elements', () => {
    const findings = evaluateL0Ingestion(
      {
        sources: [source({ kind: 'dmn', status: 'parsed' })],
        units: [],
        evidence: [],
        textBySourceId: new Map([['src-1', TEXT]]),
      },
      'vr-1',
    );
    assert.ok(fired(findings, 'L0-ING-009'), 'nothing could cite a model file with no elements');
  });

  test('does not fire for a non-model source with no units', () => {
    const findings = evaluateL0Ingestion(
      {
        sources: [source({ kind: 'freetext', status: 'parsed' })],
        units: [],
        evidence: [],
        textBySourceId: new Map([['src-1', TEXT]]),
      },
      'vr-1',
    );
    assert.equal(fired(findings, 'L0-ING-009'), false);
  });
});

describe('L0-ING-010 — effective date present', () => {
  test('fires when a source has no effective date', () => {
    const bare = source();
    delete (bare as { effectiveDate?: string }).effectiveDate;
    const findings = evaluateL0Ingestion(
      {
        sources: [bare],
        units: [unit()],
        evidence: [],
        textBySourceId: new Map([['src-1', TEXT]]),
      },
      'vr-1',
    );
    assert.ok(fired(findings, 'L0-ING-010'));
    const f = findings.find((x) => x.ruleId === 'L0-ING-010') as Finding;
    assert.equal(f.severityAtGate.G1, 'info', 'informational: it weakens precedence, not integrity');
  });

  test('does not fire when an effective date is present', () => {
    assert.equal(fired(evaluateL0Ingestion(cleanState(), 'vr-1'), 'L0-ING-010'), false);
  });
});

// ---------------------------------------------------------------------------
// Determinism and summary
// ---------------------------------------------------------------------------

describe('determinism', () => {
  test('two runs over the same state produce the same findings in the same order', () => {
    const state: IntakeState = {
      sources: [
        source({ id: 'src-2', sha256: 'c'.repeat(64), status: 'parse_failed', parseError: 'x' }),
        source(),
      ],
      units: [unit()],
      evidence: [evidence({ anchorVerified: false })],
      textBySourceId: new Map([['src-1', TEXT]]),
    };
    const a = evaluateL0Ingestion(state, 'vr-1').map((f) => f.id);
    const b = evaluateL0Ingestion(state, 'vr-1').map((f) => f.id);
    assert.deepEqual(a, b);
  });

  test('source order in the input does not change the output order', () => {
    const s1 = source();
    const s2 = source({ id: 'src-2', sha256: 'c'.repeat(64), status: 'parse_failed', parseError: 'x' });
    const base = { units: [unit()], evidence: [], textBySourceId: new Map([['src-1', TEXT]]) };
    const forward = evaluateL0Ingestion({ ...base, sources: [s1, s2] }, 'vr-1').map((f) => f.id);
    const reverse = evaluateL0Ingestion({ ...base, sources: [s2, s1] }, 'vr-1').map((f) => f.id);
    assert.deepEqual(forward, reverse, 'findings are sorted, so a diff is meaningful');
  });
});

describe('summariseFindings', () => {
  test('counts by severity and lists ONLY the blocking ids', () => {
    const bare = source();
    delete (bare as { effectiveDate?: string }).effectiveDate;
    const findings = evaluateL0Ingestion(
      {
        sources: [bare],
        units: [],
        evidence: [],
        textBySourceId: new Map([['src-1', TEXT]]),
      },
      'vr-1',
    );
    const summary = summariseFindings(findings, 'G1');

    assert.equal(summary.total, findings.length);
    assert.ok(summary.infos >= 1, 'L0-ING-010 is informational');
    assert.ok(summary.warnings >= 1, 'L0-ING-005 warns about no units');
    assert.equal(summary.errors, summary.blocking.length, 'blocking is exactly the error set');
    for (const id of summary.blocking) {
      const f = findings.find((x) => x.id === id) as Finding;
      assert.equal(f.severityAtGate.G1, 'error');
    }
  });

  test('a clean run has nothing blocking, which is the G1 precondition', () => {
    const summary = summariseFindings(evaluateL0Ingestion(cleanState(), 'vr-1'), 'G1');
    assert.equal(summary.total, 0);
    assert.deepEqual(summary.blocking, []);
  });

  test('an informational finding never blocks a gate', () => {
    const bare = source();
    delete (bare as { effectiveDate?: string }).effectiveDate;
    const findings = evaluateL0Ingestion(
      { sources: [bare], units: [unit()], evidence: [], textBySourceId: new Map([['src-1', TEXT]]) },
      'vr-1',
    );
    assert.deepEqual(ruleIds(findings), ['L0-ING-010']);
    assert.deepEqual(summariseFindings(findings, 'G1').blocking, []);
  });
});
