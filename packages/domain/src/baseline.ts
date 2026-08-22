/**
 * Baseline computation.
 *
 * ADR-0016 / ADR-0017: a baseline is the unit of approval — a frozen,
 * self-consistent set of member versions. Its hash covers the sorted set of
 * (artifactId, versionId, contentHash) triples plus the stage and the pinned
 * versions, so that "what exactly was approved?" is answerable by hash, forever.
 */

import type { Baseline, BaselineMember, Stage } from '@asdp/schemas';
import { contentHash } from './canonical.ts';

export interface BaselineInput {
  readonly projectId: string;
  readonly stage: Stage;
  readonly members: readonly BaselineMember[];
  readonly rafVersion: string;
  readonly rulePackVersion: string;
  readonly camundaTargetProfileId: string;
}

/**
 * Compute a baseline content hash.
 *
 * Member order is irrelevant to the hash: members are sorted, so two logically
 * identical baselines produce one hash regardless of collection order.
 */
export function computeBaselineHash(input: BaselineInput): string {
  const sortedMembers = [...input.members]
    .map((m) => ({ artifactId: m.artifactId, versionId: m.versionId, contentHash: m.contentHash }))
    .sort((a, b) =>
      a.artifactId < b.artifactId ? -1
      : a.artifactId > b.artifactId ? 1
      : a.versionId < b.versionId ? -1
      : a.versionId > b.versionId ? 1
      : 0,
    );

  return contentHash({
    projectId: input.projectId,
    stage: input.stage,
    members: sortedMembers,
    rafVersion: input.rafVersion,
    rulePackVersion: input.rulePackVersion,
    camundaTargetProfileId: input.camundaTargetProfileId,
  });
}

/** Duplicate artifact entries would make a baseline ambiguous. */
export function findDuplicateArtifacts(members: readonly BaselineMember[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const m of members) {
    if (seen.has(m.artifactId)) duplicates.add(m.artifactId);
    seen.add(m.artifactId);
  }
  return [...duplicates];
}

/**
 * Freeze a baseline. Insert-only: the returned value is never mutated
 * afterwards (invariant D8).
 */
export function freezeBaseline(
  id: string,
  input: BaselineInput,
  frozenAt: string,
): Baseline {
  const duplicates = findDuplicateArtifacts(input.members);
  if (duplicates.length > 0) {
    throw new Error(
      `baseline would be ambiguous: artifact(s) appear more than once: ${duplicates.join(', ')}`,
    );
  }
  return {
    id,
    projectId: input.projectId,
    stage: input.stage,
    contentHash: computeBaselineHash(input),
    frozenAt,
    members: [...input.members],
    rafVersion: input.rafVersion,
    rulePackVersion: input.rulePackVersion,
    camundaTargetProfileId: input.camundaTargetProfileId,
  };
}

/** Whether two baselines contain identical content. */
export function baselinesEqual(a: Baseline, b: Baseline): boolean {
  return a.contentHash === b.contentHash;
}

/**
 * Members that differ between two baselines, for impact reporting.
 * Returns artifact ids that were added, removed, or changed version.
 */
export function diffBaselines(
  from: Baseline,
  to: Baseline,
): { added: string[]; removed: string[]; changed: string[] } {
  const fromMap = new Map(from.members.map((m) => [m.artifactId, m]));
  const toMap = new Map(to.members.map((m) => [m.artifactId, m]));

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const [id, member] of toMap) {
    const previous = fromMap.get(id);
    if (previous === undefined) added.push(id);
    else if (previous.contentHash !== member.contentHash) changed.push(id);
  }
  for (const id of fromMap.keys()) {
    if (!toMap.has(id)) removed.push(id);
  }

  return { added: added.sort(), removed: removed.sort(), changed: changed.sort() };
}
