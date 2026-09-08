import { describe, expect, it } from 'vitest';
import {
  type AnalyticsQuery,
  csvCell,
  toCsv,
  validateQuery,
} from '@hms/shared';
import { buildQuery } from './analytics.builder.js';
import { DATASETS, findDataset, toDatasetDto } from './analytics.registry.js';

const TENANT = '11111111-1111-1111-1111-111111111111';

function q(over: Partial<AnalyticsQuery> = {}): AnalyticsQuery {
  return {
    dataset: 'bill_items',
    measures: [{ field: 'netMinor', agg: 'sum' }],
    ...over,
  };
}

const billItems = findDataset('bill_items')!;

/**
 * The analytics layer accepts a structured query from the client and turns it
 * into SQL. That is only safe while no client string reaches the SQL text.
 * These are the tests that hold that line.
 */
describe('the query builder never emits client input as SQL', () => {
  it('refuses a field the registry does not define', () => {
    expect(() =>
      buildQuery(billItems, q({ measures: [{ field: 'passwordHash', agg: 'sum' }] }), TENANT),
    ).toThrow(/Unknown field/);
  });

  it('refuses a field name carrying SQL', () => {
    const attack = 'netMinor" FROM "User" --';
    expect(() =>
      buildQuery(billItems, q({ measures: [{ field: attack, agg: 'sum' }] }), TENANT),
    ).toThrow(/Unknown field/);
  });

  it('refuses a group-by that is not a dimension', () => {
    // `id` is a measure on this dataset; grouping by it would be a row dump.
    expect(() =>
      buildQuery(billItems, q({ groupBy: [{ field: 'id' }] }), TENANT),
    ).toThrow(/not a dimension/);
  });

  it('refuses a sort key the query did not produce', () => {
    expect(() =>
      buildQuery(
        billItems,
        q({ sort: { key: 'netMinor"; DROP TABLE "User', direction: 'asc' } }),
        TENANT,
      ),
    ).toThrow(/Cannot sort by/);
  });

  it('binds a filter value rather than inlining it', () => {
    const built = buildQuery(
      billItems,
      q({ filters: [{ field: 'serviceName', op: 'eq', value: "x'; DROP TABLE \"User\"; --" }] }),
      TENANT,
    );
    // The dangerous text is a parameter, not part of the statement.
    expect(built.sql.sql).not.toContain('DROP TABLE');
    expect(built.sql.values).toContain("x'; DROP TABLE \"User\"; --");
  });

  it('treats a percent sign in a contains filter as data, not a wildcard', () => {
    const built = buildQuery(
      billItems,
      q({ filters: [{ field: 'serviceName', op: 'contains', value: '100%' }] }),
      TENANT,
    );
    expect(built.sql.values).toContain('%100%%');
    expect(built.sql.sql).not.toContain('100%');
  });

  it('binds every value in an `in` list', () => {
    const built = buildQuery(
      billItems,
      q({ filters: [{ field: 'status', op: 'in', value: ['paid', 'pending'] }] }),
      TENANT,
    );
    expect(built.sql.values).toContain('paid');
    expect(built.sql.values).toContain('pending');
    expect(built.sql.sql).not.toContain('paid');
  });

  it('turns an empty `in` list into FALSE rather than invalid SQL', () => {
    const built = buildQuery(
      billItems,
      q({ filters: [{ field: 'status', op: 'in', value: [] }] }),
      TENANT,
    );
    expect(built.sql.sql).toContain('FALSE');
  });
});

describe('tenant isolation', () => {
  it('always filters on the tenant, as a bound parameter', () => {
    const built = buildQuery(billItems, q(), TENANT);
    expect(built.sql.sql).toContain(billItems.tenantColumn);
    expect(built.sql.values).toContain(TENANT);
  });

  it('filters on the tenant even with no filters, dates or grouping', () => {
    const built = buildQuery(billItems, q({ filters: [], groupBy: [] }), TENANT);
    expect(built.sql.values).toContain(TENANT);
  });

  it('cannot have the tenant overridden by a filter on the same column', () => {
    // There is no `tenantId` field in any registry entry, so it is unreachable.
    for (const d of DATASETS) {
      expect(d.fields.some((f) => f.key === 'tenantId')).toBe(false);
    }
  });

  it('gives every dataset a tenant column and a permission', () => {
    for (const d of DATASETS) {
      expect(d.tenantColumn, d.id).toMatch(/"tenantId"$/);
      expect(d.requires, d.id).toBeTruthy();
    }
  });
});

