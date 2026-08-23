/**
 * Injection tokens.
 *
 * ADR-0034 N2: the injected values are plain interfaces from `ports.ts` and the
 * command layer — never NestJS-decorated classes. The framework wires them; it
 * does not own them.
 */

export const CONFIG = Symbol('ASDP_CONFIG');
export const DATABASE = Symbol('ASDP_DATABASE');
export const REPOSITORIES = Symbol('ASDP_REPOSITORIES');
export const BLOB_STORE = Symbol('ASDP_BLOB_STORE');
export const CLOCK = Symbol('ASDP_CLOCK');
export const ID_GENERATOR = Symbol('ASDP_ID_GENERATOR');
export const DEPENDENCY_PROBE = Symbol('ASDP_DEPENDENCY_PROBE');
/** Transaction boundary (V1). A port, so controllers never see a driver. */
export const UNIT_OF_WORK = Symbol('ASDP_UNIT_OF_WORK');
/** The A3 TextExtractor registry (V2). Which adapters exist is a composition decision. */
export const EXTRACTORS = Symbol('ASDP_EXTRACTORS');
/** The A3 PageRasteriser (V2). Port only — the V2 binding refuses by name. */
export const PAGE_RASTERISER = Symbol('ASDP_PAGE_RASTERISER');
/** The A3 VisionExtractor (V3). Refuses when no provider is configured. */
export const VISION_EXTRACTOR = Symbol('ASDP_VISION_EXTRACTOR');

/** The V4a `SourceProfiler` (`PROFILE_SOURCE`). Refuses when no provider is wired. */
export const SOURCE_PROFILER = Symbol('ASDP_SOURCE_PROFILER');
