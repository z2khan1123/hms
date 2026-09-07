import { describe, expect, it } from 'vitest';
import { isSameCalendarDay } from './finance.mapper.js';

/**
 * The books are not quietly editable: an income or expense entry may be
 * hard-deleted only on the same calendar day it was created, in the hospital's
 * own timezone. After that it must be reversed with a compensating entry.
 */
describe('isSameCalendarDay', () => {
  const tz = 'Asia/Karachi'; // UTC+5, no DST

  it('is true for two instants on the same local day', () => {
    expect(
      isSameCalendarDay(
        new Date('2026-09-06T02:00:00.000Z'),
        new Date('2026-09-06T18:30:00.000Z'),
        tz,
      ),
    ).toBe(true);
  });

  it('is false once the local day has rolled over', () => {
    // 15:00Z is Sep 6 20:00 in Karachi; 20:00Z is already Sep 7 01:00.
    expect(
      isSameCalendarDay(
        new Date('2026-09-06T15:00:00.000Z'),
        new Date('2026-09-06T20:00:00.000Z'),
        tz,
      ),
    ).toBe(false);
  });

  it('uses the tenant timezone, not UTC, for the boundary', () => {
    // 2026-09-06T21:00Z is already 2026-09-07 02:00 in Karachi.
    const created = new Date('2026-09-06T21:00:00.000Z');
    const laterSameLocalDay = new Date('2026-09-07T05:00:00.000Z');
    expect(isSameCalendarDay(created, laterSameLocalDay, tz)).toBe(true);
    expect(isSameCalendarDay(created, laterSameLocalDay, 'UTC')).toBe(false);
  });
});
