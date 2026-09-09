import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { IdempotencyInterceptor } from './common/idempotency/idempotency.interceptor.js';
import { validateEnv } from './config/env.schema.js';
import { AuditModule } from './common/audit/audit.module.js';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard.js';
import { PermissionsGuard } from './common/auth/permissions.guard.js';
import { SequenceModule } from './common/sequence/sequence.module.js';
import { ContextMiddleware } from './common/tenant/context.middleware.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AdmissionsModule } from './modules/admissions/admissions.module.js';
import { AppointmentsModule } from './modules/appointments/appointments.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { BillingModule } from './modules/billing/billing.module.js';
import { CasesModule } from './modules/cases/cases.module.js';
import { ServicesModule } from './modules/services/services.module.js';
import { DiagnosticsModule } from './modules/diagnostics/diagnostics.module.js';
import { AmbulanceModule } from './modules/ambulance/ambulance.module.js';
import { AnalyticsModule } from './modules/analytics/analytics.module.js';
import { BloodBankModule } from './modules/bloodbank/bloodbank.module.js';
import { CustomFieldsModule } from './modules/customfields/customfields.module.js';
import { FhirModule } from './modules/fhir/fhir.module.js';
import { FrontOfficeModule } from './modules/frontoffice/frontoffice.module.js';
import { IntegrationModule } from './modules/integration/integration.module.js';
import { PortalModule } from './modules/portal/portal.module.js';
import { RegistersModule } from './modules/registers/registers.module.js';
import { FinanceModule } from './modules/finance/finance.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { HrModule } from './modules/hr/hr.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { LabTestsModule } from './modules/lab-tests/lab-tests.module.js';
import { OpdModule } from './modules/opd/opd.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { PharmacyModule } from './modules/pharmacy/pharmacy.module.js';
import { WardsModule } from './modules/wards/wards.module.js';
import { PatientsModule } from './modules/patients/patients.module.js';
import { PractitionersModule } from './modules/practitioners/practitioners.module.js';
import { PrescriptionsModule } from './modules/prescriptions/prescriptions.module.js';
import { VitalsModule } from './modules/vitals/vitals.module.js';
import { VocabularyModule } from './modules/vocabulary/vocabulary.module.js';

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
    SequenceModule,
    AuditModule,
    HealthModule,
    AuthModule,
    UsersModule,
    PatientsModule,
    PractitionersModule,
    AppointmentsModule,
    ServicesModule,
    VocabularyModule,
    CasesModule,
    BillingModule,
    OpdModule,
    OrdersModule,
    LabTestsModule,
    DiagnosticsModule,
    PrescriptionsModule,
    VitalsModule,
    WardsModule,
    AdmissionsModule,
    PharmacyModule,
    FinanceModule,
    InventoryModule,
    HrModule,
    AnalyticsModule,
    BloodBankModule,
    AmbulanceModule,
    RegistersModule,
    FrontOfficeModule,
    IntegrationModule,
    FhirModule,
    PortalModule,
    CustomFieldsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    // Runs on every write. Without an Idempotency-Key header it does nothing,
    // so it costs callers that do not need it exactly nothing.
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ContextMiddleware).forRoutes('*');
  }
}
