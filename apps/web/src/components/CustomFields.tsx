import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  formatCustomValue,
  validateCustomValues,
  type CustomEntity,
  type CustomField,
  type CustomValue,
} from '@hms/shared';
import { api } from '../lib/api';
import { ErrorNote } from './QueryFeedback';

/**
 * The user-defined fields for one record.
 *
 * Drop this onto any screen that shows an entity the builder supports. It
 * renders nothing at all when a hospital has defined no fields — which is the
 * common case, and an empty "Additional details" heading on every page would be
 * worse than the feature not existing.
 */
export function CustomFields({
  entity,
  entityId,
  canEdit,
}: {
  entity: CustomEntity;
  entityId: string;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  // `edits` holds ONLY what the user has changed. The values shown are the
  // server's until then, so there is nothing to synchronise — the effect that
  // would have copied one into the other is the usual source of a form showing
  // stale data after a save.
  const [edits, setEdits] = useState<Record<string, CustomValue['value']> | null>(
    null,
  );
  const [shownFor, setShownFor] = useState(entityId);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Moving to a different record drops any unsaved edits. Adjusting state
  // during render is React's own answer to "reset when a prop changes"; an
  // effect would render the old record's edits once before clearing them.
  if (shownFor !== entityId) {
    setShownFor(entityId);
    setEdits(null);
    setErrors({});
  }

  const fields = useQuery({
    queryKey: ['custom-fields', entity],
    queryFn: async () => {
      const { data } = await api.get<CustomField[]>('/custom-fields', {
        params: { entity },
      });
      return data;
    },
  });

  const values = useQuery({
    queryKey: ['custom-fields', 'values', entity, entityId],
    queryFn: async () => {
      const { data } = await api.get<CustomValue[]>(
        `/custom-fields/values/${entity}/${entityId}`,
      );
      return data;
    },
  });

  const serverValues = Object.fromEntries(
    (values.data ?? []).map((v) => [v.key, v.value]),
  ) as Record<string, CustomValue['value']>;
  const draft = edits ?? serverValues;
  const touched = edits !== null;

  const save = useMutation({
    mutationFn: async () => {
      const payload: CustomValue[] = (fields.data ?? []).map((f) => ({
        key: f.key,
        value: draft[f.key] ?? null,
      }));
      const { data } = await api.put<CustomValue[]>(
        `/custom-fields/values/${entity}/${entityId}`,
        { values: payload },
      );
      return data;
    },
    onSuccess: async () => {
      setEdits(null);
      await queryClient.invalidateQueries({
        queryKey: ['custom-fields', 'values', entity, entityId],
      });
    },
  });

  const active = (fields.data ?? []).filter((f) => f.isActive);
  if (fields.isPending || active.length === 0) return null;

  const set = (key: string, value: CustomValue['value']) => {
    setEdits((d) => ({ ...(d ?? serverValues), [key]: value }));
  };

  const submit = () => {
    // The same shared function the API runs, so the screen cannot accept
    // something the server will refuse, or refuse something it would accept.
    const found = validateCustomValues(
      active,
      active.map((f) => ({ key: f.key, value: draft[f.key] ?? null })),
    );
    setErrors(found);
    if (Object.keys(found).length === 0) save.mutate();
  };

  return (
    <div className="card">
      <h3>Additional details</h3>
      <ErrorNote error={values.error} fallback="Could not load these fields" />
      <ErrorNote error={save.error} fallback="Could not save these fields" />

      {!canEdit ? (
        <dl className="custom-fields-read">
          {active.map((f) => (
            <div key={f.id}>
              <dt>{f.label}</dt>
              <dd>{formatCustomValue(f, draft[f.key] ?? null)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <>
          <div className="grid">
            {active.map((f) => (
              <FieldInput
                key={f.id}
                field={f}
                value={draft[f.key] ?? null}
                error={errors[f.key]}
                onChange={(v) => set(f.key, v)}
              />
            ))}
          </div>
          <div className="actions">
            <button
              type="button"
              onClick={submit}
              disabled={save.isPending || !touched}
            >
              {save.isPending ? 'Saving…' : 'Save additional details'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function FieldInput({
  field,
  value,
  error,
  onChange,
}: {
  field: CustomField;
  value: CustomValue['value'];
  error?: string;
  onChange: (value: CustomValue['value']) => void;
}) {
  const label = (
    <>
      {field.label}
      {field.required && ' *'}
    </>
  );

  return (
    <label>
      {label}
      {field.type === 'textarea' ? (
        <textarea
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value || null)}
          rows={2}
        />
      ) : field.type === 'boolean' ? (
        <select
          value={value === null || value === undefined ? '' : String(value)}
          onChange={(e) =>
            onChange(e.target.value === '' ? null : e.target.value === 'true')
          }
        >
          <option value="">—</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      ) : field.type === 'select' ? (
        <select
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">—</option>
          {field.options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : field.type === 'number' ? (
        <input
          type="number"
          value={value === null || value === undefined ? '' : String(value)}
          onChange={(e) =>
            onChange(e.target.value === '' ? null : Number(e.target.value))
          }
        />
      ) : field.type === 'date' ? (
        <input
          type="date"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value || null)}
        />
      ) : (
        <input
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value || null)}
        />
      )}
      {field.helpText && <span className="muted">{field.helpText}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}
