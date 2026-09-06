import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Icd10Code } from '@hms/shared';
import { api } from '../lib/api';
import { useDebounced } from '../lib/useDebounced';
import { SearchSelect } from './SearchSelect';

export interface DiagnosisDraft {
  icd10CodeId: string;
  code: string;
  title: string;
  isPrimary: boolean;
  note?: string;
}

/** ICD-10 diagnoses for a visit. Exactly one row can be marked primary. */
export function DiagnosisEditor({
  items,
  onChange,
  disabled,
}: {
  items: DiagnosisDraft[];
  onChange: (items: DiagnosisDraft[]) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query);

  const options = useQuery({
    queryKey: ['vocabulary', 'icd10', debounced],
    queryFn: async () => {
      const { data } = await api.get<Icd10Code[]>('/vocabulary/icd10-codes', {
        params: { q: debounced },
      });
      return data;
    },
    enabled: debounced.trim().length > 0,
  });

  function add(code: Icd10Code) {
    if (items.some((i) => i.icd10CodeId === code.id)) return;
    onChange([
      ...items,
      {
        icd10CodeId: code.id,
        code: code.code,
        title: code.title,
        // First diagnosis added is primary until the clinician says otherwise.
        isPrimary: items.length === 0,
      },
    ]);
  }

  function setPrimary(id: string) {
    onChange(items.map((i) => ({ ...i, isPrimary: i.icd10CodeId === id })));
  }

  return (
    <div>
      <SearchSelect
        label="Diagnoses (ICD-10)"
        placeholder="Search by code or description"
        query={query}
        onQueryChange={setQuery}
        items={options.data ?? []}
        isLoading={options.isFetching}
        error={options.error}
        disabled={disabled}
        emptyLabel="No ICD-10 match"
        getKey={(c) => c.id}
        renderItem={(c) => (
          <>
            <div>
              <strong>{c.code}</strong> {c.title}
            </div>
            <div className="muted">{c.group.name}</div>
          </>
        )}
        onSelect={add}
      />

      {items.length === 0 ? (
        <p className="hint">No diagnosis recorded.</p>
      ) : (
        <ul className="term-list">
          {items.map((item, index) => (
            <li key={item.icd10CodeId}>
              <label className="row" style={{ gap: 6 }}>
                <input
                  type="radio"
                  name="primary-diagnosis"
                  checked={item.isPrimary}
                  disabled={disabled}
                  onChange={() => setPrimary(item.icd10CodeId)}
                />
                <span className="hint">Primary</span>
              </label>
              <span className="term-title">
                <strong>{item.code}</strong> {item.title}
              </span>
              <input
                aria-label={`Note for ${item.code}`}
                placeholder="Note (optional)"
                value={item.note ?? ''}
                disabled={disabled}
                onChange={(e) =>
                  onChange(
                    items.map((d, i) =>
                      i === index ? { ...d, note: e.target.value } : d,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="secondary"
                disabled={disabled}
                onClick={() => {
                  const next = items.filter((_, i) => i !== index);
                  // Never leave the list without a primary.
                  if (next.length > 0 && !next.some((d) => d.isPrimary)) {
                    next[0] = { ...next[0], isPrimary: true };
                  }
                  onChange(next);
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