describe('query validation', () => {
  const dto = toDatasetDto(billItems);

  it('accepts a sensible revenue-by-department query', () => {
    expect(
      validateQuery(
        q({ groupBy: [{ field: 'department' }], measures: [{ field: 'netMinor', agg: 'sum' }] }),
        dto,
      ),
    ).toBeNull();
  });

  it('refuses to sum a name', () => {
    expect(validateQuery(q({ measures: [{ field: 'serviceName', agg: 'sum' }] }), dto)).toMatch(
      /does not apply/,
    );
  });

  it('refuses to bucket a non-date by month', () => {
    expect(
      validateQuery(q({ groupBy: [{ field: 'serviceName', grain: 'month' }] }), dto),
    ).toMatch(/not a date/);
  });

  it('refuses a backwards date range', () => {
    expect(validateQuery(q({ from: '2026-09-30', to: '2026-09-01' }), dto)).toMatch(
      /cannot be before/,
    );
  });

  it('refuses a filter with no value where one is needed', () => {
    expect(
      validateQuery(q({ filters: [{ field: 'serviceName', op: 'eq' }] }), dto),
    ).toMatch(/needs a value/);
  });

  it('allows is_null with no value', () => {
    expect(
      validateQuery(q({ filters: [{ field: 'serviceName', op: 'is_null' }] }), dto),
    ).toBeNull();
  });
});

describe('the registry itself', () => {
  it('has unique dataset ids', () => {
    const ids = DATASETS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique field keys within each dataset', () => {
    for (const d of DATASETS) {
      const keys = d.fields.map((f) => f.key);
      expect(new Set(keys).size, d.id).toBe(keys.length);
    }
  });

  it('names a dateField that actually exists', () => {
    for (const d of DATASETS) {
      if (!d.dateField) continue;
      expect(d.fields.some((f) => f.key === d.dateField), d.id).toBe(true);
    }
  });

  it('never leaks a SQL expression into the client-facing DTO', () => {
    for (const d of DATASETS) {
      const dto = toDatasetDto(d);
      const json = JSON.stringify(dto);
      expect(json, d.id).not.toContain('SELECT');
      expect(json, d.id).not.toContain('JOIN');
      for (const f of dto.fields) {
        expect(f, `${d.id}.${f.key}`).not.toHaveProperty('sql');
      }
    }
  });

  it('gives every money field a money kind, so nothing formats paisa as a count', () => {
    for (const d of DATASETS) {
      for (const f of d.fields) {
        if (f.key.endsWith('Minor')) expect(f.kind, `${d.id}.${f.key}`).toBe('money');
      }
    }
  });
});

describe('CSV export', () => {
  it('quotes only what needs quoting', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('has,comma')).toBe('"has,comma"');
    expect(csvCell('has"quote')).toBe('"has""quote"');
    expect(csvCell(null)).toBe('');
  });

  it('writes money in rupees, converted exactly once', () => {
    const csv = toCsv({
      columns: [{ key: 'sum__netMinor', label: 'Total net', kind: 'money', role: 'measure' }],
      rows: [{ sum__netMinor: 1_234_567 }],
      truncated: false,
      elapsedMs: 1,
    });
    expect(csv).toBe('Total net\r\n12345.67');
  });

  it('leaves a blank cell for a missing value rather than the word null', () => {
    const csv = toCsv({
      columns: [{ key: 'department', label: 'Department', kind: 'string', role: 'dimension' }],
      rows: [{ department: null }],
      truncated: false,
      elapsedMs: 1,
    });
    expect(csv).toBe('Department\r\n');
  });
});
