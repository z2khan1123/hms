import { describe, expect, it } from 'vitest';
import {
  complaintAgeDays,
  complaintStatusSchema,
  requiresResolution,
} from '@hms/shared';

describe('a complaint is only settled once somebody wrote down what was done', () => {
  it('demands a resolution for resolved and closed', () => {
    expect(requiresResolution('resolved')).toBe(true);
    expect(requiresResolution('closed')).toBe(true);
  });

  it('does not demand one while it is still being worked', () => {
    expect(requiresResolution('open')).toBe(false);
    expect(requiresResolution('in_progress')).toBe(false);
  });

  it('covers every status the schema defines', () => {
    for (const s of complaintStatusSchema.options) {
      expect(typeof requiresResolution(s), s).toBe('boolean');
    }
  });
});

describe('complaint age', () => {
  const NOW = '2026-09-08T12:00:00Z';

  it('counts whole days while it is still open', () => {
    expect(complaintAgeDays('2026-09-01T12:00:00Z', null, NOW)).toBe(7);
  });

  it('stops counting when it was resolved', () => {
    // An old complaint that was dealt with promptly must not keep inflating as
    // though nobody had touched it.
    expect(
      complaintAgeDays('2026-01-01T12:00:00Z', '2026-01-03T12:00:00Z', NOW),
    ).toBe(2);
  });

  it('is zero on the day it arrives', () => {
    expect(complaintAgeDays(NOW, null, NOW)).toBe(0);
  });

  it('refuses to go negative on a bad clock', () => {
    expect(complaintAgeDays('2026-10-01T12:00:00Z', null, NOW)).toBe(0);
  });
});
