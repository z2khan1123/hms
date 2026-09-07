import type { ItemCategory, Prisma, Store } from '@prisma/client';
import {
  type InventoryItem as InventoryItemDto,
  type NamedRecord,
  type StockMove as StockMoveDto,
  type StockMoveKind,
  signedQuantity,
} from '@hms/shared';

// --- reference data ----------------------------------------------------

export function toNamedRecordDto(r: ItemCategory | Store): NamedRecord {
  return { id: r.id, name: r.name, isActive: r.isActive };
}

// --- items -----------------------------------------------------------

export const inventoryItemInclude = { category: true } as const;

export type InventoryItemRow = Prisma.InventoryItemGetPayload<{
  include: typeof inventoryItemInclude;
}>;

/** One `groupBy` row: the summed raw quantity for an (item, store, kind). */
export interface BalanceGroup {
  itemId: string;
  storeId: string;
  kind: StockMoveKind;
  _sum: { quantity: number | null };
}

export interface ItemStock {
  quantityOnHand: number;
  byStore: { storeId: string; storeName: string; quantity: number }[];
}

export const EMPTY_ITEM_STOCK: ItemStock = { quantityOnHand: 0, byStore: [] };

/**
 * Turn the grouped `(item, store, kind) -> Σ quantity` rows into a per-item
 * stock picture. The arithmetic is done ONLY by `signedQuantity` from the
 * frozen `@hms/shared` contract: a receipt adds, an issue removes, an
 * adjustment is already signed. No balance is read from a column — there is
 * none — and there is no per-item round trip.
 */
export function buildStockByItem(
  groups: BalanceGroup[],
  storeNameById: Map<string, string>,
): Map<string, ItemStock> {
  // itemId -> storeId -> signed quantity on hand
  const byItem = new Map<string, Map<string, number>>();

  for (const g of groups) {
    const signed = signedQuantity({
      kind: g.kind,
      quantity: g._sum.quantity ?? 0,
    });
    const stores = byItem.get(g.itemId) ?? new Map<string, number>();
    stores.set(g.storeId, (stores.get(g.storeId) ?? 0) + signed);
    byItem.set(g.itemId, stores);
  }

  const result = new Map<string, ItemStock>();
  for (const [itemId, stores] of byItem) {
    const byStore = [...stores.entries()]
      .map(([storeId, quantity]) => ({
        storeId,
        storeName: storeNameById.get(storeId) ?? '(unknown store)',
        quantity,
      }))
      .sort((a, b) => a.storeName.localeCompare(b.storeName));
    result.set(itemId, {
      quantityOnHand: byStore.reduce((sum, s) => sum + s.quantity, 0),
      byStore,
    });
  }
  return result;
}

export function toInventoryItemDto(
  row: InventoryItemRow,
  stock: ItemStock,
): InventoryItemDto {
  return {
    id: row.id,
    name: row.name,
    category: row.category ? toNamedRecordDto(row.category) : null,
    unit: row.unit,
    reorderLevel: row.reorderLevel,
    isActive: row.isActive,
    quantityOnHand: stock.quantityOnHand,
    belowReorderLevel:
      row.reorderLevel !== null && stock.quantityOnHand <= row.reorderLevel,
    byStore: stock.byStore,
  };
}

// --- movements ------------------------------------------------------

export const stockMoveInclude = {
  item: { select: { name: true } },
  store: { select: { name: true } },
} as const;

export type StockMoveRow = Prisma.StockMoveGetPayload<{
  include: typeof stockMoveInclude;
}>;

export function toStockMoveDto(row: StockMoveRow): StockMoveDto {
  return {
    id: row.id,
    kind: row.kind,
    itemId: row.itemId,
    itemName: row.item.name,
    storeId: row.storeId,
    storeName: row.store.name,
    quantity: row.quantity,
    supplierName: row.supplierName,
    unitCostMinor: row.unitCostMinor,
    issuedToName: row.issuedToName,
    note: row.note,
    movedAt: row.movedAt.toISOString(),
  };
}
