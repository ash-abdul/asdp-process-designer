/**
 * L0 — Ingestion integrity.
 *
 * The ten rules `L0-ING-001` … `L0-ING-010` from
 * validation-rule-catalog.md §L0. Ids, severities and gate assignment come from
 * the catalogue and are NOT re-decided here: the catalogue is the authority, and
 * a rule pack that invents its own severities makes the catalogue decorative.
 *
 * L0 is the layer that protects the traceability guarantee. If an anchor does not
 * resolve, every requirement downstream of it is unfounded — so `L0-ING-002` and
 * `L0-ING-003` are ERRORs that block G1 and cannot be waived
 * (validation-architecture.md §10: a waiver is valid only where a rule is a
 * WARNING).
 */

import { resolveTextAnchor } from '@asdp/provenance';
import type { ProvenanceAnchor as PureAnchor } from '@asdp/provenance';
import { baseDirection } from '@asdp/text';
import {
  CLASSIFICATION_ORDER,
  findingId,
  severityAt,
  type EvidenceItem,
  type Finding,
  type GateCode,
  type RuleDefinition,
  type Severity,
  type Source,
  type SourceUnit,
  type TargetRef,
} from '@asdp/schemas';

// ---------------------------------------------------------------------------
// Rule definitions — from the catalogue, verbatim in severity and gate
// ---------------------------------------------------------------------------

function rule(
  id: string,
  severity: Severity,
  messageKey: string,
  fixHintKey: string,
  documentation: string,
  profileAdjustable = false,
): RuleDefinition {
  return {
    id,
    layer: 'L0',
    gates: ['G1'],
    severity,
    messageKey,
    fixHintKey,
    documentation,
    profileAdjustable,
  };
}

export const L0_INGESTION_RULES: readonly RuleDefinition[] = [
  rule(
    'L0-ING-001',
    'error',
    'l0.ing.001.parseFailed',
    'l0.ing.001.fix',
    'Source parsed successfully; a parse failure is not silently tolerated. A source left in ' +
      'parse_failed contributes no units, so any requirement claiming it as evidence would be ' +
      'citing a document the system never read.',
  ),
  rule(
    'L0-ING-002',
    'error',
    'l0.ing.002.unitAnchorUnresolvable',
    'l0.ing.002.fix',
    'Every SourceUnit anchor must resolve and its quote checksum must verify. Both a broken and ' +
      'a drifted anchor violate this rule: within one extractor version the stored text and the ' +
      'units are written together, so any disagreement is a defect rather than the version skew ' +
      'bounded drift repair exists to absorb.',
  ),
  rule(
    'L0-ING-003',
    'error',
    'l0.ing.003.evidenceAnchorUnverified',
    'l0.ing.003.fix',
    'Every EvidenceItem anchor must be resolvable with anchorVerified = true (invariant D1). ' +
      'EvidenceItem is the only bridge from sources to requirements, so an unverified anchor here ' +
      'is an unfounded citation everywhere downstream.',
  ),
  rule(
    'L0-ING-004',
    'error',
    'l0.ing.004.textNotNormalised',
    'l0.ing.004.fix',
    'Extracted text must be NFC-normalised and language-tagged (ADR-0023). Un-normalised text ' +
      'makes offsets depend on the input encoding form, so the same document in NFC and NFD would ' +
      'anchor differently.',
  ),
  rule(
    'L0-ING-005',
    'warning',
    'l0.ing.005.possibleTruncation',
    'l0.ing.005.fix',
    'Content length or unit coverage suggests truncation during extraction. A warning rather than ' +
      'an error because a sparse document is legitimate; a silently half-read document is not.',
    true,
  ),
  rule(
    'L0-ING-006',
    'error',
    'l0.ing.006.classificationMissing',
    'l0.ing.006.fix',
    'Every source must carry a data classification (ADR-0021). The schema makes this structural ' +
      'for anything written through the application; this rule is the defence against a direct ' +
      'database write, which is why it is enforced in SQL, in the schema, and here.',
  ),
  rule(
    'L0-ING-007',
    'warning',
    'l0.ing.007.visionReadNotRecorded',
    'l0.ing.007.fix',
    'Vision-read or scanned pages must be recorded as such, because a per-source-type confidence ' +
      'ceiling applies to them (risk R5). Unrecorded vision extraction would be indistinguishable ' +
      'from direct text extraction and would silently escape that ceiling.',
    true,
  ),
  rule(
    'L0-ING-008',
    'warning',
    'l0.ing.008.lowConfidenceArabicReordering',
    'l0.ing.008.fix',
    'Arabic PDF extraction produced a low-confidence reordering result (spike S2, risk R4). The ' +
      'documented response is to fall back to page image plus vision with image_region anchors — ' +
      'never to accept a low-confidence reordering silently.',
    true,
  ),
  rule(
    'L0-ING-009',
    'error',
    'l0.ing.009.modelFileUnparsed',
    'l0.ing.009.fix',
    'An imported BPMN, DMN or form file must parse under its declared schema. An unparsed model ' +
      'file imported as evidence would contribute no elements while appearing to have been read.',
  ),
  rule(
    'L0-ING-010',
    'info',
    'l0.ing.010.noEffectiveDate',
    'l0.ing.010.fix',
    'A source without an effectiveDate weakens deterministic conflict precedence (ADR-0012): ' +
      'recency cannot break a tie between two sources of equal authority rank.',
    true,
  ),
];

