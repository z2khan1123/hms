import { z } from 'zod';
import { isoDateSchema, isoDateTimeSchema } from './common.js';
import { PERMISSIONS } from './rbac.js';

/**
 * The analytics layer.
 *
 * The benchmarked product ships 87 hardcoded report pages. Each is a fixed
 * query with a fixed layout, so the 88th question — the one a particular
 * hospital actually needs — cannot be asked at all, and every one of them is a
 * page somebody has to maintain forever.
 *
 * This replaces all of them with one engine: a registry of datasets, a
 * structured query over them, and saved views. Adding a question costs a saved
 * view, not a page.
 *
 * The security shape matters as much as the feature. A query names a dataset
 * and fields by KEY, never by table or column, and never as SQL. The server
 * resolves those keys against its own registry and refuses anything it does
 * not recognise, so the client cannot reach a table it was not given, cannot
 * reach another tenant, and cannot inject. Values travel as bound parameters.
 */

// --- field descriptors -----------------------------------------------------

/**
 * `money` is a number in minor units, like every other amount in this system.
 * It is separate from `number` only so the client knows to format it as
 * currency — the value crossing the wire is still an integer count of paisa.
 */
export const fieldKindSchema = z.enum([
  'string',
  'number',
  'money',
  'date',
  'datetime',
  'boolean',
  'enum',
]);
export type FieldKind = z.infer<typeof fieldKindSchema>;

/**
 * A dimension is something you group or filter by; a measure is something you
 * aggregate. The split is what stops the UI offering "average patient name".
 */
export const fieldRoleSchema = z.enum(['dimension', 'measure']);
export type FieldRole = z.infer<typeof fieldRoleSchema>;

export const analyticsFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  kind: fieldKindSchema,
  role: fieldRoleSchema,
  /** Present when `kind` is `enum` — the only values a filter may offer. */
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
});
export type AnalyticsField = z.infer<typeof analyticsFieldSchema>;

export const datasetSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  /** The permission a user must hold to query this dataset at all. */
  requires: z.enum(PERMISSIONS),
  /** The field a date range applies to. Null for datasets with no natural date. */
  dateField: z.string().nullable(),
  fields: z.array(analyticsFieldSchema),
});
export type Dataset = z.infer<typeof datasetSchema>;

// --- filters ---------------------------------------------------------------

export const filterOperatorSchema = z.enum([
  'eq',
  'ne',
  'lt',
  'lte',
  'gt',
  'gte',
  'contains',
  'in',
  'is_null',
  'is_not_null',
]);
export type FilterOperator = z.infer<typeof filterOperatorSchema>;

export const FILTER_OPERATOR_LABELS: Record<FilterOperator, string> = {
  eq: 'is',
  ne: 'is not',
  lt: 'is before / less than',
  lte: 'at most',
  gt: 'is after / greater than',
  gte: 'at least',
  contains: 'contains',
  in: 'is one of',
  is_null: 'is empty',
  is_not_null: 'is not empty',
};

