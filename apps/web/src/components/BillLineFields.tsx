import { useId } from 'react';
import { formatMoney } from '@hms/shared';
import {
  billLineTotals,
  priceMinorOf,
  type BillLineDraft,
} from '../lib/bill-line';

/**
 * The price -> quantity -> discount -> net line every billing screen shares.
 * Totals come straight from `computeBillLine`, so what the screen shows is exactly
 * what the API will store. There is no tax field.
 */
export function BillLineFields({
  draft,
  onChange,
  suggestedPriceMinor,
  currency = 'PKR',
  disabled,
}: {
  draft: BillLineDraft;
  onChange: (draft: BillLineDraft) => void;
  /** The picked service's suggested price, shown as a quiet hint when it differs. */
  suggestedPriceMinor: number | null;
  currency?: string;
  disabled?: boolean;
}) {
  const uid = useId();
  const totals = billLineTotals(draft);
  const set = (patch: Partial<BillLineDraft>) => onChange({ ...draft, ...patch });

  const showSuggestion =
    suggestedPriceMinor != null &&
    draft.priceMajor.trim() !== '' &&
    priceMinorOf(draft) !== suggestedPriceMinor;

  return (
    <>
      <div className="form-grid-3">
        <div className="field">
          <label htmlFor={`${uid}-price`}>Price ({currency})</label>
          <input
            id={`${uid}-price`}
            type="number"
            min="0"
            step="0.01"
            disabled={disabled}
            value={draft.priceMajor}
            onChange={(e) => set({ priceMajor: e.target.value })}
          />
          <span className="hint">
            {showSuggestion
              ? `suggested ${formatMoney(suggestedPriceMinor, currency)}`
              : 'The price on the patient’s file is what is charged.'}
          </span>
        </div>
        <div className="field">
          <label htmlFor={`${uid}-qty`}>Quantity</label>
          <input
            id={`${uid}-qty`}
            type="number"
            min="1"
            max="999"
            step="1"
            disabled={disabled}
            value={draft.quantity}
            onChange={(e) => set({ quantity: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor={`${uid}-discount-mode`}>Discount type</label>
          <select
            id={`${uid}-discount-mode`}
            disabled={disabled}
            value={draft.discountMode}
            onChange={(e) =>
              set({ discountMode: e.target.value === 'flat' ? 'flat' : 'percent' })
            }
          >
            <option value="percent">Percentage (%)</option>
            <option value="flat">Flat amount</option>
          </select>
        </div>
      </div>

      <div className="form-grid">
        <div className="field">
          <label htmlFor={`${uid}-discount`}>
            Discount {draft.discountMode === 'percent' ? '%' : `(${currency})`}
          </label>
          <input
            id={`${uid}-discount`}
            type="number"
            min="0"
            step="0.01"
            disabled={disabled}
            value={draft.discountValue}
            onChange={(e) => set({ discountValue: e.target.value })}
          />
        </div>
      </div>

      <div className="line-total">
        <span>
          Gross <strong>{formatMoney(totals.grossMinor, currency)}</strong>
        </span>
        <span>
          Discount <strong>-{formatMoney(totals.discountMinor, currency)}</strong>
        </span>
        <span>
          Net <strong>{formatMoney(totals.netMinor, currency)}</strong>
        </span>
      </div>
    </>
  );
}
