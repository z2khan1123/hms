import { z } from 'zod';
import { isoDateTimeSchema, booleanQuery } from './common.js';

/**
 * General supplies — syringes, linen, PPE — distinct from pharmacy stock, which
 * is held per batch because medicines expire.
 *
 * Quantity on hand is DERIVED by summing stock movements. There is no stored
 * balance, so a movement and the balance it produced can never disagree. It is
 * the same reasoning as bed occupancy and the visit stage, applied to a number
 * people are far more tempted to cache.
 */

export const stockMoveKindSchema = z.enum(['receipt', 'issue', 'adjustment']);
export type StockMoveKind = z.infer<typeof stockMoveKindSchema>;

export const STOCK_MOVE_KIND_LABELS: Record<StockMoveKind, string> = {
  receipt: 'Received',
  issue: 'Issued',
  adjustment: 'Adjusted',
};

// --- reference data --------------------------------------------------------

export const createNamedSchema = z.object({
  name: z.string().trim().min(1).max(120),
});
export const updateNamedSchema = createNamedSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateNamedInput = z.infer<typeof updateNamedSchema>;

export const namedRecordSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  isActive: z.boolean(),
});
export type NamedRecord = z.infer<typeof namedRecordSchema>;

// --- items -----------------------------------------------------------------

export const createInventoryItemSchema = z.object({
  name: z.string().trim().min(1).max(160),
  categoryId: z.string().uuid().optional(),
  unit: z.string().trim().max(40).optional(),
  reorderLevel: z.number().int().min(0).max(1_000_000).optional(),
});
export type CreateInventoryItemInput = z.infer<
  typeof createInventoryItemSchema
>;

export const updateInventoryItemSchema = createInventoryItemSchema
  .partial()
  .extend({
    categoryId: z.string().uuid().nullish(),
    unit: z.string().trim().max(40).nullish(),
    reorderLevel: z.number().int().min(0).nullish(),
    isActive: z.boolean().optional(),
  });
export type UpdateInventoryItemInput = z.infer<typeof updateInventoryItemSchema>;

export const inventoryItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  category: namedRecordSchema.nullable(),
  unit: z.string().nullable(),
  reorderLevel: z.number().int().nullable(),
  isActive: z.boolean(),
  /** Summed from movements across every store. */
  quantityOnHand: z.number().int(),
  belowReorderLevel: z.boolean(),
  /** Per-store breakdown, because a hospital keeps stock in several places. */
  byStore: z.array(
    z.object({
      storeId: z.string().uuid(),
      storeName: z.string(),
      quantity: z.number().int(),
    }),
  ),
});
export type InventoryItem = z.infer<typeof inventoryItemSchema>;

export const inventoryItemListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  categoryId: z.string().uuid().optional(),
  storeId: z.string().uuid().optional(),
  lowStockOnly: booleanQuery.optional(),
  includeInactive: booleanQuery.optional(),
});

// --- movements -------------------------------------------------------------

export const receiveStockSchema = z.object({
  itemId: z.string().uuid(),
  storeId: z.string().uuid(),
  quantity: z.number().int().min(1).max(1_000_000),
  supplierName: z.string().trim().max(160).optional(),
  unitCostMinor: z.number().int().min(0).optional(),
  note: z.string().trim().max(500).optional(),
  movedAt: isoDateTimeSchema.optional(),
});
export type ReceiveStockInput = z.infer<typeof receiveStockSchema>;

export const issueStockSchema = z.object({
  itemId: z.string().uuid(),
  storeId: z.string().uuid(),
  quantity: z.number().int().min(1).max(1_000_000),
  /** Who took it — a staff member, or a free-text destination like a ward. */
  issuedToUserId: z.string().uuid().optional(),
  issuedToName: z.string().trim().max(160).optional(),
  note: z.string().trim().max(500).optional(),
  movedAt: isoDateTimeSchema.optional(),
});
export type IssueStockInput = z.infer<typeof issueStockSchema>;

/**
 * A correction — breakage, a stock count, an expiry write-off. Signed, because
 * a correction can go either way, and it always needs a reason: an unexplained
 * adjustment and stock quietly walking out of the building look identical.
 */
export const adjustStockSchema = z.object({
  itemId: z.string().uuid(),
  storeId: z.string().uuid(),
  quantity: z.number().int().refine((n) => n !== 0, 'Enter a non-zero amount'),
  note: z.string().trim().min(3).max(500),
  movedAt: isoDateTimeSchema.optional(),
});
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;

export const stockMoveSchema = z.object({
  id: z.string().uuid(),
  kind: stockMoveKindSchema,
  itemId: z.string().uuid(),
  itemName: z.string(),
  storeId: z.string().uuid(),
  storeName: z.string(),
  quantity: z.number().int(),
  supplierName: z.string().nullable(),
  unitCostMinor: z.number().int().nullable(),
  issuedToName: z.string().nullable(),
  note: z.string().nullable(),
  movedAt: isoDateTimeSchema,
});
export type StockMove = z.infer<typeof stockMoveSchema>;

export const stockMoveListQuerySchema = z.object({
  itemId: z.string().uuid().optional(),
  storeId: z.string().uuid().optional(),
  kind: stockMoveKindSchema.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

/**
 * The sign a movement contributes to stock on hand. Shared so the API's totals
 * and any client-side preview agree — a receipt adds, an issue removes, and an
 * adjustment is already signed.
 */
export function signedQuantity(move: {
  kind: StockMoveKind;
  quantity: number;
}): number {
  if (move.kind === 'issue') return -Math.abs(move.quantity);
  if (move.kind === 'receipt') return Math.abs(move.quantity);
  return move.quantity;
}
