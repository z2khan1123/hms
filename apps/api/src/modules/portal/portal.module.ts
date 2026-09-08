import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PortalAdminController } from './portal-admin.controller.js';
import { PortalAuthService } from './portal-auth.service.js';
import { PortalController } from './portal.controller.js';
import { PortalGuard } from './portal.guard.js';
import { PortalService } from './portal.service.js';

@Module({
  imports: [JwtModule.register({})],
  controllers: [PortalController, PortalAdminController],
  providers: [PortalAuthService, PortalService, PortalGuard],
  exports: [PortalAuthService],
})
export class PortalModule {}
