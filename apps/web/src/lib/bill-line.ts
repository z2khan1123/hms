/**
 * Bridge between the bill-line form inputs (major-unit strings a user types) and
 * the frozen billing arithmetic in `@hms/shared`. Every total on screen and every
 * payload we post comes out of `computeBillLine` — nothing is recomputed here.
 *
 * There is deliberately no tax term: the price typed on the patient's file is
 * what is charged, full stop.
 */
import {
  computeBillLine,
  percentToBps,
  toMajor,
  toMinor,
  type BillLineTotals,
} from '@hms/shared';

export type DiscountMode = 'percent' | 'flat';

export interface BillLineDraft {
  quantity: string;
  /** Price per unit, in major units, as typed on the patient's file. */
  priceMajor: string;
  discountMode: DiscountMode;
  discountValue: string;
}

export const emptyBillLineDraft: BillLineDraft = {
  quantity: '1',
  priceMajor: '',
  discountMode: 'percent',
  discountValue: '',
};

/** Parse a user-typed number, treating blanks and junk as 0. */
export function num(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function priceMinorOf(draft: BillLineDraft): number {
  return Math.max(0, toMinor(num(draft.priceMajor)));
}

function quantityOf(draft: BillLineDraft): number {
  const q = Math.trunc(num(draft.quantity));
  return Math.min(999, Math.max(1, q || 1));
}

function discountOf(
  draft: BillLineDraft,
): { discountMinor: number } | { discountBps: number } {
  const raw = Math.max(0, num(draft.discountValue));
  return draft.discountMode === 'flat'
    ? { discountMinor: Math.max(0, toMinor(raw)) }
    : { discountBps: Math.min(10_000, Math.max(0, percentToBps(raw))) };
}

/** Live totals for the line currently on screen. */
export function billLineTotals(draft: BillLineDraft): BillLineTotals {
  return computeBillLine({
    priceMinor: priceMinorOf(draft),
    quantity: quantityOf(draft),
    ...discountOf(draft),
  });
}

/** The price / quantity / discount fields shared by `addBillItemSchema` and `createOpdVisitSchema.item`. */
export function billLinePayload(draft: BillLineDraft): {
  priceMinor: number;
  quantity: number;
} & ({ discountMinor: number } | { discountBps: number }) {
  return {
    priceMinor: priceMinorOf(draft),
    quantity: quantityOf(draft),
    ...discountOf(draft),
  };
}

/** Seed the draft from a picked service: the price field pre-fills from the suggested price but stays editable. */
export function draftForService(defaultPriceMinor: number | null): BillLineDraft {
  return {
    ...emptyBillLineDraft,
    priceMajor: defaultPriceMinor != null ? String(toMajor(defaultPriceMinor)) : '',
  };
}
