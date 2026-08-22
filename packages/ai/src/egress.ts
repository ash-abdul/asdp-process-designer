/**
 * The egress policy gate.
 *
 * ADR-0021: every AI invocation passes through ONE gate. No other path to a
 * provider exists. `RESTRICTED` and above never reach an `external_hosted`
 * provider; `PROHIBITED` content is never processed by any AI.
 *
 * A denial is a first-class product outcome, not an error to swallow: it reports
 * which classification blocked it, which providers were considered, and why each
 * was rejected. It is NEVER silently degraded or silently retried elsewhere.
 */

import {
  classificationRank,
  maxClassification,
  type AiTaskType,
  type Classification,
  type ContentPart,
  type DeploymentClass,
  type ProviderDescriptor,
} from '@asdp/schemas';

export interface EgressPolicy {
  /**
   * Per classification, which deployment classes may receive the content.
   * The conservative default in data-governance.md §3.
   */
  readonly allowedDeploymentClasses: Readonly<Record<Classification, readonly DeploymentClass[]>>;
  /** Per classification, which task types may run at all. `*` means any. */
  readonly allowedTasks: Readonly<Record<Classification, readonly (AiTaskType | '*')[]>>;
  /** Classifications at or above which redaction is mandatory. */
  readonly requireRedactionAtOrAbove?: Classification;
  /** Maximum provider retention, per classification. */
  readonly maxRetentionDays?: Readonly<Partial<Record<Classification, number>>>;
  /** Classifications at or above which training opt-out is mandatory. */
  readonly requireTrainingOptOutAtOrAbove?: Classification;
}

/** The conservative default (data-governance.md §3, OD-2 default). */
export const DEFAULT_EGRESS_POLICY: EgressPolicy = {
  allowedDeploymentClasses: {
    PUBLIC: ['external_hosted', 'vpc', 'on_premise'],
    INTERNAL: ['external_hosted', 'vpc', 'on_premise'],
    CONFIDENTIAL: ['vpc', 'on_premise'],
    RESTRICTED: ['on_premise'],
    PROHIBITED: [],
  },
  allowedTasks: {
    PUBLIC: ['*'],
    INTERNAL: ['*'],
    CONFIDENTIAL: ['*'],
    RESTRICTED: ['*'],
    PROHIBITED: [],
  },
  requireRedactionAtOrAbove: 'CONFIDENTIAL',
  maxRetentionDays: { CONFIDENTIAL: 0, RESTRICTED: 0 },
  requireTrainingOptOutAtOrAbove: 'INTERNAL',
};

export interface ProjectEgressSettings {
  /** false ⇒ a fully on-premise project (ADR-0021 rule 6). */
  readonly allowExternalProviders: boolean;
  readonly classificationCeiling: Classification;
}

export type EgressDecision =
  | {
      readonly allowed: true;
      readonly classification: Classification;
      readonly redactionRequired: boolean;
    }
  | {
      readonly allowed: false;
      readonly classification: Classification;
      /** Machine-readable reason, so the UI can offer concrete options. */
      readonly reason:
        | 'prohibited_content'
        | 'deployment_class_not_permitted'
        | 'project_forbids_external'
        | 'task_not_permitted'
        | 'retention_exceeds_policy'
        | 'training_opt_out_required';
      readonly detail: string;
    };

/** Highest classification across the content items. Never an average. */
export function classifyContent(content: readonly ContentPart[]): Classification {
  return maxClassification(content.map((c) => c.classification));
}

export function hasVisualContent(content: readonly ContentPart[]): boolean {
  return content.some((c) => c.kind === 'image');
}

function atOrAbove(value: Classification, threshold: Classification): boolean {
  return classificationRank(value) >= classificationRank(threshold);
}

/**
 * Decide whether this task, with this content, may reach this provider.
 *
 * Deliberately a pure function over explicit inputs, so the decision is
 * reproducible and testable — and so the transport-boundary test can assert that
 * a denied payload never leaves.
 */
