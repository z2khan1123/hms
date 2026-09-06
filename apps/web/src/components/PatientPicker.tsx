import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatAge, type Paginated, type Patient } from '@hms/shared';
import { api } from '../lib/api';
import { useDebounced } from '../lib/useDebounced';
import { SearchSelect } from './SearchSelect';

/**
 * Patient type-ahead for registration desks. The API matches name, MRN, phone and
 * CNIC last-4, so one box covers every way a receptionist identifies a patient.
 */
export function PatientPicker({
  onSelect,
  label = 'Find patient',
  autoFocus,
}: {
  onSelect: (patient: Patient) => void;
  label?: string;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query);

  const results = useQuery({
    // Distinct from the paginated list key and the flat lookup key — this one
    // returns the first page of matches for a type-ahead.
    queryKey: ['patients', 'picker', debounced],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Patient>>('/patients', {
        params: { q: debounced, pageSize: 10 },
      });
      return data.data;
    },
    enabled: debounced.trim().length > 0,
  });

  return (
    <SearchSelect
      label={label}
      placeholder="Name, MRN, phone or CNIC last 4"
      query={query}
      onQueryChange={setQuery}
      items={results.data ?? []}
      isLoading={results.isFetching}
      error={results.error}
      autoFocus={autoFocus}
      emptyLabel="No patient matches"
      getKey={(p) => p.id}
      renderItem={(p) => (
        <>
          <div>
            {p.lastName}, {p.firstName}
          </div>
          <div className="muted">
            {p.mrn} · {p.gender} · {formatAge(p.birthDate)} · {p.phone}
          </div>
        </>
      )}
      onSelect={onSelect}
    />
  );
}
