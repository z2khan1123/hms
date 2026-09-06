import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatMoney, type Charge, type ChargeTypeKind } from '@hms/shared';
import { api } from '../lib/api';
import { useDebounced } from '../lib/useDebounced';
import { SearchSelect } from './SearchSelect';

export function ChargePicker({
  chargeType,
  onSelect,
  label = 'Charge',
  currency = 'PKR',
  disabled,
}: {
  chargeType?: ChargeTypeKind;
  onSelect: (charge: Charge) => void;
  label?: string;
  currency?: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query);

  const charges = useQuery({
    queryKey: ['charge-master', 'charges', chargeType ?? 'any', debounced],
    queryFn: async () => {
      const { data } = await api.get<Charge[]>('/charge-master/charges', {
        params: { chargeType, q: debounced || undefined },
      });
      return data;
    },
    enabled: !disabled,
  });

  return (
    <SearchSelect
      label={label}
      placeholder="Search charges"
      query={query}
      onQueryChange={setQuery}
      items={charges.data ?? []}
      isLoading={charges.isFetching}
      error={charges.error}
      disabled={disabled}
      emptyLabel="No charge matches"
      getKey={(c) => c.id}
      renderItem={(c) => (
        <>
          <div>
            {c.name} — {formatMoney(c.standardChargeMinor, currency)}
          </div>
          <div className="muted">
            {c.chargeCategory.name}
            {c.taxCategory ? ` · tax ${c.taxCategory.name}` : ''}
            {c.unitType ? ` · per ${c.unitType.name}` : ''}
          </div>
        </>
      )}
      onSelect={onSelect}
    />
  );
}
