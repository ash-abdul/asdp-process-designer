/**
 * Tests for epistemic ceilings (D4).
 *
 * These assertions are as much about the *ladder* as about the function: they
 * check that no new L-level meaning was introduced, that the cap matches what
 * provenance-and-anchoring.md §5 already approved, and that human confirmation
 * does not create an L2 → L1 promotion the approved model does not have.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { ceilingFor, permittedByCeiling } from './index.ts';

describe('ceilingFor', () => {
  test('deterministic text sources may attain L1', () => {
    for (const kind of ['freetext', 'markdown', 'docx', 'brd', 'sop', 'policy']) {
      const c = ceilingFor({ kind, extractionMethod: 'text' });
      assert.equal(c.ceiling, 'L1', kind);
      assert.equal(c.requiresElementWiseConfirmation, false);
    }
  });

  test('structural model imports may attain L1 — a parser read a structured file', () => {
    for (const kind of ['bpmn', 'dmn', 'form']) {
      assert.equal(ceilingFor({ kind, extractionMethod: 'text' }).ceiling, 'L1', kind);
    }
  });

  test('a screenshot is capped at L2', () => {
    const c = ceilingFor({ kind: 'screenshot', extractionMethod: 'vision' });
    assert.equal(c.ceiling, 'L2');
    assert.equal(c.requiresElementWiseConfirmation, false);
    // The reason must cite the ANCHOR, not the author: epistemic-model.md §1
    // permits AI extraction to produce L1.
    assert.match(c.reason, /page-precision anchor/);
  });

  test('a diagram image is capped at L2 AND requires element-wise confirmation', () => {
    const c = ceilingFor({ kind: 'diagram_image', extractionMethod: 'vision' });
    assert.equal(c.ceiling, 'L2');
    assert.equal(c.requiresElementWiseConfirmation, true, 'risk R5');
  });

  test('a vision-read source of ANY kind is capped, so a mislabelled kind cannot escape', () => {
    // A BRD read by vision is not a text read, whatever it is called.
    assert.equal(ceilingFor({ kind: 'brd', extractionMethod: 'vision' }).ceiling, 'L2');
    assert.equal(ceilingFor({ kind: 'brd', extractionMethod: 'mixed' }).ceiling, 'L2');
    assert.equal(ceilingFor({ kind: 'unknown-kind', extractionMethod: 'vision' }).ceiling, 'L2');
  });

  test('every ceiling carries a reason, because it appears in the disclosure report', () => {
    for (const method of ['text', 'vision', 'mixed'] as const) {
      for (const kind of ['freetext', 'screenshot', 'diagram_image', 'bpmn']) {
        assert.ok(ceilingFor({ kind, extractionMethod: method }).reason.length > 20);
      }
    }
  });

  test('THE LADDER STAYS FOUR LEVELS — no ceiling invents a level', () => {
    const permitted = new Set(['L1', 'L2', 'L3', 'L4']);
    for (const method of ['text', 'vision', 'mixed'] as const) {
      for (const kind of ['freetext', 'markdown', 'docx', 'screenshot', 'diagram_image', 'bpmn', 'x']) {
        assert.ok(permitted.has(ceilingFor({ kind, extractionMethod: method }).ceiling));
      }
    }
  });
});

describe('permittedByCeiling', () => {
  const textCeiling = ceilingFor({ kind: 'freetext', extractionMethod: 'text' });
  const imageCeiling = ceilingFor({ kind: 'screenshot', extractionMethod: 'vision' });

  test('an L1 ceiling permits L1, L2 and L3', () => {
    assert.equal(permittedByCeiling('L1', textCeiling), true);
    assert.equal(permittedByCeiling('L2', textCeiling), true);
    assert.equal(permittedByCeiling('L3', textCeiling), true);
  });

  test('an L2 ceiling FORBIDS L1 — the strongest claim is what the cap removes', () => {
    assert.equal(permittedByCeiling('L1', imageCeiling), false);
    assert.equal(permittedByCeiling('L2', imageCeiling), true);
    assert.equal(permittedByCeiling('L3', imageCeiling), true);
  });

  test('L4 is always permitted, because L4 is a HUMAN act', () => {
    // A person may approve a requirement resting on an L2 interpretation. The
    // ceiling limits what the system asserts unaided, not what a human decides —
    // conflating the two would make the product unable to approve anything
    // derived from a screenshot.
    assert.equal(permittedByCeiling('L4', imageCeiling), true);
    assert.equal(permittedByCeiling('L4', textCeiling), true);
  });

  test('NO L2 → L1 PROMOTION EXISTS: confirmation does not lift the ceiling', () => {
    // epistemic-model.md §2's graph is L1 → L2 → L4 and L3 → L4. Human
    // confirmation of a diagram region satisfies the confirmation requirement
    // that lets L2 proceed toward L4; it does not turn an interpretation into an
    // extracted fact. There is deliberately no argument to this function that
    // could make L1 permitted under an L2 ceiling.
    const diagram = ceilingFor({ kind: 'diagram_image', extractionMethod: 'vision' });
    assert.equal(permittedByCeiling('L1', diagram), false);
    assert.equal(diagram.requiresElementWiseConfirmation, true);
  });
});
