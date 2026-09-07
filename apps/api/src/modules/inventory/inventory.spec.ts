import { describe, expect, it } from 'vitest';
import { signedQuantity } from '@hms/shared';
import { type BalanceGroup, buildStockByItem } from './inventory.mapper.js';

/**
 * Quantity on hand is never stored. These lock in that the on-hand figure is
 * only ever `Σ signedQuantity(move)` over `StockMove` rows — a receipt adds, an
 * issue removes, an adjustment is already signed — folded from grouped
 * `(item, store, kind)` sums, never an N+1 walk and never a cached column.
 */

const STORES = new Map([
  ['store-main', 'Main Store'],
  ['store-ward', 'Ward Store'],
]);

function group(
  itemId: string,
  storeId: string,
  kind: BalanceGroup['kind'],
  quantity: number,
): BalanceGroup {
  return { itemId, storeId, kind, _sum: { quantity } };
}

describe('signedQuantity (the contract does the arithmetic)', () => {
  it('adds a receipt, removes an issue, keeps an adjustment signed', () => {
    expect(signedQuantity({ kind: 'receipt', quantity: 500 })).toBe(500);
    expect(signedQuantity({ kind: 'issue', quantity: 200 })).toBe(-200);
    expect(signedQuantity({ kind: 'adjustment', quantity: -15 })).toBe(-15);
    expect(signedQuantity({ kind: 'adjustment', quantity: 15 })).toBe(15);
  });
});

describe('buildStockByItem', () => {
  it('derives on-hand per store and in total from grouped movements', () => {
    const groups: BalanceGroup[] = [
      group('syringe', 'store-main', 'receipt', 500),
      group('syringe', 'store-main', 'issue', 120),
      group('syringe', 'store-main', 'adjustment', -5),
      group('syringe', 'store-ward', 'receipt', 60),
    ];

    const stock = buildStockByItem(groups, STORES);
    const syringe = stock.get('syringe')!;

    expect(syringe.quantityOnHand).toBe(500 - 120 - 5 + 60);
    expect(syringe.byStore).toEqual([
      { storeId: 'store-main', storeName: 'Main Store', quantity: 375 },
      { storeId: 'store-ward', storeName: 'Ward Store', quantity: 60 },
    ]);
  });

  it('folding per-kind sums equals summing signed rows one by one', () => {
    const rows = [
      { kind: 'receipt' as const, quantity: 300 },
      { kind: 'receipt' as const, quantity: 200 },
      { kind: 'issue' as const, quantity: 90 },
      { kind: 'issue' as const, quantity: 40 },
      { kind: 'adjustment' as const, quantity: -12 },
    ];
    const oneByOne = rows.reduce((n, r) => n + signedQuantity(r), 0);

    const grouped = buildStockByItem(
      [
        group('x', 'store-main', 'receipt', 500),
        group('x', 'store-main', 'issue', 130),
        group('x', 'store-main', 'adjustment', -12),
      ],
      STORES,
    ).get('x')!;

    expect(grouped.quantityOnHand).toBe(oneByOne);
  });

  it('an over-issue is one that exceeds the derived balance', () => {
    const available = buildStockByItem(
      [
        group('mask', 'store-main', 'receipt', 100),
        group('mask', 'store-main', 'issue', 80),
      ],
      STORES,
    ).get('mask')!.quantityOnHand;

    expect(available).toBe(20);
    expect(25 > available).toBe(true); // rejected 409
    expect(20 > available).toBe(false); // exactly drains, allowed
  });

  it('is empty for an item with no movements', () => {
    expect(buildStockByItem([], STORES).size).toBe(0);
  });
});
