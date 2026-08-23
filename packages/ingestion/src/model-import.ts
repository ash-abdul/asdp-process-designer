/**
 * Structural BPMN / DMN / Form import — **EVIDENCE ONLY**.
 *
 * An existing BPMN is a statement about how the process runs *today*. It is
 * evidence a requirement can cite, and nothing more. Five absolutes, from the
 * approved V3 boundary:
 *
 *   1. it is a `Source` with `SourceUnit`s, **never** an `ArtifactVersion`
 *   2. it is **never editable** inside ASDP
 *   3. it is **never** the direct starting point for a generated artifact
 *   4. its element ids are **never reused** as generated ids
 *   5. it **never bypasses** the requirements → specification → Process IR path
 *
 * Nothing here can breach those on its own — this module only reads — but the
 * constraints are recorded where the reading happens, because that is where
 * someone would be tempted to add "…and then generate from it".
 *
 * **D3 (approved):** reuse the deterministic XML tokeniser. Evidence needs element
 * ids, types and names — not a semantic model. A full BPMN model in the intake
 * layer would be a dependency bought for capability we deliberately do not want,
 * and it would blur the boundary above.
 *
 * Camunda forms are JSON, not XML, so they use `JSON.parse` — equally
 * deterministic, equally dependency-free.
 */

import { normalise, type Direction } from '@asdp/text';
import { spanChecksum } from '@asdp/provenance';
import type { ProvenanceAnchor, SourceUnitType } from '@asdp/schemas';
import { localName, tokeniseXml, XmlError } from './xml.ts';
import type { ExtractedUnit } from './units.ts';
import type { ExtractionInput, ExtractionOutput, TextExtractor } from './ports.ts';

export const BPMN_MEDIA_TYPE = 'application/bpmn+xml';
export const DMN_MEDIA_TYPE = 'application/dmn+xml';
export const FORM_MEDIA_TYPE = 'application/vnd.camunda.form+json';

export const MODEL_EXTRACTOR_VERSION = 'model@1';

export class ModelImportError extends Error {}

/**
 * BPMN elements worth citing.
 *
 * Flow nodes and sequence flows. Diagram-interchange elements (`BPMNShape`,
 * `BPMNEdge`) are excluded: they are geometry, not process meaning, and layout is
 * never evidence of a requirement.
 */
const BPMN_CITABLE = new Set([
  'process',
  'subProcess',
  'task',
  'userTask',
  'serviceTask',
  'scriptTask',
  'sendTask',
  'receiveTask',
  'manualTask',
  'businessRuleTask',
  'callActivity',
  'exclusiveGateway',
  'inclusiveGateway',
  'parallelGateway',
  'eventBasedGateway',
  'startEvent',
  'endEvent',
  'intermediateCatchEvent',
  'intermediateThrowEvent',
  'boundaryEvent',
  'sequenceFlow',
  'textAnnotation',
  'dataObject',
  'dataStoreReference',
  'lane',
  'participant',
]);

const DMN_CITABLE = new Set(['decision', 'inputExpression', 'rule', 'input', 'output']);

function describe(text: string): { language: string; direction: Direction } {
  const n = normalise(text);
  return { language: n.primaryLanguage, direction: n.direction };
}

interface RawElement {
  readonly elementId: string;
  readonly elementType: string;
  /** Verbatim name or expression. Only elements that have one become units. */
  readonly text: string;
  /** For DMN: the decision this rule belongs to. */
  readonly decisionId?: string;
}

// ---------------------------------------------------------------------------
// BPMN / DMN
// ---------------------------------------------------------------------------

/**
 * Collect citable elements from a BPMN or DMN file.
 *
 * Elements with no name and no expression are **counted, not invented**: giving
 * an unnamed gateway a synthesised label would put text into a quote that appears
 * nowhere in the source, and its checksum would then verify against something no
 * one wrote.
 */
