import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { z } from 'zod';
import {
  type AdjustStockInput,
  type CreateInventoryItemInput,
  type IssueStockInput,
  type ReceiveStockInput,
  adjustStockSchema,
  createInventoryItemSchema,
  createNamedSchema,
  inventoryItemListQuerySchema,
  issueStockSchema,
  receiveStockSchema,
  stockMoveListQuerySchema,
  updateInventoryItemSchema,
} from '@hms/shared';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { requireTenant } from '../../common/auth/require-tenant.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  type InventoryItemListFilter,
  type StockMoveListFilter,
  InventoryService,
} from './inventory.service.js';

type UpdateInventoryItemBody = z.infer<typeof updateInventoryItemSchema>;
type CreateNamedBody = z.infer<typeof createNamedSchema>;

/**
 * Literal sub-paths (`categories`, `stores`, `items`, `moves`, and the
 * `moves/*` verbs) are declared before the `items/:id` param routes so a param
 * route never swallows a literal.
 */
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  // --- categories --------------------------------------------------

  @Get('categories')
  @Permissions('inventory:read')
  listCategories(@CurrentUser() user: AuthUser) {
    return this.inventory.listCategories(requireTenant(user));
  }

  @Post('categories')
  @Permissions('inventory:manage')
  createCategory(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createNamedSchema)) dto: CreateNamedBody,
  ) {
    return this.inventory.createCategory(requireTenant(user), dto);
  }

  // --- stores --------------------------------------------------

  @Get('stores')
  @Permissions('inventory:read')
  listStores(@CurrentUser() user: AuthUser) {
    return this.inventory.listStores(requireTenant(user));
  }

  @Post('stores')
  @Permissions('inventory:manage')
  createStore(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createNamedSchema)) dto: CreateNamedBody,
  ) {
    return this.inventory.createStore(requireTenant(user), dto);
  }

  // --- items ----------------------------------------------

  @Get('items')
  @Permissions('inventory:read')
  listItems(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(inventoryItemListQuerySchema))
    query: InventoryItemListFilter,
  ) {
    return this.inventory.listItems(requireTenant(user), query);
  }

  @Post('items')
  @Permissions('inventory:manage')
  createItem(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createInventoryItemSchema))
    dto: CreateInventoryItemInput,
  ) {
    return this.inventory.createItem(requireTenant(user), dto);
  }

  @Get('items/:id')
  @Permissions('inventory:read')
  getItem(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.inventory.getItem(requireTenant(user), id);
  }

  @Patch('items/:id')
  @Permissions('inventory:manage')
  updateItem(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateInventoryItemSchema))
    dto: UpdateInventoryItemBody,
  ) {
    return this.inventory.updateItem(requireTenant(user), id, dto);
  }

  @Delete('items/:id')
  @Permissions('inventory:manage')
  removeItem(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.inventory.removeItem(requireTenant(user), id);
  }

  // --- movements --------------------------------------

  @Get('moves')
  @Permissions('inventory:read')
  listMoves(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(stockMoveListQuerySchema))
    query: StockMoveListFilter,
  ) {
    return this.inventory.listMoves(requireTenant(user), query);
  }

  @Post('moves/receive')
  @Permissions('inventory:manage')
  receive(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(receiveStockSchema)) dto: ReceiveStockInput,
  ) {
    return this.inventory.receive(requireTenant(user), user.id, dto);
  }

  @Post('moves/issue')
  @Permissions('inventory:manage')
  issue(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(issueStockSchema)) dto: IssueStockInput,
  ) {
    return this.inventory.issue(requireTenant(user), user.id, dto);
  }

  @Post('moves/adjust')
  @Permissions('inventory:manage')
  adjust(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(adjustStockSchema)) dto: AdjustStockInput,
  ) {
    return this.inventory.adjust(requireTenant(user), user.id, dto);
  }
}
