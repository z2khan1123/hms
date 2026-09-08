import { describe, expect, it } from 'vitest';
import { BloodGroup as PrismaBloodGroup } from '@prisma/client';
import { fromBloodGroup, toBloodGroup } from './bloodbank.mapper.js';
import {
  BLOOD_GROUPS,
  type BloodGroup,
  bloodUnitStatusOf,
  compatibleDonorGroups,
  eligibleFrom,
  incompatibilityReason,
  isCompatible,
  isDonorDeferred,
} from '@hms/shared';

/**
 * Giving a patient the wrong ABO group is the classic fatal transfusion error.
 * These tests are the reason `isCompatible` exists as one shared function
 * rather than a rule re-derived at each call site.
 */
describe('red cell compatibility', () => {
  const RBC = 'packed_red_cells' as const;

  it('makes O- the universal red cell donor', () => {
    for (const recipient of BLOOD_GROUPS) {
      expect(isCompatible('O-', recipient, RBC), `O- to ${recipient}`).toBe(true);
    }
  });

  it('makes AB+ the universal red cell recipient', () => {
    for (const unit of BLOOD_GROUPS) {
      expect(isCompatible(unit, 'AB+', RBC), `${unit} to AB+`).toBe(true);
    }
  });

  it('gives an O- patient nothing but O-', () => {
    expect(compatibleDonorGroups('O-', RBC)).toEqual(['O-']);
  });

  it('refuses A to a B patient and B to an A patient', () => {
    expect(isCompatible('A+', 'B+', RBC)).toBe(false);
    expect(isCompatible('B+', 'A+', RBC)).toBe(false);
    expect(isCompatible('AB+', 'A+', RBC)).toBe(false);
  });

  it('refuses Rh positive blood to an Rh negative patient', () => {
    // The one that quietly sensitises a woman of childbearing age.
    for (const recipient of ['O-', 'A-', 'B-', 'AB-'] as BloodGroup[]) {
      for (const unit of ['O+', 'A+', 'B+', 'AB+'] as BloodGroup[]) {
        expect(isCompatible(unit, recipient, RBC), `${unit} to ${recipient}`).toBe(false);
      }
    }
  });

  it('allows Rh negative blood into an Rh positive patient', () => {
    expect(isCompatible('O-', 'O+', RBC)).toBe(true);
    expect(isCompatible('A-', 'A+', RBC)).toBe(true);
  });

  it('always allows a patient their own group', () => {
    for (const g of BLOOD_GROUPS) {
      expect(isCompatible(g, g, RBC), `${g} to ${g}`).toBe(true);
    }
  });
});

/**
 * Plasma runs the other way — it carries antibodies, not antigens. Reversing
 * these two tables is a real and documented mistake, so it gets its own tests.
 */
describe('plasma compatibility is the reverse of red cells', () => {
  const PLASMA = 'plasma' as const;

  it('makes AB the universal plasma donor', () => {
    for (const recipient of BLOOD_GROUPS) {
      expect(isCompatible('AB+', recipient, PLASMA), `AB+ plasma to ${recipient}`).toBe(true);
      expect(isCompatible('AB-', recipient, PLASMA), `AB- plasma to ${recipient}`).toBe(true);
    }
  });

  it('makes O the universal plasma recipient', () => {
    for (const unit of BLOOD_GROUPS) {
      expect(isCompatible(unit, 'O-', PLASMA), `${unit} plasma to O-`).toBe(true);
      expect(isCompatible(unit, 'O+', PLASMA), `${unit} plasma to O+`).toBe(true);
    }
  });

  it('does NOT make O- the universal plasma donor', () => {
    // This is the exact error the reversed table would produce.
    expect(isCompatible('O-', 'AB+', PLASMA)).toBe(false);
    expect(isCompatible('O-', 'A+', PLASMA)).toBe(false);
  });

  it('does NOT make AB+ the universal plasma recipient', () => {
    // An AB patient may have only AB plasma: A plasma carries anti-B, B plasma
    // carries anti-A, and O plasma carries both.
    expect(isCompatible('AB+', 'AB+', PLASMA)).toBe(true);
    expect(isCompatible('AB-', 'AB+', PLASMA)).toBe(true);
    expect(isCompatible('A+', 'AB+', PLASMA)).toBe(false);
    expect(isCompatible('B+', 'AB+', PLASMA)).toBe(false);
    expect(isCompatible('O+', 'AB+', PLASMA)).toBe(false);
  });

  it('ignores Rh for plasma', () => {
    expect(isCompatible('A+', 'A-', PLASMA)).toBe(true);
    expect(isCompatible('A-', 'A+', PLASMA)).toBe(true);
  });

  it('treats platelets and cryoprecipitate like plasma', () => {
    expect(isCompatible('O-', 'AB+', 'platelets')).toBe(false);
    expect(isCompatible('O-', 'AB+', 'cryoprecipitate')).toBe(false);
    expect(isCompatible('O-', 'AB+', 'whole_blood')).toBe(true);
  });
});