const BY_ID = new Map(L0_INGESTION_RULES.map((r) => [r.id, r]));

function definitionOf(id: string): RuleDefinition {
  const found = BY_ID.get(id);
  if (found === undefined) throw new Error(`unknown L0 rule '${id}'`);
  return found;
}

// ---------------------------------------------------------------------------
// Evaluation input
// ---------------------------------------------------------------------------

/**
 * Everything the L0 pack needs, passed in.
 *
 * A pure package cannot read a database, which is the point: the rules are a
 * function from state to findings, so they are snapshot-testable and can never
 * mutate what they judge.
 */
export interface IntakeState {
  readonly sources: readonly Source[];
  readonly units: readonly SourceUnit[];
  readonly evidence: readonly EvidenceItem[];
  /** Stored normalised text per source id, for anchor resolution. */
  readonly textBySourceId: ReadonlyMap<string, string>;
}

/** Model-file kinds whose parse is asserted by `L0-ING-009`. */
const MODEL_KINDS = new Set(['bpmn', 'dmn', 'form']);

/** Below this, an Arabic reordering result is not trusted (`L0-ING-008`). */
export const ARABIC_REORDERING_CONFIDENCE_FLOOR = 0.7;

/**
 * Minimum share of a source's text that its units must cover before truncation
 * is suspected (`L0-ING-005`). Deliberately generous: a document that is mostly
 * blank lines or front matter is normal, a document where three quarters of the
 * text produced no unit is not.
 */
export const MIN_UNIT_COVERAGE = 0.5;

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

function severityByGate(definition: RuleDefinition): Record<GateCode, Severity> {
  const out: Partial<Record<GateCode, Severity>> = {};
  for (const gate of definition.gates) {
    const s = severityAt(definition, gate);
    if (s !== undefined) out[gate] = s;
  }
  return out as Record<GateCode, Severity>;
}

function finding(
  runId: string,
  ruleId: string,
  target: TargetRef,
  params: Record<string, string | number>,
): Finding {
  const definition = definitionOf(ruleId);
  return {
    id: findingId(ruleId, target),
    runId,
    ruleId,
    layer: 'L0',
    severityAtGate: severityByGate(definition),
    targetRef: target,
    messageKey: definition.messageKey,
    messageParams: params,
    fixHintKey: definition.fixHintKey,
    fixHintParams: {},
  };
}

/** Code-point length. Never `String.length`, which counts UTF-16 units. */
function cpLength(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}

/**
 * Run the L0 ingestion pack.
 *
 * Findings are returned in rule order then entity order, so two runs over the
 * same state produce the same list — which is what makes a validation run
 * diffable and a finding trackable across runs.
 */
