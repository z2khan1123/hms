import { z } from 'zod';
import { booleanQuery, isoDateSchema } from './common.js';

/**
 * User-defined fields.
 *
 * Every hospital wants three things nobody else wants — a referring clinic, a
 * panel number, a bed-side ward code. The alternative to this is either
 * refusing them, or letting each request add a column and ending up with a
 * patient table nobody can read.
 *
 * Values are stored one row per field per record rather than as a JSON blob on
 * the entity. A blob cannot be indexed, cannot be joined, and cannot be
 * reported on; rows can. It costs a join and buys the analytics layer being
 * able to see these fields at all.
 */

/** Where a field can be attached. A closed list — each needs a screen. */
export const customEntitySchema = z.enum([
  'patient',
  'opd_visit',
  'admission',
  'appointment',
  'staff',
  'donor',
  'ambulance_call',
]);
export type CustomEntity = z.infer<typeof customEntitySchema>;

export const CUSTOM_ENTITY_LABELS: Record<CustomEntity, string> = {
  patient: 'Patient',
  opd_visit: 'OPD visit',
  admission: 'Admission',
  appointment: 'Appointment',
  staff: 'Staff member',
  donor: 'Blood donor',
  ambulance_call: 'Ambulance call',
};

export const customFieldTypeSchema = z.enum([
  'text',
  'textarea',
  'number',
  'date',
  'boolean',
  'select',
]);
export type CustomFieldType = z.infer<typeof customFieldTypeSchema>;

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: 'Short text',
  textarea: 'Long text',
  number: 'Number',
  date: 'Date',
  boolean: 'Yes / no',
  select: 'Choice from a list',
};

/**
 * The key is what a value row is stored against and what the analytics layer
 * would expose, so it is a stable identifier rather than the label — renaming
 * "Panel no." to "Panel number" must not orphan every value already recorded.
 */
export const customFieldKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(
    /^[a-z][a-z0-9_]*$/,
    'Use lower-case letters, digits and underscores, starting with a letter',
  );

export const createCustomFieldSchema = z
  .object({
    entity: customEntitySchema,
    key: customFieldKeySchema,
    label: z.string().trim().min(1).max(120),
    type: customFieldTypeSchema,
    helpText: z.string().trim().max(300).optional(),
    required: z.boolean().optional(),
    /** Required for `select`, meaningless otherwise. */
    options: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
    sortOrder: z.number().int().min(0).max(999).optional(),
  })
  .refine((v) => v.type !== 'select' || (v.options?.length ?? 0) > 0, {
    message: 'A choice field needs at least one option',
    path: ['options'],
  });
export type CreateCustomFieldInput = z.infer<typeof createCustomFieldSchema>;

/**
 * The key and the entity are absent on purpose: moving a field to another
 * entity, or renaming its key, would silently orphan every value already
 * recorded against it. Retire the field and add a new one instead.
 */
export const updateCustomFieldSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  helpText: z.string().trim().max(300).nullish(),
  required: z.boolean().optional(),
  options: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateCustomFieldInput = z.infer<typeof updateCustomFieldSchema>;

export const customFieldSchema = z.object({
  id: z.string().uuid(),
  entity: customEntitySchema,
  key: customFieldKeySchema,
  label: z.string(),
  type: customFieldTypeSchema,
  helpText: z.string().nullable(),
  required: z.boolean(),
  options: z.array(z.string()),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});
export type CustomField = z.infer<typeof customFieldSchema>;

export const customFieldListQuerySchema = z.object({
  entity: customEntitySchema.optional(),
  includeInactive: booleanQuery.optional(),
});

/** What a record actually holds. `null` means the field was left blank. */
export const customValueSchema = z.object({
  key: customFieldKeySchema,
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});
export type CustomValue = z.infer<typeof customValueSchema>;

export const saveCustomValuesSchema = z.object({
  values: z.array(customValueSchema).max(100),
});
export type SaveCustomValuesInput = z.infer<typeof saveCustomValuesSchema>;

/**
 * Build a validator for one field from its definition.
 *
 * Shared so the form and the API apply the same rule. A client-only check is a
 * suggestion; this is the rule, and the server runs the identical function.
 */
export function validatorFor(field: CustomField): z.ZodTypeAny {
  const required = field.required;

  switch (field.type) {
    case 'number': {
      const base = z.number({ invalid_type_error: `${field.label} must be a number` });
      return required ? base : base.nullable();
    }
    case 'boolean': {
      const base = z.boolean();
      return required ? base : base.nullable();
    }
    case 'date': {
      const base = isoDateSchema;
      return required ? base : base.nullable();
    }
    case 'select': {
      // A value that is no longer one of the options is refused rather than
      // quietly kept: the list changed for a reason.
      const base = z.enum(field.options as [string, ...string[]]);
      return required ? base : base.nullable();
    }
    case 'textarea':
    case 'text':
    default: {
      const base = z.string().trim().min(required ? 1 : 0).max(2000);
      return required ? base : base.nullable();
    }
  }
}

/**
 * Check a whole set of values against the active fields for an entity.
 * Returns a message per offending key, empty when everything is acceptable.
 */
export function validateCustomValues(
  fields: readonly CustomField[],
  values: readonly CustomValue[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  const byKey = new Map(fields.filter((f) => f.isActive).map((f) => [f.key, f]));
  const given = new Map(values.map((v) => [v.key, v.value]));

  for (const v of values) {
    if (!byKey.has(v.key)) {
      errors[v.key] = 'That field does not exist here';
    }
  }

  for (const field of byKey.values()) {
    const raw = given.has(field.key) ? given.get(field.key) : null;
    const blank = raw === null || raw === undefined || raw === '';

    if (blank) {
      if (field.required) errors[field.key] = `${field.label} is required`;
      continue;
    }

    const result = validatorFor(field).safeParse(raw);
    if (!result.success) {
      errors[field.key] =
        result.error.issues[0]?.message ?? `${field.label} is not valid`;
    }
  }

  return errors;
}

/** How a stored value is shown. Shared so a list and a form never disagree. */
export function formatCustomValue(
  field: CustomField,
  value: CustomValue['value'],
): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field.type === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}