describe('the refusal message', () => {
  it('is silent when the issue is safe', () => {
    expect(incompatibilityReason('O-', 'A+', 'packed_red_cells')).toBeNull();
  });

  it('names the groups that would have worked', () => {
    const msg = incompatibilityReason('A+', 'B+', 'packed_red_cells');
    expect(msg).toContain('A+');
    expect(msg).toContain('B+');
    expect(msg).toContain('O-');
  });
});

describe('unit status is derived, not stored', () => {
  const base = { expiresOn: '2026-12-31' };

  it('is available while nothing has happened to it', () => {
    expect(bloodUnitStatusOf(base, '2026-09-08')).toBe('available');
  });

  it('counts the expiry day itself as still good', () => {
    expect(bloodUnitStatusOf(base, '2026-12-31')).toBe('available');
    expect(bloodUnitStatusOf(base, '2027-01-01')).toBe('expired');
  });

  it('reports issued and discarded ahead of expiry', () => {
    expect(
      bloodUnitStatusOf({ ...base, issuedAt: '2026-09-08T10:00:00Z' }, '2027-06-01'),
    ).toBe('issued');
    expect(
      bloodUnitStatusOf({ ...base, discardedAt: '2026-09-08T10:00:00Z' }, '2027-06-01'),
    ).toBe('discarded');
  });

  it('reports discarded ahead of issued, because that is the later truth', () => {
    expect(
      bloodUnitStatusOf(
        { ...base, issuedAt: '2026-09-01T10:00:00Z', discardedAt: '2026-09-02T10:00:00Z' },
        '2026-09-08',
      ),
    ).toBe('discarded');
  });
});

describe('donor deferral', () => {
  it('defers a donor who gave less than 90 days ago', () => {
    expect(isDonorDeferred('2026-08-01', '2026-09-08')).toBe(true);
  });

  it('releases them on the 90th day, not the day after', () => {
    expect(isDonorDeferred('2026-06-10', '2026-09-07')).toBe(true); // 89 days
    expect(isDonorDeferred('2026-06-10', '2026-09-08')).toBe(false); // 90 days
  });

  it('agrees with the date it publishes as their next eligible day', () => {
    const next = eligibleFrom('2026-06-10');
    expect(isDonorDeferred('2026-06-10', next)).toBe(false);
  });

  it('never defers someone who has not given', () => {
    expect(isDonorDeferred(null, '2026-09-08')).toBe(false);
    expect(eligibleFrom(null)).toBeNull();
  });

  it('says exactly when they may give again', () => {
    expect(eligibleFrom('2026-06-10')).toBe('2026-09-08');
  });
});

/**
 * `A+` is not a legal Prisma enum member, so the database enum uses `A_POS` and
 * `@map`s it. `@map` changes only what Postgres stores — the generated client
 * still speaks member names — so the translation has to be real. It was a cast
 * first, which compiled happily and then failed against the database.
 */
describe('blood group translation to and from Prisma', () => {
  it('round-trips every group', () => {
    for (const g of BLOOD_GROUPS) {
      expect(toBloodGroup(fromBloodGroup(g)), g).toBe(g);
    }
  });

  it('produces a member name Prisma actually has, never the symbol form', () => {
    const members = new Set(Object.values(PrismaBloodGroup));
    for (const g of BLOOD_GROUPS) {
      const mapped = fromBloodGroup(g);
      expect(members.has(mapped), `${g} -> ${mapped}`).toBe(true);
      expect(mapped, g).not.toContain('+');
      expect(mapped, g).not.toContain('-');
    }
  });

  it('covers every member Prisma defines, so a new group cannot be missed', () => {
    for (const member of Object.values(PrismaBloodGroup)) {
      expect(toBloodGroup(member), member).toBeDefined();
      expect(BLOOD_GROUPS, member).toContain(toBloodGroup(member));
    }
  });
});
