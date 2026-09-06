/**
 * Bridge between the charge form inputs (major-unit strings a user types) and the
 * frozen billing arithmetic in `@hms/shared`. Every total on screen and every
 * payload we post comes out of `computeChargeLine` — nothing is recomputed here.
 */
import {
  computeChargeLine,
  percentToBps,
  toMajor,
  toMinor,
  type ChargeLineTotals,
} from '@hms/shared';

export type DiscountMode = 'percent' | 'flat';

export interface ChargeLineDraft {
  quantity: string;
  /** Applied charge per unit, in major units, as typed. */
  appliedMajor: string;
  discountMode: DiscountMode;
  discountValue: string;
  taxPercent: string;
}

export const emptyChargeLineDraft: ChargeLineDraft = {
  quantity: '1',
  appliedMajor: '',
  discountMode: 'percent',
  discountValue: '',
  taxPercent: '',
};

/** Parse a user-typed number, treating blanks and junk as 0. */
export function num(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function appliedMinor(draft: ChargeLineDraft): number {
  return Math.max(0, toMinor(num(draft.appliedMajor)));
}

function quantityOf(draft: ChargeLineDraft): number {
  const q = Math.trunc(num(draft.quantity));
  return Math.min(999, Math.max(1, q || 1));
}

function taxBpsOf(draft: ChargeLineDraft): number {
  return Math.min(100_000, Math.max(0, percentToBps(num(draft.taxPercent))));
}

function discountOf(draft: ChargeLineDraft):
  | { discountMinor: number }
  | { discountBps: number } {
  const raw = Math.max(0, num(draft.discountValue));
  return draft.discountMode === 'flat'
    ? { discountMinor: toMinor(raw) }
    : { discountBps: Math.min(10_000, percentToBps(raw)) };
}

/** Live totals for the line currently on screen. */
export function chargeLineTotals(draft: ChargeLineDraft): ChargeLineTotals {
  return computeChargeLine({
    appliedChargeMinor: appliedMinor(draft),
    quantity: quantityOf(draft),
    ...discountOf(draft),
    taxBps: taxBpsOf(draft),
  });
}

/** The charge fields of `addChargeItemSchema` / `createOpdVisitSchema.charge`. */
export function chargeLinePayload(draft: ChargeLineDraft, chargeId: string) {
  return {
    chargeId,
    appliedChargeMinor: appliedMinor(draft),
    quantity: quantityOf(draft),
    ...discountOf(draft),
    taxBps: taxBpsOf(draft),
  };
}

/** Seed the draft from a picked charge: applied defaults to standard, tax to its category. */
export function draftForCharge(
  standardChargeMinor: number,
  taxRateBps: number | null | undefined,
): ChargeLineDraft {
  return {
    ...emptyChargeLineDraft,
    appliedMajor: String(toMajor(standardChargeMinor)),
    taxPercent: taxRateBps ? String(taxRateBps / 100) : '',
  };
}
