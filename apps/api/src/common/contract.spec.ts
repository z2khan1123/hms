import { describe, expect, it } from 'vitest';
import {
  bedListQuerySchema,
  booleanQuery,
  medicineListQuerySchema,
  serviceListQuerySchema,
} from '@hms/shared';

/**
 * A query string carries words, not booleans. `z.coerce.boolean()` is
 * `Boolean(value)`, which reads the five characters "false" as true — so
 * `?includeInactive=false` would have switched the flag ON and quietly shown
 * a receptionist every deleted service in the hospital. These tests exist so
 * that mistake cannot come back.
 */
describe('booleanQuery', () => {
  it('reads the words that mean false', () => {
    for (const falsey of ['false', 'FALSE', 'False', '0', 'no', 'off', '']) {
      expect(booleanQuery.parse(falsey)).toBe(false);
    }
  });

  it('reads the words that mean true', () => {
    for (const truthy of ['true', 'TRUE', '1', 'yes', 'on', ' true ']) {
      expect(booleanQuery.parse(truthy)).toBe(true);
    }
  });

  it('leaves a real boolean alone', () => {
    expect(booleanQuery.parse(true)).toBe(true);
    expect(booleanQuery.parse(false)).toBe(false);
  });

  it('treats anything else as false rather than guessing', () => {
    expect(booleanQuery.parse('maybe')).toBe(false);
  });
});

describe('list filters that hide inactive rows', () => {
  it('does not show inactive rows when the client says false', () => {
    expect(
      serviceListQuerySchema.parse({ includeInactive: 'false' }).includeInactive,
    ).toBe(false);
    expect(
      bedListQuerySchema.parse({ includeInactive: 'false' }).includeInactive,
    ).toBe(false);
    expect(
      medicineListQuerySchema.parse({ lowStockOnly: 'false' }).lowStockOnly,
    ).toBe(false);
  });

  it('leaves the flag unset when the client omits it', () => {
    expect(serviceListQuerySchema.parse({}).includeInactive).toBeUndefined();
  });
});
