import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import {
  DiskHealthIndicator,
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
} from '@nestjs/terminus';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly disk: DiskHealthIndicator,
  ) {}

  @Get()
  @SkipThrottle()
  @HealthCheck()
  @ApiOperation({ summary: 'Liveness probe' })
  check() {
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', 1024 * 1024 * 1024), // Increased to 1GB
      () => this.memory.checkRSS('memory_rss', 1024 * 1024 * 1024), // Increased to 1GB
      () =>
        this.disk.checkStorage('disk', {
          path: '/',
          thresholdPercent: 0.95, // Increased threshold
        }),
    ]);
  }

  @Get('readiness')
  @SkipThrottle()
  @ApiOperation({ summary: 'Readiness probe' })
  readiness() {
    return { status: 'ok', ready: true };
  }
}
