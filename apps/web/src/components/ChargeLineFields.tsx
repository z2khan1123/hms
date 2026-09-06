import { useId } from 'react';
import { formatMoney } from '@hms/shared';
import { chargeLineTotals, type ChargeLineDraft } from '../lib/charge-line';

/**
 * The standard -> applied -> discount -> tax -> net line every billing module
 * shares. Totals come straight from `computeChargeLine`, so what the screen shows
 * is exactly what the API will store.
 */
export function ChargeLineFields({
  draft,
  onChange,
  standardChargeMinor,
  currency = 'PKR',
  disabled,
}: {
  draft: ChargeLineDraft;
  onChange: (draft: ChargeLineDraft) => void;
  standardChargeMinor: number | null;
  currency?: string;
  disabled?: boolean;
}) {
  const uid = useId();
  const totals = chargeLineTotals(draft);
  const set = (patch: Partial<ChargeLineDraft>) => onChange({ ...draft, ...patch });

  return (
    <>
      <div className="form-grid-4">
        <div className="field">
          <label htmlFor={`${uid}-standard`}>Standard charge</label>
          <input
            id={`${uid}-standard`}
            readOnly
            disabled={disabled}
            value={
              standardChargeMinor == null ? '—' : formatMoney(standardChargeMinor, currency)
            }
          />
        </div>
        <div className="field">
          <label htmlFor={`${uid}-applied`}>Applied charge</label>
          <input
            id={`${uid}-applied`}
            type="number"
            min="0"
            step="0.01"
            disabled={disabled}
            value={draft.appliedMajor}
            onChange={(e) => set({ appliedMajor: e.target.value })}
          />
          <span className="hint">Override for negotiated or panel pricing.</span>
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
          <label htmlFor={`${uid}-tax`}>Tax %</label>
          <input
            id={`${uid}-tax`}
            type="number"
            min="0"
            step="0.01"
            disabled={disabled}
            value={draft.taxPercent}
            onChange={(e) => set({ taxPercent: e.target.value })}
          />
        </div>
      </div>

      <div className="form-grid">
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
          Tax <strong>{formatMoney(totals.taxMinor, currency)}</strong>
        </span>
        <span>
          Net <strong>{formatMoney(totals.netMinor, currency)}</strong>
        </span>
      </div>
    </>
  );
}
