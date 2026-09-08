import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CUSTOM_ENTITY_LABELS,
  CUSTOM_FIELD_TYPE_LABELS,
  createCustomFieldSchema,
  customEntitySchema,
  customFieldTypeSchema,
  type CreateCustomFieldInput,
  type CustomEntity,
  type CustomField,
  type CustomFieldType,
} from '@hms/shared';
import { api } from '../lib/api';
import { useCan } from '../lib/permissions';
import { blankToUndefined } from '../lib/format';
import { ErrorNote, Loading } from '../components/QueryFeedback';
import { StatusBadge } from '../components/StatusBadge';

const ENTITIES = customEntitySchema.options;
const TYPES = customFieldTypeSchema.options;

const inlineLabel = {
  display: 'inline-flex',
  gap: 6,
  alignItems: 'center',
  whiteSpace: 'nowrap',
} as const;

function zodMessage(error: {
  issues: { message: string; path: (string | number)[] }[];
}): string {
  return error.issues[0]?.message ?? 'Check the values';
}

/** Turn a label into a usable key, so nobody has to invent one by hand. */
function suggestKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^([0-9])/, 'f$1')
    .slice(0, 60);
}

export function CustomFieldsPage() {
  const can = useCan();
  const queryClient = useQueryClient();
  const [entity, setEntity] = useState<CustomEntity>('patient');
  const [adding, setAdding] = useState(false);

  const fields = useQuery({
    queryKey: ['custom-fields', 'admin', entity],
    queryFn: async () => {
      const { data } = await api.get<CustomField[]>('/custom-fields', {
        params: { entity, includeInactive: 'true' },
      });
      return data;
    },
  });

  const toggle = useMutation({
    mutationFn: async (input: { id: string; isActive: boolean }) => {
      const { data } = await api.patch<CustomField>(
        `/custom-fields/${input.id}`,
        { isActive: input.isActive },
      );
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['custom-fields'] });
    },
  });

  return (
    <section>
      <h1>Custom fields</h1>
      <p className="muted">
        Fields you add here appear on the matching screens. A field's key is
        fixed once created — it is what values are stored against, so renaming
        it would orphan everything already recorded. Retire a field instead;
        its values stay on the records that have them.
      </p>

      <div className="toolbar">
        <label style={inlineLabel}>
          Record type
          <select
            value={entity}
            onChange={(e) => setEntity(e.target.value as CustomEntity)}
          >
            {ENTITIES.map((e) => (
              <option key={e} value={e}>{CUSTOM_ENTITY_LABELS[e]}</option>
            ))}
          </select>
        </label>
        {can('customfield:manage') && (
          <button type="button" onClick={() => setAdding((v) => !v)}>
            {adding ? 'Close' : 'Add a field'}
          </button>
        )}
      </div>

      {adding && can('customfield:manage') && (
        <FieldForm
          entity={entity}
          onDone={async () => {
            setAdding(false);
            await queryClient.invalidateQueries({ queryKey: ['custom-fields'] });
          }}
        />
      )}

      <ErrorNote error={fields.error} fallback="Could not load the fields" />
      <ErrorNote error={toggle.error} fallback="Could not change that field" />
      {fields.isPending && <Loading label="Loading fields…" />}
      {fields.data?.length === 0 && (
        <p className="muted">
          No custom fields on {CUSTOM_ENTITY_LABELS[entity].toLowerCase()} records
          yet.
        </p>
      )}

      {!!fields.data?.length && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th className="num">Order</th>
                <th>Label</th>
                <th>Key</th>
                <th>Type</th>
                <th>Required</th>
                <th>Options</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {fields.data.map((f) => (
                <tr key={f.id}>
                  <td className="num">{f.sortOrder}</td>
                  <td>
                    {f.label}
                    {f.helpText && <div className="muted">{f.helpText}</div>}
                  </td>
                  <td><code>{f.key}</code></td>
                  <td>{CUSTOM_FIELD_TYPE_LABELS[f.type]}</td>
                  <td>{f.required ? 'Yes' : 'No'}</td>
                  <td>{f.options.length ? f.options.join(', ') : '—'}</td>
                  <td>
                    <StatusBadge
                      status={f.isActive ? 'active' : 'inactive'}
                      label={f.isActive ? 'In use' : 'Retired'}
                    />
                  </td>
                  <td>
                    {can('customfield:manage') && (
                      <button
                        type="button"
                        disabled={toggle.isPending}
                        onClick={() =>
                          toggle.mutate({ id: f.id, isActive: !f.isActive })
                        }
                      >
                        {f.isActive ? 'Retire' : 'Reinstate'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FieldForm({
  entity,
  onDone,
}: {
  entity: CustomEntity;
  onDone: () => Promise<void>;
}) {
  const [label, setLabel] = useState('');
  const [key, setKey] = useState('');
  const [keyEdited, setKeyEdited] = useState(false);
  const [type, setType] = useState<CustomFieldType>('text');
  const [helpText, setHelpText] = useState('');
  const [required, setRequired] = useState(false);
  const [sortOrder, setSortOrder] = useState('0');
  const [optionsText, setOptionsText] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);

  const options = optionsText
    .split('\n')
    .map((o) => o.trim())
    .filter(Boolean);

  const create = useMutation({
    mutationFn: async (payload: CreateCustomFieldInput) => {
      const { data } = await api.post<CustomField>('/custom-fields', payload);
      return data;
    },
    onSuccess: onDone,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    const parsed = createCustomFieldSchema.safeParse({
      entity,
      key: key || suggestKey(label),
      label,
      type,
      helpText: blankToUndefined(helpText),
      required,
      options: type === 'select' ? options : undefined,
      sortOrder: Number(sortOrder) || 0,
    });
    if (!parsed.success) {
      setFormErr(zodMessage(parsed.error));
      return;
    }
    create.mutate(parsed.data);
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>Add a field to {CUSTOM_ENTITY_LABELS[entity].toLowerCase()} records</h2>

      <div className="grid">
        <label>
          Label
          <input
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              if (!keyEdited) setKey(suggestKey(e.target.value));
            }}
            placeholder="Referring clinic"
            required
          />
        </label>
        <label>
          Key
          <input
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setKeyEdited(true);
            }}
            placeholder="referring_clinic"
            required
          />
          <span className="muted">Fixed once saved. Lower case, no spaces.</span>
        </label>
        <label>
          Type
          <select
            value={type}
            onChange={(e) => setType(e.target.value as CustomFieldType)}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>{CUSTOM_FIELD_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </label>
        <label>
          Order
          <input
            type="number"
            min="0"
            max="999"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </label>
      </div>

      <label>
        Help text
        <input
          value={helpText}
          onChange={(e) => setHelpText(e.target.value)}
          placeholder="Shown under the field"
        />
      </label>

      {type === 'select' && (
        <label>
          Options, one per line
          <textarea
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            rows={4}
            placeholder={'Walk-in\nReferral\nCamp'}
          />
        </label>
      )}

      <label style={inlineLabel}>
        <input
          type="checkbox"
          checked={required}
          onChange={(e) => setRequired(e.target.checked)}
        />
        Required
      </label>
      {required && (
        <p className="muted">
          Existing records without a value will fail validation the next time
          somebody saves them. That is usually what you want, but it is worth
          knowing before you tick it.
        </p>
      )}

      {formErr && <div className="alert" role="alert">{formErr}</div>}
      <ErrorNote error={create.error} fallback="Could not add this field" />
      <div className="actions">
        <button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Saving…' : 'Add field'}
        </button>
      </div>
    </form>
  );
}
