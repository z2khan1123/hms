import { Prisma } from '@prisma/client';
import {
  MAX_ROWS,
  type AnalyticsColumn,
  type AnalyticsQuery,
  type Aggregation,
  type DateGrain,
  measureKey,
  measureKind,
  measureLabel,
} from '@hms/shared';
import type { DatasetDef } from './analytics.registry.js';

/**
 * Turns a validated query into SQL.
 *
 * The single rule this file exists to enforce: **no string from the request is
 * ever concatenated into SQL.** Field keys are looked up in the dataset
 * registry and only the registry's own `sql` expression is emitted. Aggregation
 * functions, date grains and sort directions come from closed maps keyed by
 * enums the schema already validated. Every literal — filter values, the date
 * window, the tenant id, the limit — goes in as a bound parameter.
 *
 * Anything the registry does not know is a programming error by the time it
 * reaches here, because the caller validated first; we still throw rather than
 * emit, so a future caller that forgets cannot open a hole.
 */

/** Closed set. A client string never reaches this. */
const AGG_SQL: Record<Aggregation, (expr: string) => string> = {
  count: (e) => `COUNT(${e})`,
  count_distinct: (e) => `COUNT(DISTINCT ${e})`,
  sum: (e) => `SUM(${e})`,
  avg: (e) => `AVG(${e})`,
  min: (e) => `MIN(${e})`,
  max: (e) => `MAX(${e})`,
};

/** Closed set, keyed by an enum. */
const GRAIN_SQL: Record<DateGrain, string> = {
  day: 'day',
  week: 'week',
  month: 'month',
  quarter: 'quarter',
  year: 'year',
};

export interface BuiltQuery {
  sql: Prisma.Sql;
  columns: AnalyticsColumn[];
  limit: number;
}