function collectXmlElements(
  xml: string,
  citable: ReadonlySet<string>,
): { elements: RawElement[]; unnamed: number } {
  const tokens = tokeniseXml(xml);
  const elements: RawElement[] = [];
  let unnamed = 0;

  /** Current DMN decision, so a rule can name its parent. */
  let currentDecision: string | undefined;
  /** Element whose text content we are collecting (expressions, annotations). */
  let collecting: { id: string; type: string; text: string } | null = null;

  for (const token of tokens) {
    if (token.kind === 'open') {
      const name = localName(token.name);
      const id = token.attributes.get('id') ?? '';
      const label = token.attributes.get('name');

      if (name === 'decision') currentDecision = id === '' ? undefined : id;

      // Text-bearing elements: the value is the element's content, not an
      // attribute, so it is accumulated until the close tag.
      if (name === 'conditionExpression' || name === 'text' || name === 'inputEntry' || name === 'outputEntry') {
        collecting = { id, type: name, text: '' };
        continue;
      }

      if (!citable.has(name)) continue;

      if (id === '') {
        unnamed++;
        continue;
      }
      if (label === undefined || label.trim().length === 0) {
        // Present but unnamed. Counted so the limitation is reportable.
        unnamed++;
        continue;
      }
      elements.push({
        elementId: id,
        elementType: name,
        text: label,
        ...(currentDecision === undefined ? {} : { decisionId: currentDecision }),
      });
      continue;
    }

    if (token.kind === 'text') {
      if (collecting !== null) collecting.text += token.text;
      continue;
    }

    // close
    const name = localName(token.name);
    if (collecting !== null && name === collecting.type) {
      const text = collecting.text.trim();
      if (text.length > 0) {
        elements.push({
          elementId: collecting.id === '' ? `${collecting.type}@${elements.length}` : collecting.id,
          elementType: collecting.type,
          text,
          ...(currentDecision === undefined ? {} : { decisionId: currentDecision }),
        });
      }
      collecting = null;
    }
    if (name === 'decision') currentDecision = undefined;
  }

  return { elements, unnamed };
}

// ---------------------------------------------------------------------------
// Camunda form JSON
// ---------------------------------------------------------------------------

interface FormComponent {
  readonly key?: unknown;
  readonly id?: unknown;
  readonly label?: unknown;
  readonly text?: unknown;
  readonly type?: unknown;
  readonly components?: unknown;
}