export function evaluateL0Ingestion(state: IntakeState, runId: string): readonly Finding[] {
  const findings: Finding[] = [];
  const unitsBySource = new Map<string, SourceUnit[]>();
  for (const unit of state.units) {
    const list = unitsBySource.get(unit.sourceId);
    if (list === undefined) unitsBySource.set(unit.sourceId, [unit]);
    else list.push(unit);
  }

  const sources = [...state.sources].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // --- L0-ING-001 · parse failure is never silent -------------------------
  for (const source of sources) {
    if (source.status === 'parse_failed') {
      findings.push(
        finding(runId, 'L0-ING-001', { sourceId: source.id }, {
          filename: source.filename,
          detail: source.parseError ?? 'no reason recorded',
        }),
      );
    }
  }

  // --- L0-ING-002 · every unit anchor resolves ----------------------------
  for (const source of sources) {
    const text = state.textBySourceId.get(source.id);
    const units = unitsBySource.get(source.id) ?? [];
    for (const unit of [...units].sort((a, b) => a.ordinal - b.ordinal)) {
      if (unit.anchor.target.kind !== 'text_range') continue;
      if (text === undefined) {
        findings.push(
          finding(runId, 'L0-ING-002', { sourceId: source.id, specElementId: unit.id }, {
            ordinal: unit.ordinal,
            status: 'broken',
            detail: 'no stored text for this source, so the anchor cannot be verified at all',
          }),
        );
        continue;
      }
      const resolution = resolveTextAnchor(unit.anchor as PureAnchor, text);
      if (resolution.status !== 'resolved') {
        findings.push(
          finding(runId, 'L0-ING-002', { sourceId: source.id, specElementId: unit.id }, {
            ordinal: unit.ordinal,
            status: resolution.status,
            detail: resolution.detail ?? 'unknown reason',
          }),
        );
      }
    }
  }

  // --- L0-ING-003 · every evidence anchor is verified ---------------------
  const evidence = [...state.evidence].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const item of evidence) {
    if (!item.anchorVerified) {
      findings.push(
        finding(runId, 'L0-ING-003', { sourceId: item.sourceId, requirementId: item.id }, {
          detail: 'anchorVerified is false; invariant D1 requires it to be true to persist',
        }),
      );
      continue;
    }
    if (item.anchor.target.kind !== 'text_range') continue;
    const text = state.textBySourceId.get(item.sourceId);
    if (text === undefined) {
      findings.push(
        finding(runId, 'L0-ING-003', { sourceId: item.sourceId, requirementId: item.id }, {
          detail: 'no stored text for the cited source, so the anchor cannot be re-verified',
        }),
      );
      continue;
    }
    const resolution = resolveTextAnchor(item.anchor as PureAnchor, text);
    if (resolution.status !== 'resolved') {
      findings.push(
        finding(runId, 'L0-ING-003', { sourceId: item.sourceId, requirementId: item.id }, {
          status: resolution.status,
          detail: resolution.detail ?? 'unknown reason',
        }),
      );
    }
  }

  // --- L0-ING-004 · NFC and language-tagged ------------------------------
  for (const source of sources) {
    const text = state.textBySourceId.get(source.id);
    const problems: string[] = [];
    if (text !== undefined && text !== text.normalize('NFC')) {
      problems.push('stored text is not NFC-normalised');
    }

    // The language checks apply only where there is something to tag. A document
    // of pure whitespace, digits or punctuation has no determinable language, and
    // that is not a normalisation defect — it is an absence of content, which
    // `L0-ING-005` reports. Firing here as well would raise a blocking ERROR for
    // a condition whose real diagnosis is a warning, and point the reader at the
    // wrong problem.
    //
    // `baseDirection` is the authority on whether a strong letter is present
    // (ADR-0023 rule 1: @asdp/text owns script classification, nothing re-derives it).
    const hasTaggableContent = text !== undefined && baseDirection(text) !== 'neutral';
    if (hasTaggableContent && source.primaryLanguage === 'und') {
      problems.push('text contains letters but no primary language was determined');
    }
    if (hasTaggableContent && source.languageRuns.length === 0) {
      problems.push('text contains letters but no language runs were recorded');
    }
    if (problems.length > 0) {
      findings.push(
        finding(runId, 'L0-ING-004', { sourceId: source.id }, {
          filename: source.filename,
          detail: problems.join('; '),
        }),
      );
    }
  }

  // --- L0-ING-005 · possible truncation ---------------------------------
  for (const source of sources) {
    if (source.status !== 'parsed') continue;
    const text = state.textBySourceId.get(source.id);
    const units = unitsBySource.get(source.id) ?? [];

    if (source.byteSize > 0 && (source.textLength ?? 0) === 0) {
      findings.push(
        finding(runId, 'L0-ING-005', { sourceId: source.id }, {
          filename: source.filename,
          detail: `${source.byteSize} bytes ingested but no text extracted`,
        }),
      );
      continue;
    }
    if (text === undefined || units.length === 0) {
      if ((source.textLength ?? 0) > 0 && units.length === 0) {
        findings.push(
          finding(runId, 'L0-ING-005', { sourceId: source.id }, {
            filename: source.filename,
            detail: 'text was extracted but produced no units',
          }),
        );
      }
      continue;
    }
    let covered = 0;
    for (const unit of units) {
      if (unit.anchor.target.kind === 'text_range') {
        covered += unit.anchor.target.charEnd - unit.anchor.target.charStart;
      }
    }
    const total = cpLength(text);
    if (total > 0 && covered / total < MIN_UNIT_COVERAGE) {
      findings.push(
        finding(runId, 'L0-ING-005', { sourceId: source.id }, {
          filename: source.filename,
          detail:
            `units cover ${covered} of ${total} code points ` +
            `(${Math.round((covered / total) * 100)}%), below the ${Math.round(MIN_UNIT_COVERAGE * 100)}% floor`,
        }),
      );
    }
  }

  // --- L0-ING-006 · classification present ------------------------------
  for (const source of sources) {
    const value = source.classification as string | undefined | null;
    if (value === undefined || value === null || !(CLASSIFICATION_ORDER as readonly string[]).includes(value)) {
      findings.push(
        finding(runId, 'L0-ING-006', { sourceId: source.id }, {
          filename: source.filename,
          detail: `classification is '${String(value)}', which is not a known level`,
        }),
      );
    }
  }

  // --- L0-ING-007 · vision-read pages recorded --------------------------
  for (const source of sources) {
    const method = source.extractionMethod;
    if ((method === 'vision' || method === 'mixed') && (source.visionPageCount ?? 0) === 0) {
      findings.push(
        finding(runId, 'L0-ING-007', { sourceId: source.id }, {
          filename: source.filename,
          detail: `extraction method is '${method}' but no vision-read pages were recorded`,
        }),
      );
    }
  }

  // --- L0-ING-008 · low-confidence Arabic reordering -------------------
  for (const source of sources) {
    const confidence = source.arabicReorderingConfidence;
    if (confidence !== undefined && confidence < ARABIC_REORDERING_CONFIDENCE_FLOOR) {
      findings.push(
        finding(runId, 'L0-ING-008', { sourceId: source.id }, {
          filename: source.filename,
          confidence,
          floor: ARABIC_REORDERING_CONFIDENCE_FLOOR,
        }),
      );
    }
  }

  // --- L0-ING-009 · imported model files parse -------------------------
  for (const source of sources) {
    if (!MODEL_KINDS.has(source.kind)) continue;
    const units = unitsBySource.get(source.id) ?? [];
    if (source.status === 'parse_failed') {
      findings.push(
        finding(runId, 'L0-ING-009', { sourceId: source.id, artifactKey: source.kind }, {
          filename: source.filename,
          detail: source.parseError ?? 'no reason recorded',
        }),
      );
    } else if (source.status === 'parsed' && units.length === 0) {
      findings.push(
        finding(runId, 'L0-ING-009', { sourceId: source.id, artifactKey: source.kind }, {
          filename: source.filename,
          detail: `a parsed ${source.kind} file yielded no elements, so nothing can cite it`,
        }),
      );
    }
  }

  // --- L0-ING-010 · effective date present -----------------------------
  for (const source of sources) {
    if (source.effectiveDate === undefined || source.effectiveDate === '') {
      findings.push(
        finding(runId, 'L0-ING-010', { sourceId: source.id }, {
          filename: source.filename,
          authorityRank: source.authorityRank,
        }),
      );
    }
  }

  return findings;
}
