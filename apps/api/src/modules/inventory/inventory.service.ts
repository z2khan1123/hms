import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  type AdjustStockInput,
  type CreateInventoryItemInput,
  type InventoryItem as InventoryItemDto,
  type IssueStockInput,
  type NamedRecord,
  type ReceiveStockInput,
  type StockMove as StockMoveDto,
  type StockMoveKind,
  signedQuantity,
} from '@hms/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  type BalanceGroup,
  buildStockByItem,
  EMPTY_ITEM_STOCK,
  inventoryItemInclude,
  type InventoryItemRow,
  type ItemStock,
  stockMoveInclude,
  toInventoryItemDto,
  toNamedRecordDto,
  toStockMoveDto,
} from './inventory.mapper.js';

interface NamedBody {
  name: string;
}

export interface InventoryItemListFilter {
  q?: string;
  categoryId?: string;
  storeId?: string;
  lowStockOnly?: boolean;
  includeInactive?: boolean;
}

export interface StockMoveListFilter {
  itemId?: string;
  storeId?: string;
  kind?: StockMoveKind;
  from?: string;
  to?: string;
}

type UpdateItemBody = Omit<
  Partial<CreateInventoryItemInput>,
  'categoryId' | 'unit' | 'reorderLevel'
> & {
  categoryId?: string | null;
  unit?: string | null;
  reorderLevel?: number | null;
  isActive?: boolean;
};

type DeleteResult = { id: string; softDeleted: boolean };

/** A Prisma interactive-transaction client. */
type Tx = Prisma.TransactionClient;

