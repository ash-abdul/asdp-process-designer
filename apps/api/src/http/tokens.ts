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
