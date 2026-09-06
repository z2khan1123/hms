/**
 * Money and billing arithmetic — the single source of truth for both the API and
 * the web client. If these two ever disagree, the patient sees one total and the
 * receipt prints another, so the calculation lives here and nowhere else.
 *
 * Money is always integer MINOR units (paisa for PKR). Never floats.
 * Percentages are always integer BASIS POINTS (1800 = 18.00%).
 */

export const BPS_DIVISOR = 10_000;

/** Round half away from zero — matches how a cashier rounds, unlike Math.round on negatives. */
function roundHalfUp(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

export function bpsOf(amountMinor: number, bps: number): number {
  return roundHalfUp((amountMinor * bps) / BPS_DIVISOR);
}

export interface BillLineInput {
  /** What this patient is actually charged, per unit, in minor units. */
  priceMinor: number;
  quantity?: number;
  /** Percentage discount in basis points. Ignored when `discountMinor` is given. */
  discountBps?: number;
  /** Flat discount in minor units. Takes precedence over `discountBps`. */
  discountMinor?: number;
}

export interface BillLineTotals {
  quantity: number;
  grossMinor: number;
  discountBps: number;
  discountMinor: number;
  netMinor: number;
}

/**
 * gross = price x quantity
 * discount = flat, or gross x discountBps
 * net = gross - discount
 *
 * There is deliberately no tax term: private clinics here do not charge tax on
 * services, and a tax model nobody uses is a field everyone has to skip past.
 * When it is needed it comes back as an explicit parameter, not a dormant column.
 */
export function computeBillLine(input: BillLineInput): BillLineTotals {
  const quantity = Math.max(1, Math.trunc(input.quantity ?? 1));
  const grossMinor = input.priceMinor * quantity;

  const discountBps = input.discountBps ?? 0;
  const discountMinor =
    input.discountMinor !== undefined
      ? input.discountMinor
      : bpsOf(grossMinor, discountBps);

  return {
    quantity,
    grossMinor,
    discountBps,
    discountMinor,
    netMinor: grossMinor - discountMinor,
  };
}

export interface CaseBalance {
  chargedMinor: number;
  paidMinor: number;
  balanceMinor: number;
}

export function computeCaseBalance(
  lines: readonly { netMinor: number }[],
  payments: readonly { amountMinor: number; reversedAt?: string | null }[],
): CaseBalance {
  const chargedMinor = lines.reduce((sum, l) => sum + l.netMinor, 0);
  const paidMinor = payments
    .filter((p) => !p.reversedAt)
    .reduce((sum, p) => sum + p.amountMinor, 0);
  return { chargedMinor, paidMinor, balanceMinor: chargedMinor - paidMinor };
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

/** Minor units -> major units as a number. Only for display and form inputs. */
export function toMajor(amountMinor: number): number {
  return amountMinor / 100;
}

/** Major units (what a user types) -> minor units. */
export function toMinor(amountMajor: number): number {
  return roundHalfUp(amountMajor * 100);
}

export function formatMoney(
  amountMinor: number,
  currency = 'PKR',
  locale = 'en-PK',
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(toMajor(amountMinor));
}

/** 1800 -> "18%", 1850 -> "18.5%" */
export function formatBps(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2).replace(/0$/, '')}%`;
}

export function percentToBps(percent: number): number {
  return roundHalfUp(percent * 100);
}

export function bpsToPercent(bps: number): number {
  return bps / 100;
}