/** Collect form fields, recursively — a form may nest groups. */
function collectFormFields(components: readonly FormComponent[], into: RawElement[]): void {
  for (const c of components) {
    const key = typeof c.key === 'string' ? c.key : typeof c.id === 'string' ? c.id : '';
    const label = typeof c.label === 'string' ? c.label : typeof c.text === 'string' ? c.text : '';
    const type = typeof c.type === 'string' ? c.type : 'field';
    if (key !== '' && label.trim().length > 0) {
      into.push({ elementId: key, elementType: type, text: label });
    }
    if (Array.isArray(c.components)) {
      collectFormFields(c.components as readonly FormComponent[], into);
    }
  }
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

function unitTypeFor(mediaType: string): SourceUnitType {
  if (mediaType === BPMN_MEDIA_TYPE) return 'bpmnElement';
  if (mediaType === DMN_MEDIA_TYPE) return 'dmnRule';
  return 'formField';
}

function anchorFor(
  sourceId: string,
  mediaType: string,
  element: RawElement,
): ProvenanceAnchor {
  const described = describe(element.text);
  const target: ProvenanceAnchor['target'] =
    mediaType === BPMN_MEDIA_TYPE
      ? { kind: 'bpmn_element', fileId: sourceId, elementId: element.elementId }
      : mediaType === DMN_MEDIA_TYPE
        ? {
            kind: 'dmn_rule',
            fileId: sourceId,
            decisionId: element.decisionId ?? element.elementId,
            ruleId: element.elementId,
          }
        : { kind: 'form_field', fileId: sourceId, fieldId: element.elementId };

  return {
    sourceId,
    target,
    quote: element.text,
    quoteChecksum: spanChecksum(element.text),
    language: described.language,
    direction: described.direction,
    // `exact`: a deterministic parser read a structured model, so the element
    // identity and its recorded name are both checkable against the stored bytes.
    precision: 'exact',
    extractorVersion: MODEL_EXTRACTOR_VERSION,
  };
}

/**
 * Extract a structural model file into citable units.
 *
 * The canonical text stored for such a source is **the file's own
 * serialisation**, verbatim. That is honest — it is what was uploaded — and it
 * gives the viewer something to show. Element anchors do not index into it:
 * they are verified by element existence against the stored bytes
 * (ADR-0038), which is a stronger check than an offset would be.
 */
export function extractModel(
  sourceId: string,
  mediaType: string,
  text: string,
): ExtractionOutput {
  const limitations = new Set<string>();
  const elements: RawElement[] = [];

  if (mediaType === FORM_MEDIA_TYPE) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new ModelImportError(
        `form JSON is not parseable: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const components = (parsed as { components?: unknown }).components;
    if (!Array.isArray(components)) {
      throw new ModelImportError('form JSON has no `components` array, so it declares no fields');
    }
    collectFormFields(components as readonly FormComponent[], elements);
    if (elements.length === 0) {
      throw new ModelImportError('form declares no labelled fields, so nothing can cite it');
    }
  } else {
    const citable = mediaType === DMN_MEDIA_TYPE ? DMN_CITABLE : BPMN_CITABLE;
    let collected: { elements: RawElement[]; unnamed: number };
    try {
      collected = collectXmlElements(text, citable);
    } catch (err) {
      throw new ModelImportError(
        `model file is not well-formed XML: ${err instanceof XmlError ? err.message : String(err)}`,
      );
    }
    elements.push(...collected.elements);
    if (collected.unnamed > 0) {
      limitations.add(
        `${collected.unnamed} element(s) had no name or expression and produced no unit; ` +
          'a label was not synthesised, because a quote must be verbatim',
      );
    }
    if (elements.length === 0) {
      throw new ModelImportError(
        'no citable element carries a name or expression, so the file yields no evidence',
      );
    }
  }

  limitations.add(
    'imported as EVIDENCE only: it is never an artifact, never editable, and never a starting ' +
      'point for generation',
  );
  limitations.add('diagram geometry (BPMNShape/BPMNEdge) is not evidence and was not extracted');

  const units: ExtractedUnit[] = elements.map((element, index) => {
    const described = describe(element.text);
    return {
      ordinal: index,
      type: unitTypeFor(mediaType),
      text: element.text,
      language: described.language,
      direction: described.direction,
      anchor: anchorFor(sourceId, mediaType, element),
    };
  });

  return {
    extractorVersion: MODEL_EXTRACTOR_VERSION,
    // Verbatim, NFC-normalised. What was uploaded, not a rendering of it.
    canonicalText: text.normalize('NFC'),
    units,
    pages: [],
    limitations: [...limitations].sort(),
  };
}

/** Element ids present in a model file, for ADR-0038 target verification. */
export function modelElementIds(mediaType: string, text: string): ReadonlySet<string> {
  const out = new Set<string>();
  if (mediaType === FORM_MEDIA_TYPE) {
    try {
      const components = (JSON.parse(text) as { components?: unknown }).components;
      if (Array.isArray(components)) {
        const collected: RawElement[] = [];
        collectFormFields(components as readonly FormComponent[], collected);
        for (const e of collected) out.add(e.elementId);
      }
    } catch {
      return out;
    }
    return out;
  }
  const citable = mediaType === DMN_MEDIA_TYPE ? DMN_CITABLE : BPMN_CITABLE;
  try {
    for (const e of collectXmlElements(text, citable).elements) out.add(e.elementId);
  } catch {
    return out;
  }
  return out;
}

/** The structural-model `TextExtractor`. */
export function modelExtractor(): TextExtractor {
  return {
    id: MODEL_EXTRACTOR_VERSION,
    supports: (mediaType) =>
      mediaType === BPMN_MEDIA_TYPE || mediaType === DMN_MEDIA_TYPE || mediaType === FORM_MEDIA_TYPE,
    extract: (input: ExtractionInput) => {
      if (input.decodedText === undefined) {
        throw new ModelImportError(
          'the model extractor requires decodedText from the ingest guard; this is a wiring defect',
        );
      }
      return extractModel(input.sourceId, input.mediaType, input.decodedText);
    },
  };
}
