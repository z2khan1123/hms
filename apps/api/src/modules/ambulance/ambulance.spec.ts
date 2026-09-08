import { describe, expect, it } from 'vitest';
import { callStageOf, responseMinutes, suggestedCallCharge } from '@hms/shared';

describe('call stage is derived from the timestamps', () => {
  it('starts dispatched', () => {
    expect(callStageOf({})).toBe('dispatched');
  });

  it('advances as each timestamp lands', () => {
    expect(callStageOf({ arrivedAt: '2026-09-08T10:00:00Z' })).toBe('arrived');
    expect(
      callStageOf({ arrivedAt: '2026-09-08T10:00:00Z', completedAt: '2026-09-08T11:00:00Z' }),
    ).toBe('completed');
  });

  it('reports cancelled above everything else', () => {
    expect(
      callStageOf({
        arrivedAt: '2026-09-08T10:00:00Z',
        completedAt: '2026-09-08T11:00:00Z',
        cancelledAt: '2026-09-08T12:00:00Z',
      }),
    ).toBe('cancelled');
  });
});

describe('response time', () => {
  it('is whole minutes from dispatch to arrival', () => {
    expect(responseMinutes('2026-09-08T10:00:00Z', '2026-09-08T10:12:00Z')).toBe(12);
  });

  it('is unknown while the ambulance is still en route', () => {
    expect(responseMinutes('2026-09-08T10:00:00Z', null)).toBeNull();
  });

  it('refuses to report a negative time from a bad clock', () => {
    expect(responseMinutes('2026-09-08T10:00:00Z', '2026-09-08T09:00:00Z')).toBeNull();
  });
});

describe('suggested charge', () => {
  it('is base plus distance, in paisa', () => {
    // PKR 1,500 base + PKR 50/km over 12.4 km.
    expect(
      suggestedCallCharge({
        baseChargeMinor: 150_000,
        perKmChargeMinor: 5_000,
        distanceKm: 12.4,
      }),
    ).toBe(150_000 + 62_000);
  });

  it('rounds to the paisa rather than leaving a fraction', () => {
    const v = suggestedCallCharge({
      baseChargeMinor: 0,
      perKmChargeMinor: 333,
      distanceKm: 1.5,
    });
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBe(500);
  });

  it('treats missing rates as zero rather than NaN', () => {
    expect(suggestedCallCharge({})).toBe(0);
    expect(suggestedCallCharge({ baseChargeMinor: 100_000 })).toBe(100_000);
  });

  it('never suggests a negative charge', () => {
    expect(suggestedCallCharge({ baseChargeMinor: 0, perKmChargeMinor: 0, distanceKm: 0 })).toBe(0);
  });
});