const LIST_LIMIT = 2000;

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  // --- categories ----------------------------------------------------

  async listCategories(tenantId: string): Promise<NamedRecord[]> {
    const rows = await this.prisma.itemCategory.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
    return rows.map(toNamedRecordDto);
  }

  async createCategory(
    tenantId: string,
    input: NamedBody,
  ): Promise<NamedRecord> {
    await this.assertNameFree('category', tenantId, input.name);
    const created = await this.prisma.itemCategory.create({
      data: { tenantId, name: input.name },
    });
    return toNamedRecordDto(created);
  }

  // --- stores ------------------------------------------------------

  async listStores(tenantId: string): Promise<NamedRecord[]> {
    const rows = await this.prisma.store.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
    return rows.map(toNamedRecordDto);
  }

  async createStore(tenantId: string, input: NamedBody): Promise<NamedRecord> {
    await this.assertNameFree('store', tenantId, input.name);
    const created = await this.prisma.store.create({
      data: { tenantId, name: input.name },
    });
    return toNamedRecordDto(created);
  }

  // --- items -----------------------------------------------------

  async listItems(
    tenantId: string,
    filter: InventoryItemListFilter,
  ): Promise<InventoryItemDto[]> {
    const where: Prisma.InventoryItemWhereInput = {
      tenantId,
      categoryId: filter.categoryId,
      ...(filter.includeInactive ? {} : { isActive: true }),
      ...(filter.q
        ? { name: { contains: filter.q, mode: 'insensitive' } }
        : {}),
    };

    const rows = await this.prisma.inventoryItem.findMany({
      where,
      include: inventoryItemInclude,
      orderBy: { name: 'asc' },
      take: LIST_LIMIT,
    });

    const stock = await this.stockForItems(
      tenantId,
      rows.map((r) => r.id),
      filter.storeId,
    );
    const dtos = rows.map((r) =>
      toInventoryItemDto(r, stock.get(r.id) ?? EMPTY_ITEM_STOCK),
    );
    return filter.lowStockOnly
      ? dtos.filter((d) => d.belowReorderLevel)
      : dtos;
  }

  async getItem(tenantId: string, id: string): Promise<InventoryItemDto> {
    const row = await this.findItemRow(tenantId, id);
    const stock = await this.stockForItems(tenantId, [id]);
    return toInventoryItemDto(row, stock.get(id) ?? EMPTY_ITEM_STOCK);
  }

  async createItem(
    tenantId: string,
    input: CreateInventoryItemInput,
  ): Promise<InventoryItemDto> {
    if (input.categoryId) await this.assertCategory(tenantId, input.categoryId);
    await this.assertNameFree('item', tenantId, input.name);
    const created = await this.prisma.inventoryItem.create({
      data: {
        tenantId,
        name: input.name,
        categoryId: input.categoryId ?? null,
        unit: input.unit ?? null,
        reorderLevel: input.reorderLevel ?? null,
      },
      include: inventoryItemInclude,
    });
    return toInventoryItemDto(created, EMPTY_ITEM_STOCK);
  }

  async updateItem(
    tenantId: string,
    id: string,
    input: UpdateItemBody,
  ): Promise<InventoryItemDto> {
    await this.findItemRow(tenantId, id);
    if (input.categoryId) await this.assertCategory(tenantId, input.categoryId);
    if (input.name !== undefined) {
      await this.assertNameFree('item', tenantId, input.name, id);
    }
    await this.prisma.inventoryItem.update({
      where: { id },
      data: {
        name: input.name,
        categoryId:
          input.categoryId === undefined ? undefined : input.categoryId,
        unit: input.unit === undefined ? undefined : input.unit,
        reorderLevel:
          input.reorderLevel === undefined ? undefined : input.reorderLevel,
        isActive: input.isActive,
      },
    });
    return this.getItem(tenantId, id);
  }

  /**
   * Soft delete (`isActive = false`) once any `StockMove` points at the item;
   * hard delete when none does. A posted movement is never removed.
   */
  async removeItem(tenantId: string, id: string): Promise<DeleteResult> {
    await this.findItemRow(tenantId, id);
    const moves = await this.prisma.stockMove.count({
      where: { tenantId, itemId: id },
    });
    if (moves > 0) {
      await this.prisma.inventoryItem.update({
        where: { id },
        data: { isActive: false },
      });
      return { id, softDeleted: true };
    }
    await this.prisma.inventoryItem.delete({ where: { id } });
    return { id, softDeleted: false };
  }

  // --- movements ----------------------------------------------

  async listMoves(
    tenantId: string,
    filter: StockMoveListFilter,
  ): Promise<StockMoveDto[]> {
    const where: Prisma.StockMoveWhereInput = {
      tenantId,
      itemId: filter.itemId,
      storeId: filter.storeId,
      kind: filter.kind,
      movedAt: parseMoveRange(filter.from, filter.to),
    };
    const rows = await this.prisma.stockMove.findMany({
      where,
      include: stockMoveInclude,
      orderBy: { movedAt: 'desc' },
      take: LIST_LIMIT,
    });
    return rows.map(toStockMoveDto);
  }

  async receive(
    tenantId: string,
    createdById: string,
    input: ReceiveStockInput,
  ): Promise<StockMoveDto> {
    await this.assertItem(tenantId, input.itemId);
    await this.assertStore(tenantId, input.storeId);
    const move = await this.prisma.stockMove.create({
      data: {
        tenantId,
        itemId: input.itemId,
        storeId: input.storeId,
        kind: 'receipt',
        quantity: input.quantity,
        supplierName: input.supplierName ?? null,
        unitCostMinor: input.unitCostMinor ?? null,
        note: input.note ?? null,
        movedAt: input.movedAt ? new Date(input.movedAt) : new Date(),
        createdById,
      },
      include: stockMoveInclude,
    });
    return toStockMoveDto(move);
  }

  /**
   * Issue stock out of a store. The balance is recomputed from `StockMove`
   * rows INSIDE the transaction, behind a per-(item, store) advisory lock, so
   * two concurrent issues are strictly ordered and cannot both pass. An issue
   * can never take stock negative — the request is rejected 409 first, naming
   * the item, the store and what is actually available.
   */
  async issue(
    tenantId: string,
    createdById: string,
    input: IssueStockInput,
  ): Promise<StockMoveDto> {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findFirst({
        where: { id: input.itemId, tenantId },
        select: { id: true, name: true },
      });
      if (!item) throw new BadRequestException('Unknown item');
      const store = await tx.store.findFirst({
        where: { id: input.storeId, tenantId, isActive: true },
        select: { id: true, name: true },
      });
      if (!store) throw new BadRequestException('Unknown store');

      await this.lockItemStore(tx, tenantId, input.itemId, input.storeId);
      const available = await this.balanceInTx(
        tx,
        tenantId,
        input.itemId,
        input.storeId,
      );

      if (input.quantity > available) {
        throw new ConflictException(
          `Cannot issue ${input.quantity} of ${item.name} from ${store.name}: ` +
            `only ${available} available.`,
        );
      }

      const move = await tx.stockMove.create({
        data: {
          tenantId,
          itemId: input.itemId,
          storeId: input.storeId,
          kind: 'issue',
          quantity: input.quantity,
          issuedToUserId: input.issuedToUserId ?? null,
          issuedToName: input.issuedToName ?? null,
          note: input.note ?? null,
          movedAt: input.movedAt ? new Date(input.movedAt) : new Date(),
          createdById,
        },
        include: stockMoveInclude,
      });
      return toStockMoveDto(move);
    });
  }

  /**
   * A signed correction with a mandatory reason. Like an issue, the balance is
   * recomputed in-transaction behind the advisory lock; an adjustment that
   * would drive a store's balance below zero is rejected 409. (Agreed: an
   * on-hand count can't legitimately be negative, and a write-off can't remove
   * more than is there — that is a data-entry error, not a correction.)
   */
  async adjust(
    tenantId: string,
    createdById: string,
    input: AdjustStockInput,
  ): Promise<StockMoveDto> {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findFirst({
        where: { id: input.itemId, tenantId },
        select: { id: true, name: true },
      });
      if (!item) throw new BadRequestException('Unknown item');
      const store = await tx.store.findFirst({
        where: { id: input.storeId, tenantId, isActive: true },
        select: { id: true, name: true },
      });
      if (!store) throw new BadRequestException('Unknown store');

      await this.lockItemStore(tx, tenantId, input.itemId, input.storeId);
      const available = await this.balanceInTx(
        tx,
        tenantId,
        input.itemId,
        input.storeId,
      );
      const resulting = available + input.quantity;
      if (resulting < 0) {
        throw new ConflictException(
          `Adjusting ${item.name} in ${store.name} by ${input.quantity} would ` +
            `take the balance to ${resulting}; only ${available} on hand.`,
        );
      }

      const move = await tx.stockMove.create({
        data: {
          tenantId,
          itemId: input.itemId,
          storeId: input.storeId,
          kind: 'adjustment',
          quantity: input.quantity,
          note: input.note,
          movedAt: input.movedAt ? new Date(input.movedAt) : new Date(),
          createdById,
        },
        include: stockMoveInclude,
      });
      return toStockMoveDto(move);
    });
  }

  // --- stock maths -----------------------------------------

  /**
   * On-hand for a set of items, from ONE grouped query over `StockMove`
   * (`by: [itemId, storeId, kind]`). Never N+1, never a cached column. The
   * signed contribution of each kind is decided by `signedQuantity` from
   * `@hms/shared`.
   */
  private async stockForItems(
    tenantId: string,
    itemIds: string[],
    storeId?: string,
  ): Promise<Map<string, ItemStock>> {
    if (itemIds.length === 0) return new Map<string, ItemStock>();
    const [groups, stores] = await Promise.all([
      this.prisma.stockMove.groupBy({
        by: ['itemId', 'storeId', 'kind'],
        where: { tenantId, itemId: { in: itemIds }, storeId },
        _sum: { quantity: true },
      }),
      this.prisma.store.findMany({
        where: { tenantId },
        select: { id: true, name: true },
      }),
    ]);
    const storeNameById = new Map(stores.map((s) => [s.id, s.name]));
    return buildStockByItem(groups as BalanceGroup[], storeNameById);
  }

  /** Signed on-hand for one (item, store), summed from movements. */
  private async balanceInTx(
    tx: Tx,
    tenantId: string,
    itemId: string,
    storeId: string,
  ): Promise<number> {
    const groups = await tx.stockMove.groupBy({
      by: ['kind'],
      where: { tenantId, itemId, storeId },
      _sum: { quantity: true },
    });
    return groups.reduce(
      (sum, g) =>
        sum +
        signedQuantity({ kind: g.kind, quantity: g._sum.quantity ?? 0 }),
      0,
    );
  }

  /**
   * Serialize concurrent issues/adjustments on the same (item, store) with a
   * transaction-scoped Postgres advisory lock, so the balance one reads already
   * reflects the other's committed movement.
   */
  private async lockItemStore(
    tx: Tx,
    tenantId: string,
    itemId: string,
    storeId: string,
  ): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${tenantId}:${itemId}:${storeId}`}))`;
  }

  // --- lookups -------------------------------------------

  private async findItemRow(
    tenantId: string,
    id: string,
  ): Promise<InventoryItemRow> {
    const row = await this.prisma.inventoryItem.findFirst({
      where: { id, tenantId },
      include: inventoryItemInclude,
    });
    if (!row) throw new NotFoundException('Inventory item not found');
    return row;
  }

  private async assertItem(tenantId: string, id: string): Promise<void> {
    const found = await this.prisma.inventoryItem.findFirst({
      where: { id, tenantId, isActive: true },
      select: { id: true },
    });
    if (!found) throw new BadRequestException('Unknown item');
  }

  private async assertStore(tenantId: string, id: string): Promise<void> {
    const found = await this.prisma.store.findFirst({
      where: { id, tenantId, isActive: true },
      select: { id: true },
    });
    if (!found) throw new BadRequestException('Unknown store');
  }

  private async assertCategory(tenantId: string, id: string): Promise<void> {
    const found = await this.prisma.itemCategory.findFirst({
      where: { id, tenantId, isActive: true },
      select: { id: true },
    });
    if (!found) throw new BadRequestException('Unknown item category');
  }

  private async assertNameFree(
    entity: 'category' | 'store' | 'item',
    tenantId: string,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const where = {
      tenantId,
      name,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    };
    const label = {
      category: 'An item category',
      store: 'A store',
      item: 'An inventory item',
    }[entity];
    const clash =
      entity === 'category'
        ? await this.prisma.itemCategory.findFirst({
            where,
            select: { id: true },
          })
        : entity === 'store'
          ? await this.prisma.store.findFirst({ where, select: { id: true } })
          : await this.prisma.inventoryItem.findFirst({
              where,
              select: { id: true },
            });
    if (clash) {
      throw new ConflictException(`${label} with that name already exists`);
    }
  }
}

/** Optional `movedAt` window from raw query strings; rejects an unparseable one. */
function parseMoveRange(
  from?: string,
  to?: string,
): { gte?: Date; lte?: Date } | undefined {
  if (!from && !to) return undefined;
  const range: { gte?: Date; lte?: Date } = {};
  if (from) {
    const d = new Date(from);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException('`from` is not a valid date');
    }
    range.gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException('`to` is not a valid date');
    }
    range.lte = d;
  }
  return range;
}
