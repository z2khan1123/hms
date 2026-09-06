import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useDebounced } from '../lib/useDebounced';
import { SearchSelect } from './SearchSelect';

/** A symptom or finding attached to a visit: a coded term, free text, or both. */
export interface TermDraft {
  /** Vocabulary id when the term came from the catalogue; absent for free text. */
  refId?: string;
  title: string;
  detail?: string;
}

interface VocabTerm {
  id: string;
  title: string;
  description: string | null;
}

/**
 * Shared editor for the two vocabularies that share a shape — symptoms and
 * findings. Both allow a coded pick or free text plus an optional detail line.
 */
export function VisitTermEditor({
  label,
  vocabulary,
  items,
  onChange,
  disabled,
}: {
  label: string;
  vocabulary: 'symptoms' | 'findings';
  items: TermDraft[];
  onChange: (items: TermDraft[]) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query);

  const options = useQuery({
    queryKey: ['vocabulary', vocabulary, debounced],
    queryFn: async () => {
      const { data } = await api.get<VocabTerm[]>(`/vocabulary/${vocabulary}`, {
        params: { q: debounced },
      });
      return data;
    },
    enabled: debounced.trim().length > 0,
  });

  function add(term: TermDraft) {
    const duplicate = items.some(
      (i) => i.title.toLowerCase() === term.title.toLowerCase(),
    );
    if (duplicate) return;
    onChange([...items, term]);
  }

  function update(index: number, patch: Partial<TermDraft>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  return (
    <div>
      <SearchSelect
        label={label}
        placeholder="Search the catalogue, or type free text and press Enter"
        query={query}
        onQueryChange={setQuery}
        items={options.data ?? []}
        isLoading={options.isFetching}
        error={options.error}
        disabled={disabled}
        emptyLabel="Nothing in the catalogue"
        getKey={(t) => t.id}
        renderItem={(t) => (
          <>
            <div>{t.title}</div>
            {t.description && <div className="muted">{t.description}</div>}
          </>
        )}
        onSelect={(t) => add({ refId: t.id, title: t.title })}
        onSubmitText={(text) => add({ title: text })}
      />

      {items.length === 0 ? (
        <p className="hint">None recorded.</p>
      ) : (
        <ul className="term-list">
          {items.map((item, index) => (
            <li key={`${item.refId ?? 'free'}-${item.title}`}>
              <span className="term-title">
                {item.title}
                {!item.refId && <span className="muted"> (free text)</span>}
              </span>
              <input
                aria-label={`Detail for ${item.title}`}
                placeholder="Detail (optional)"
                value={item.detail ?? ''}
                disabled={disabled}
                onChange={(e) => update(index, { detail: e.target.value })}
              />
              <button
                type="button"
                className="secondary"
                disabled={disabled}
                onClick={() => onChange(items.filter((_, i) => i !== index))}
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
