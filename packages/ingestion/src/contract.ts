/**
 * Anchor contract agreement.
 *
 * `@asdp/schemas` is a CONTRACT package and may depend on nothing but zod
 * (module-map.md §2), so it cannot import `@asdp/provenance`. The anchor
 * therefore exists twice: as a zod schema for API and persistence validation,
 * and as a TypeScript type in the pure provenance package.
 *
 * Duplication that can drift is a defect waiting to happen, so this module makes
 * the two shapes structurally assignable in BOTH directions. If either
 * definition gains, loses or retypes a field, the build fails here — which is
 * cheaper than discovering the divergence when an anchor round-trips through the
 * database and comes back unresolvable.
 *
 * This is a compile-time assertion. `assertAnchorContractsAgree` exists so the
 * file has a runtime export and cannot be tree-shaken into irrelevance, and a
 * test calls it.
 */

import type { ProvenanceAnchor as PureAnchor, AnchorTarget as PureTarget } from '@asdp/provenance';
import type {
  ProvenanceAnchor as SchemaAnchor,
  AnchorTarget as SchemaTarget,
} from '@asdp/schemas';

/** Fails to compile if the schema shape is not assignable to the pure type. */
type SchemaSatisfiesPure = SchemaAnchor extends PureAnchor ? true : never;

/** Fails to compile if the pure type is not assignable to the schema shape. */
type PureSatisfiesSchema = PureAnchor extends SchemaAnchor ? true : never;

/** Both target unions must agree too, not merely the envelope around them. */
type TargetsAgree = SchemaTarget extends PureTarget
  ? PureTarget extends SchemaTarget
    ? true
    : never
  : never;

const schemaSatisfiesPure: SchemaSatisfiesPure = true;
const pureSatisfiesSchema: PureSatisfiesSchema = true;
const targetsAgree: TargetsAgree = true;

/**
 * Returns true when the two anchor definitions agree.
 *
 * The real check happened at compile time; this reports it so a test can assert
 * on something and the assertion cannot be deleted without a failing test.
 */
export function assertAnchorContractsAgree(): boolean {
  return schemaSatisfiesPure && pureSatisfiesSchema && targetsAgree;
}