/** Which operators make sense for which kind of field. */
export const OPERATORS_BY_KIND: Record<FieldKind, readonly FilterOperator[]> = {
  string: ['eq', 'ne', 'contains', 'in', 'is_null', 'is_not_null'],
  number: ['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'is_null', 'is_not_null'],
  money: ['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'is_null', 'is_not_null'],
  date: ['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'is_null', 'is_not_null'],
  datetime: ['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'is_null', 'is_not_null'],
  boolean: ['eq', 'ne'],
  enum: ['eq', 'ne', 'in', 'is_null', 'is_not_null'],
};

export const analyticsFilterSchema = z.object({
  field: z.string().min(1).max(80),
  op: filterOperatorSchema,
  /** Omitted for `is_null` / `is_not_null`. An array only for `in`. */
  value: z
    .union([
      z.string().max(200),
      z.number(),
      z.boolean(),
      z.array(z.union([z.string().max(200), z.number()])).max(50),
    ])
    .optional(),
});
export type AnalyticsFilter = z.infer<typeof analyticsFilterSchema>;

/** True when this operator needs no value — so the UI can hide the box. */
export function operatorTakesValue(op: FilterOperator): boolean {
  return op !== 'is_null' && op !== 'is_not_null';
}

// --- aggregation -----------------------------------------------------------

export const aggregationSchema = z.enum(['count', 'count_distinct', 'sum', 'avg', 'min', 'max']);
export type Aggregation = z.infer<typeof aggregationSchema>;

export const AGGREGATION_LABELS: Record<Aggregation, string> = {
  count: 'Count',
  count_distinct: 'Distinct count',
  sum: 'Total',
  avg: 'Average',
  min: 'Lowest',
  max: 'Highest',
};

/**
 * Summing a name is meaningless and averaging a status is worse — it produces
 * a number that looks like an answer. Only counting works on everything.
 */
export const AGGREGATIONS_BY_KIND: Record<FieldKind, readonly Aggregation[]> = {
  string: ['count', 'count_distinct'],
  number: ['count', 'count_distinct', 'sum', 'avg', 'min', 'max'],
  money: ['count', 'sum', 'avg', 'min', 'max'],
  date: ['count', 'count_distinct', 'min', 'max'],
  datetime: ['count', 'count_distinct', 'min', 'max'],
  boolean: ['count'],
  enum: ['count', 'count_distinct'],
};

export const measureSchema = z.object({
  field: z.string().min(1).max(80),
  agg: aggregationSchema,
});
export type Measure = z.infer<typeof measureSchema>;

/** The column key a measure produces, e.g. `sum__netMinor`. */
export function measureKey(m: Measure): string {
  return `${m.agg}__${m.field}`;
}

/**
 * How a date dimension is bucketed. Grouping by a raw timestamp gives one row
 * per patient, which is a list, not a report.
 */
export const dateGrainSchema = z.enum(['day', 'week', 'month', 'quarter', 'year']);
export type DateGrain = z.infer<typeof dateGrainSchema>;

export const DATE_GRAIN_LABELS: Record<DateGrain, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  quarter: 'Quarter',
  year: 'Year',
};

export const groupBySchema = z.object({
  field: z.string().min(1).max(80),
  /** Only meaningful on a `date` or `datetime` field. */
  grain: dateGrainSchema.optional(),
});
export type GroupBy = z.infer<typeof groupBySchema>;

// --- the query -------------------------------------------------------------

export const MAX_ROWS = 5000;

export const analyticsQuerySchema = z.object({
  dataset: z.string().min(1).max(60),
  /** Inclusive window on the dataset's own `dateField`. */
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  filters: z.array(analyticsFilterSchema).max(20).optional(),
  /** Empty means no grouping: the measures are computed over the whole set. */
  groupBy: z.array(groupBySchema).max(3).optional(),
  measures: z.array(measureSchema).min(1).max(10),
  sort: z
    .object({ key: z.string().min(1).max(120), direction: z.enum(['asc', 'desc']) })
    .optional(),
  limit: z.number().int().min(1).max(MAX_ROWS).optional(),
});
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

export const analyticsColumnSchema = z.object({
  key: z.string(),
  label: z.string(),
  kind: fieldKindSchema,
  role: fieldRoleSchema,
});
export type AnalyticsColumn = z.infer<typeof analyticsColumnSchema>;

export const analyticsResultSchema = z.object({
  columns: z.array(analyticsColumnSchema),
  rows: z.array(z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]))),
  /** True when the result hit `limit` and more rows exist behind it. */
  truncated: z.boolean(),
  /** Milliseconds the database spent on it — so a slow view is visible. */
  elapsedMs: z.number().int(),
});
export type AnalyticsResult = z.infer<typeof analyticsResultSchema>;

// --- saved views -----------------------------------------------------------

export const createSavedViewSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(400).optional(),
  query: analyticsQuerySchema,
  /** Shared views are visible to everyone who can read the dataset. */
  isShared: z.boolean().optional(),
});
export type CreateSavedViewInput = z.infer<typeof createSavedViewSchema>;

