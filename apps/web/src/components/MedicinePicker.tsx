import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Medicine } from '@hms/shared';
import { api } from '../lib/api';
import { useDebounced } from '../lib/useDebounced';
import { SearchSelect } from './SearchSelect';

/**
 * Searchable pick from the medicine master. Used by the dispensing counter, the
 * purchase form and the prescription editor. Picking a medicine hands the caller
 * the whole record, so an allergen check can run against `allergenKeywords`.
 */
export function MedicinePicker({
  onSelect,
  label = 'Medicine',
  placeholder = 'Search the medicine master',
  includeInactive = false,
  disabled,
  keepQueryOnSelect,
}: {
  onSelect: (medicine: Medicine) => void;
  label?: string;
  placeholder?: string;
  includeInactive?: boolean;
  disabled?: boolean;
  keepQueryOnSelect?: boolean;
}) {
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query);

  const results = useQuery({
    // Medicine[] for a type-ahead — distinct from the master list's filter key.
    queryKey: ['pharmacy', 'medicines', 'picker', debounced, includeInactive],
    queryFn: async () => {
      const { data } = await api.get<Medicine[]>('/pharmacy/medicines', {
        params: {
          q: debounced || undefined,
          includeInactive: includeInactive || undefined,
        },
      });
      return data;
    },
    enabled: !disabled,
  });

  return (
    <SearchSelect
      label={label}
      placeholder={placeholder}
      query={query}
      onQueryChange={setQuery}
      items={results.data ?? []}
      isLoading={results.isFetching}
      error={results.error}
      disabled={disabled}
      keepQueryOnSelect={keepQueryOnSelect}
      emptyLabel="No medicine matches"
      getKey={(m) => m.id}
      renderItem={(m) => (
        <>
          <div>
            {m.name}
            {m.strength ? ` — ${m.strength}` : ''}
          </div>
          <div className="muted">
            {m.genericName ? `${m.genericName} · ` : ''}
            {m.unit ?? 'unit'} · stock {m.stockOnHand}
            {m.belowReorderLevel ? ' · low' : ''}
          </div>
        </>
      )}
      onSelect={onSelect}
    />
  );
}
