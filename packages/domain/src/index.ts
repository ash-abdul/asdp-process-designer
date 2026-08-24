/**
 * @asdp/domain — entities, invariants, canonicalisation, baselines and the gate
 * state machine.
 *
 * PURE package: no filesystem, network, clock or randomness. `node:crypto` is
 * reached only through @asdp/provenance for deterministic hashing.
 */

export * from './types.ts';

export { canonicalJson, contentHash, canonicalText, textContentHash } from './canonical.ts';

export {
  type IdentityClock,
  type RandomSource,
  type DurableIdGenerator,
  MAX_ULID_TIMESTAMP,
  durableIdGenerator,
} from './identity.ts';

export {
  type BaselineInput,
  computeBaselineHash,
  freezeBaseline,
  findDuplicateArtifacts,
  baselinesEqual,
  diffBaselines,
} from './baseline.ts';

export {
  type LockContext,
  type LockDecision,
  type GateEvaluation,
  type TransitionResult,
  type ApprovalAttempt,
  isAdvisory,
  gateIndex,
  prerequisiteGate,
  gateForStage,
  canEnterStage,
  evaluateGate,
  approveGate,
  reopenIfInvalidated,
  isApprovalExpired,
  defaultGatePolicy,
} from './gates.ts';

export {
  type ConfidenceFactors,
  type ConfidenceResult,
  type CrossSourceAgreement,
  CONFIDENCE_FUNCTION_VERSION,
  computeConfidence,
  requiresHumanConfirmation,
  permittedOnExecutablePath,
} from './confidence.ts';

export {
  InvariantViolation,
  type ActorKind,
  type ArtifactOrigin,
  type G1Readiness,
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
} from './invariants.ts';

export {
  type CeilingInput,
  type EpistemicCeiling,
  type ExtractionMethod,
  ceilingFor,
  permittedByCeiling,
} from './ceilings.ts';

export {
  type Specificity,
  type PrecedenceStep,
  type PrecedenceParticipant,
  type PrecedenceInput,
  type PrecedenceRecommendation,
  PRECEDENCE_FUNCTION_VERSION,
  computePrecedence,
} from './precedence.ts';