export const updateSavedViewSchema = createSavedViewSchema.partial();
export type UpdateSavedViewInput = z.infer<typeof updateSavedViewSchema>;

export const savedViewSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  dataset: z.string(),
  query: analyticsQuerySchema,
  isShared: z.boolean(),
  createdBy: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  /** True when the signed-in user owns it, so the UI knows who may delete it. */
  isMine: z.boolean(),
});
export type SavedView = z.infer<typeof savedViewSchema>;

// --- helpers shared by both sides -----------------------------------------

/**
 * The label a measure column carries. Shared so the on-screen table and the
 * exported CSV never disagree about what a column is called.
 */
export function measureLabel(field: AnalyticsField, agg: Aggregation): string {
  if (agg === 'count') return `Count of ${field.label}`;
  if (agg === 'count_distinct') return `Distinct ${field.label}`;
  return `${AGGREGATION_LABELS[agg]} ${field.label.toLowerCase()}`;
}

/**
 * Averaging money gives a fraction of a paisa. Everything else about a money
 * column stays money, so the client keeps formatting it as currency and the
 * value stays an integer count of minor units.
 */
export function measureKind(field: AnalyticsField, agg: Aggregation): FieldKind {
  if (agg === 'count' || agg === 'count_distinct') return 'number';
  return field.kind;
}

/** Is this query answerable as written? Runs on both sides, same answer. */
export function validateQuery(
  query: AnalyticsQuery,
  dataset: Dataset,
): string | null {
  const byKey = new Map(dataset.fields.map((f) => [f.key, f]));

  for (const g of query.groupBy ?? []) {
    const f = byKey.get(g.field);
    if (!f) return `Unknown field "${g.field}"`;
    if (f.role !== 'dimension') return `"${f.label}" cannot be grouped by`;
    if (g.grain && f.kind !== 'date' && f.kind !== 'datetime') {
      return `"${f.label}" is not a date, so it cannot be bucketed`;
    }
  }

  for (const m of query.measures) {
    const f = byKey.get(m.field);
    if (!f) return `Unknown field "${m.field}"`;
    if (!AGGREGATIONS_BY_KIND[f.kind].includes(m.agg)) {
      return `${AGGREGATION_LABELS[m.agg]} does not apply to "${f.label}"`;
    }
  }

  for (const flt of query.filters ?? []) {
    const f = byKey.get(flt.field);
    if (!f) return `Unknown field "${flt.field}"`;
    if (!OPERATORS_BY_KIND[f.kind].includes(flt.op)) {
      return `"${FILTER_OPERATOR_LABELS[flt.op]}" does not apply to "${f.label}"`;
    }
    if (operatorTakesValue(flt.op) && flt.value === undefined) {
      return `"${f.label}" needs a value`;
    }
    if (flt.op === 'in' && !Array.isArray(flt.value)) {
      return `"${f.label}" needs a list of values`;
    }
  }

  if (query.from && query.to && query.to < query.from) {
    return 'The end date cannot be before the start date';
  }
  if ((query.from || query.to) && !dataset.dateField) {
    return `${dataset.label} has no date to filter on`;
  }

  return null;
}

/** One CSV cell, quoted only when it has to be. Shared so export is testable. */
export function csvCell(value: string | number | boolean | null): string {
  if (value === null) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/**
 * The whole CSV, including the header row. Money is emitted in MAJOR units
 * with two decimals, because a spreadsheet is where somebody adds up a column
 * and expects rupees — but the conversion happens exactly once, here.
 */
export function toCsv(result: AnalyticsResult): string {
  const lines = [result.columns.map((c) => csvCell(c.label)).join(',')];
  for (const row of result.rows) {
    lines.push(
      result.columns
        .map((c) => {
          const v = row[c.key] ?? null;
          if (c.kind === 'money' && typeof v === 'number') {
            return (v / 100).toFixed(2);
          }
          return csvCell(v);
        })
        .join(','),
    );
  }
  return lines.join('\r\n');
}
