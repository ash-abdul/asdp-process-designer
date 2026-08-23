/**
 * @asdp/eval — the evaluation harness.
 *
 * Mandatory infrastructure rather than optional tooling, because provider
 * routing depends on measured per-language quality (ADR-0011, ADR-0020).
 */

export {
  type CorpusTier,
  type CorpusDescriptor,
  type CorpusDocument,
  type CorpusStore,
  type CorpusRegistry,
  CorpusNotFoundError,
  TIER_ORDER,
  TIER_WEIGHT,
  tierRank,
  createCorpusRegistry,
  mayAcceptChange,
  assertNotHeldOut,
} from './corpus.ts';

export {
  type Recording,
  type RecordingKey,
  type RecordingStore,
  type ReplayMode,
  type ReplayProviderDeps,
  type DriftReport,
  RecordingMissError,
  recordingKeyHash,
  requestInputHash,
  createReplayProvider,
  createMemoryRecordingStore,
} from './recording.ts';

export {
  type ExtractedItem,
  type GoldItem,
  type ExtractionMode,
  type AnchorPrecision,
  type ProvenanceMetrics,
  type ExtractionQualityMetrics,
  type EvaluationReport,
  ReportIncompleteError,
  computeProvenanceMetrics,
  computeExtractionQuality,
  computeSlotAccuracy,
  buildReport,
  type PassObservation,
  type PassBaselineReport,
  buildPassBaseline,
} from './metrics.ts';

export {
  StoreError,
  type FilesystemCorpusStoreConfig,
  type FilesystemRecordingStoreConfig,
  createFilesystemCorpusStore,
  createFilesystemRecordingStore,
} from './stores.ts';