export function buildQuery(
  dataset: DatasetDef,
  query: AnalyticsQuery,
  tenantId: string,
): BuiltQuery {
  const byKey = new Map(dataset.fields.map((f) => [f.key, f]));
  const field = (key: string) => {
    const f = byKey.get(key);
    if (!f) throw new Error(`Unknown field "${key}" on dataset "${dataset.id}"`);
    return f;
  };

  const columns: AnalyticsColumn[] = [];
  const selectParts: Prisma.Sql[] = [];
  const groupParts: Prisma.Sql[] = [];

  // --- dimensions ---------------------------------------------------------
  for (const g of query.groupBy ?? []) {
    const f = field(g.field);
    if (f.role !== 'dimension') {
      throw new Error(`"${f.label}" is not a dimension`);
    }
    const bucketed =
      g.grain && (f.kind === 'date' || f.kind === 'datetime')
        ? `DATE_TRUNC('${GRAIN_SQL[g.grain]}', ${f.sql})`
        : f.sql;

    // The alias is the field key, which came from the registry via `field()`,
    // not from the request — the request's copy was only ever a lookup key.
    const alias = f.key;
    selectParts.push(Prisma.raw(`${bucketed} AS "${alias}"`));
    groupParts.push(Prisma.raw(bucketed));
    columns.push({
      key: alias,
      label: g.grain ? `${f.label} (${g.grain})` : f.label,
      kind: g.grain ? 'date' : f.kind,
      role: 'dimension',
    });
  }

  // --- measures -----------------------------------------------------------
  for (const m of query.measures) {
    const f = field(m.field);
    const agg = AGG_SQL[m.agg];
    if (!agg) throw new Error(`Unknown aggregation "${m.agg}"`);
    const key = measureKey(m);
    selectParts.push(Prisma.raw(`${agg(f.sql)} AS "${key}"`));
    columns.push({
      key,
      label: measureLabel(
        { key: f.key, label: f.label, kind: f.kind, role: f.role },
        m.agg,
      ),
      kind: measureKind(
        { key: f.key, label: f.label, kind: f.kind, role: f.role },
        m.agg,
      ),
      role: 'measure',
    });
  }

  // --- where --------------------------------------------------------------
  // The tenant predicate is first and is not negotiable: it comes from the
  // signed-in token, never from the request body.
  const where: Prisma.Sql[] = [
    Prisma.sql`${Prisma.raw(dataset.tenantColumn)} = ${tenantId}::uuid`,
  ];
  if (dataset.baseWhere) where.push(Prisma.raw(dataset.baseWhere));

  if (dataset.dateField && (query.from || query.to)) {
    const df = field(dataset.dateField);
    if (query.from) {
      where.push(Prisma.sql`${Prisma.raw(df.sql)} >= ${query.from}::date`);
    }
    if (query.to) {
      // Inclusive of the whole end day, which is what a person means by "to".
      where.push(
        Prisma.sql`${Prisma.raw(df.sql)} < (${query.to}::date + INTERVAL '1 day')`,
      );
    }
  }

  for (const flt of query.filters ?? []) {
    const f = field(flt.field);
    const col = Prisma.raw(f.sql);
    switch (flt.op) {
      case 'eq':
        where.push(Prisma.sql`${col} = ${flt.value}`);
        break;
      case 'ne':
        where.push(Prisma.sql`${col} IS DISTINCT FROM ${flt.value}`);
        break;
      case 'lt':
        where.push(Prisma.sql`${col} < ${flt.value}`);
        break;
      case 'lte':
        where.push(Prisma.sql`${col} <= ${flt.value}`);
        break;
      case 'gt':
        where.push(Prisma.sql`${col} > ${flt.value}`);
        break;
      case 'gte':
        where.push(Prisma.sql`${col} >= ${flt.value}`);
        break;
      case 'contains':
        // The value is bound, so `%` inside it is data, not a wildcard escape.
        where.push(Prisma.sql`${col} ILIKE ${'%' + String(flt.value) + '%'}`);
        break;
      case 'in': {
        const list = Array.isArray(flt.value) ? flt.value : [flt.value];
        if (list.length === 0) {
          where.push(Prisma.sql`FALSE`);
        } else {
          where.push(Prisma.sql`${col} IN (${Prisma.join(list)})`);
        }
        break;
      }
      case 'is_null':
        where.push(Prisma.sql`${col} IS NULL`);
        break;
      case 'is_not_null':
        where.push(Prisma.sql`${col} IS NOT NULL`);
        break;
      default: {
        // Exhaustive: the schema's enum has no other member.
        const never: never = flt.op;
        throw new Error(`Unknown operator "${String(never)}"`);
      }
    }
  }

  // --- order and limit ----------------------------------------------------
  // Sorting is by RESULT COLUMN, and the key must be one this query produced —
  // so a sort key cannot smuggle in an expression.
  let orderBy = Prisma.empty;
  if (query.sort) {
    const known = columns.find((c) => c.key === query.sort?.key);
    if (!known) throw new Error(`Cannot sort by "${query.sort.key}"`);
    const dir = query.sort.direction === 'asc' ? 'ASC' : 'DESC';
    orderBy = Prisma.raw(`ORDER BY "${known.key}" ${dir} NULLS LAST`);
  } else if (columns.length > 0) {
    const first = columns.find((c) => c.role === 'measure') ?? columns[0];
    orderBy = Prisma.raw(
      `ORDER BY "${first.key}" ${first.role === 'measure' ? 'DESC' : 'ASC'} NULLS LAST`,
    );
  }

  // One extra row, so we can tell "exactly the limit" from "there is more".
  const limit = Math.min(query.limit ?? 500, MAX_ROWS);

  const groupClause =
    groupParts.length > 0
      ? Prisma.sql`GROUP BY ${Prisma.join(groupParts, ', ')}`
      : Prisma.empty;

  const sql = Prisma.sql`
    SELECT ${Prisma.join(selectParts, ', ')}
    FROM ${Prisma.raw(dataset.from)}
    WHERE ${Prisma.join(where, ' AND ')}
    ${groupClause}
    ${orderBy}
    LIMIT ${limit + 1}
  `;

  return { sql, columns, limit };
}
