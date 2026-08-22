/**
 * Health and metadata.
 *
 * ADR-0028 K4: liveness and readiness are DISTINCT. Liveness reflects process
 * health only; readiness reflects dependency reachability, and orchestrators gate
 * traffic on it.
 *
 * These endpoints are deliberately unauthenticated — probes cannot present
 * credentials. Everything else requires an authenticated actor.
 */

import { Controller, Get, HttpCode, Inject, Res } from '@nestjs/common';
import type { Config } from '../config.ts';
import type { DependencyProbe } from '../ports.ts';
import { CONFIG, DEPENDENCY_PROBE } from './tokens.ts';

interface ResponseShape {
  status(code: number): ResponseShape;
  json(body: unknown): void;
}

@Controller()
export class HealthController {
  constructor(
    @Inject(CONFIG) private readonly config: Config,
    @Inject(DEPENDENCY_PROBE) private readonly probe: DependencyProbe,
  ) {}

  @Get('health/live')
  @HttpCode(200)
  live(): { status: string } {
    return { status: 'live' };
  }

  @Get('health/ready')
  async ready(@Res() res: ResponseShape): Promise<void> {
    const report = await this.probe.check();
    res.status(report.ok ? 200 : 503).json(report);
  }

  @Get('health/dependencies')
  async dependencies(): Promise<unknown> {
    return this.probe.check();
  }

  @Get('meta')
  meta(): Record<string, unknown> {
    return {
      service: 'asdp-api',
      phase: 'Phase 2',
      framework: 'nestjs',
      repository: this.config.repository,
      blobStore: this.config.blobStore,
      authMode: this.config.authMode,
      rafVersion: this.config.rafVersion,
      rulePackVersion: this.config.rulePackVersion,
      camundaTargetProfileId: this.config.camundaTargetProfileId,
    };
  }
}