export function evaluateEgress(
  taskType: AiTaskType,
  content: readonly ContentPart[],
  provider: ProviderDescriptor,
  policy: EgressPolicy,
  project: ProjectEgressSettings,
): EgressDecision {
  const classification = classifyContent(content);

  if (classification === 'PROHIBITED') {
    return {
      allowed: false,
      classification,
      reason: 'prohibited_content',
      detail: 'PROHIBITED content must not be processed by any AI provider',
    };
  }

  if (!project.allowExternalProviders && provider.deploymentClass === 'external_hosted') {
    return {
      allowed: false,
      classification,
      reason: 'project_forbids_external',
      detail: `project is configured as on-premise only; provider '${provider.providerId}' is externally hosted`,
    };
  }

  const permitted = policy.allowedDeploymentClasses[classification];
  if (!permitted.includes(provider.deploymentClass)) {
    return {
      allowed: false,
      classification,
      reason: 'deployment_class_not_permitted',
      detail: `${classification} content may not reach a '${provider.deploymentClass}' provider (permitted: ${permitted.join(', ') || 'none'})`,
    };
  }

  const tasks = policy.allowedTasks[classification];
  if (!tasks.includes('*') && !tasks.includes(taskType)) {
    return {
      allowed: false,
      classification,
      reason: 'task_not_permitted',
      detail: `task '${taskType}' is not permitted for ${classification} content`,
    };
  }

  const maxRetention = policy.maxRetentionDays?.[classification];
  if (maxRetention !== undefined && provider.dataHandling.retentionDays > maxRetention) {
    return {
      allowed: false,
      classification,
      reason: 'retention_exceeds_policy',
      detail: `provider retains data for ${provider.dataHandling.retentionDays} day(s); policy allows at most ${maxRetention} for ${classification}`,
    };
  }

  if (
    policy.requireTrainingOptOutAtOrAbove !== undefined &&
    atOrAbove(classification, policy.requireTrainingOptOutAtOrAbove) &&
    !provider.dataHandling.trainingOptOut
  ) {
    return {
      allowed: false,
      classification,
      reason: 'training_opt_out_required',
      detail: `provider '${provider.providerId}' does not assert training opt-out, required at ${classification}`,
    };
  }

  const redactionRequired =
    policy.requireRedactionAtOrAbove !== undefined &&
    atOrAbove(classification, policy.requireRedactionAtOrAbove) &&
    provider.deploymentClass === 'external_hosted';

  return { allowed: true, classification, redactionRequired };
}

/**
 * Guard used at the transport boundary inside every adapter.
 *
 * Defence in depth: the broker already decides eligibility, but an adapter that
 * could be called directly must refuse rather than trust its caller. This is
 * what makes the Spike S6 assertion meaningful — the check is at the point of
 * egress, not merely at the point of intent.
 */
export class EgressViolationError extends Error {
  readonly classification: Classification;
  readonly providerId: string;
  constructor(classification: Classification, providerId: string, deploymentClass: DeploymentClass) {
    super(
      `EGRESS VIOLATION: ${classification} content must not reach provider '${providerId}' ` +
        `(deployment class '${deploymentClass}')`,
    );
    this.name = 'EgressViolationError';
    this.classification = classification;
    this.providerId = providerId;
  }
}

/** Absolute floor, independent of configurable policy. */
export function assertTransportPermitted(
  content: readonly ContentPart[],
  provider: ProviderDescriptor,
): void {
  const classification = classifyContent(content);
  if (classification === 'PROHIBITED') {
    throw new EgressViolationError(classification, provider.providerId, provider.deploymentClass);
  }
  if (
    provider.deploymentClass === 'external_hosted' &&
    atOrAbove(classification, 'RESTRICTED')
  ) {
    throw new EgressViolationError(classification, provider.providerId, provider.deploymentClass);
  }
}
