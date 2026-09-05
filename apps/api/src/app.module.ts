import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env.schema.js';
import { AuditModule } from './common/audit/audit.module.js';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard.js';
import { PermissionsGuard } from './common/auth/permissions.guard.js';
import { ContextMiddleware } from './common/tenant/context.middleware.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AppointmentsModule } from './modules/appointments/appointments.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { PatientsModule } from './modules/patients/patients.module.js';
import { PractitionersModule } from './modules/practitioners/practitioners.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: '.env',
      validate: validateEnv,
    }),
    JwtModule.register({}),
    ThrottlerModule.forRootAsync({
      imports: [],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.getOrThrow<number>('RATE_LIMIT_TTL_MS'),
            limit: config.getOrThrow<number>('RATE_LIMIT_MAX'),
          },
        ],
      }),
    }),
    PrismaModule,
    AuditModule,
    HealthModule,
    AuthModule,
    PatientsModule,
    PractitionersModule,
    AppointmentsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ContextMiddleware).forRoutes('*');
  }
}
