import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  SERVICE_DEPARTMENT_LABELS,
  formatMoney,
  type Service,
  type ServiceDepartment,
} from '@hms/shared';
import { api } from '../lib/api';
import { useDebounced } from '../lib/useDebounced';
import { SearchSelect } from './SearchSelect';

/**
 * Searchable pick from the service list. Picking a service keeps the billed name
 * consistent for reporting and pre-fills the price; typing a name and pressing
 * Enter bills a one-off item with no `serviceId`.
 */
export function ServicePicker({
  department,
  onSelect,
  onSubmitText,
  label = 'Service',
  currency = 'PKR',
  disabled,
}: {
  department?: ServiceDepartment;
  onSelect: (service: Service) => void;
  /** Called with a typed name when the user picks nothing and presses Enter. */
  onSubmitText?: (name: string) => void;
  label?: string;
  currency?: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query);

  const services = useQuery({
    // Service[] as returned by GET /services — distinct from the setup list key.
    queryKey: ['services', 'picker', department ?? 'any', debounced],
    queryFn: async () => {
      const { data } = await api.get<Service[]>('/services', {
        params: { department, q: debounced || undefined },
      });
      return data;
    },
    enabled: !disabled,
  });

  return (
    <SearchSelect
      label={label}
      placeholder="Search services, or type a one-off name"
      query={query}
      onQueryChange={setQuery}
      items={services.data ?? []}
      isLoading={services.isFetching}
      error={services.error}
      disabled={disabled}
      emptyLabel="No service matches"
      getKey={(s) => s.id}
      onSubmitText={onSubmitText}
      renderItem={(s) => (
        <>
          <div>
            {s.name}
            {s.defaultPriceMinor != null
              ? ` — ${formatMoney(s.defaultPriceMinor, currency)}`
              : ''}
          </div>
          {s.department ? (
            <div className="muted">{SERVICE_DEPARTMENT_LABELS[s.department]}</div>
          ) : null}
        </>
      )}
      onSelect={onSelect}
    />
  );
}
