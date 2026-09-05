import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/auth/public.decorator.js';
import { PrismaService } from '../../prisma/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check(): Promise<{ status: string; db: 'up' | 'down'; ts: string }> {
    let db: 'up' | 'down' = 'up';
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
    } catch {
      db = 'down';
    }
    return {
      status: db === 'up' ? 'ok' : 'degraded',
      db,
      ts: new Date().toISOString(),
    };
  }
}
