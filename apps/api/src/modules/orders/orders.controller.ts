import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  collectSampleSchema,
  type CreateServiceOrdersInput,
  createServiceOrdersSchema,
  type ServiceOrderStatus,
  serviceOrderListQuerySchema,
  setServiceOrderStatusSchema,
} from '@hms/shared';
import { z } from 'zod';
import { Audit } from '../../common/audit/audit.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { requireTenant } from '../../common/auth/require-tenant.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  type ServiceOrderListFilter,
  OrdersService,
} from './orders.service.js';

const cancelServiceOrderSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @Permissions('order:create')
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createServiceOrdersSchema))
    dto: CreateServiceOrdersInput,
  ) {
    return this.orders.create(requireTenant(user), user.id, dto);
  }

  @Get()
  @Permissions('order:read')
  @Audit('order.list')
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(serviceOrderListQuerySchema))
    query: ServiceOrderListFilter,
  ) {
    return this.orders.list(requireTenant(user), query);
  }

  @Get(':id')
  @Permissions('order:read')
  @Audit('order.read')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.get(requireTenant(user), id);
  }

  @Post(':id/collect-sample')
  @Permissions('order:update')
  collectSample(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(collectSampleSchema))
    dto: { collectedAt?: string },
  ) {
    return this.orders.collectSample(
      requireTenant(user),
      user.id,
      id,
      dto.collectedAt,
    );
  }

  @Patch(':id/status')
  @Permissions('order:update')
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setServiceOrderStatusSchema))
    dto: { status: ServiceOrderStatus; reason?: string },
  ) {
    return this.orders.setStatus(
      requireTenant(user),
      user.id,
      id,
      dto.status,
      dto.reason,
    );
  }

  @Post(':id/cancel')
  @Permissions('order:cancel')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cancelServiceOrderSchema))
    dto: { reason?: string },
  ) {
    return this.orders.cancel(requireTenant(user), id, dto.reason);
  }
}
