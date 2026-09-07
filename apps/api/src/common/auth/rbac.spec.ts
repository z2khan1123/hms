import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLES,
  type Permission,
} from '@hms/shared';

/**
 * These are invariants, not examples.
 *
 * Three times now a role has been given the right to *do* something without the
 * right to *see* what it produced — a doctor allowed to order lab tests but not
 * to read the results, and before that not even to see the list of tests he was
 * ordering from. Each time it typechecked, built, and was only caught by a human
 * clicking around. Encoding the rule stops it recurring.
 */

/** [action, the read a holder of that action cannot work without]. */
const ACT_WITHOUT_READ: ReadonlyArray<readonly [Permission, Permission]> = [
  // You cannot order from a list you may not see, nor ignore what came back.
  ['order:create', 'service:read'],
  ['order:create', 'report:read'],
  ['order:update', 'order:read'],
  ['order:cancel', 'order:read'],
  // Writing anything implies being able to read it back.
  ['report:write', 'report:read'],
  ['prescription:write', 'prescription:read'],
  ['nursenote:write', 'nursenote:read'],
  ['labtest:manage', 'labtest:read'],
  ['service:manage', 'service:read'],
  ['ward:manage', 'ward:read'],
  ['vocabulary:manage', 'vocabulary:read'],
  ['user:manage', 'user:read'],
  ['practitioner:manage', 'practitioner:read'],
  // Money: you cannot alter what you cannot see.
  ['bill:create', 'bill:read'],
  ['bill:delete', 'bill:read'],
  ['bill:discount', 'bill:read'],
  ['bill:approve', 'bill:read'],
  ['payment:create', 'payment:read'],
  ['payment:reverse', 'payment:read'],
  // Beds and admissions.
  ['admission:create', 'ward:read'],
  ['admission:transfer', 'ward:read'],
  ['admission:transfer', 'admission:read'],
  ['admission:discharge', 'admission:read'],
  // Patients and visits.
  ['patient:update', 'patient:read'],
  ['patient:delete', 'patient:read'],
  ['opd:create', 'patient:read'],
  ['opd:create', 'practitioner:read'],
  ['opd:update', 'opd:read'],
  ['vital:create', 'vital:read'],
  ['case:update', 'case:read'],
  ['case:close', 'case:read'],
  // Pharmacy.
  ['medicine:manage', 'medicine:read'],
  ['stock:manage', 'stock:read'],
  ['dispense:create', 'medicine:read'],
  ['dispense:create', 'stock:read'],
  ['dispense:create', 'dispense:read'],
  // Nobody hands out medicine without sight of what the patient reacts to.
  ['dispense:create', 'allergy:read'],
  ['prescription:write', 'allergy:read'],
  ['allergy:write', 'allergy:read'],
  // Finance and inventory.
  ['finance:manage', 'finance:read'],
  ['referral:manage', 'referral:read'],
  ['inventory:manage', 'inventory:read'],
];

describe('RBAC matrix', () => {
  it('never grants an action without the read it depends on', () => {
    const gaps: string[] = [];
    for (const role of ROLES) {
      const held = new Set<Permission>(ROLE_PERMISSIONS[role]);
      for (const [action, requiredRead] of ACT_WITHOUT_READ) {
        if (held.has(action) && !held.has(requiredRead)) {
          gaps.push(`${role} has ${action} but not ${requiredRead}`);
        }
      }
    }
    expect(gaps).toEqual([]);
  });

  it('only grants permissions that exist', () => {
    const known = new Set<string>(PERMISSIONS);
    const unknown: string[] = [];
    for (const role of ROLES) {
      for (const p of ROLE_PERMISSIONS[role]) {
        if (!known.has(p)) unknown.push(`${role}: ${p}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it('gives every role an entry, and no role duplicate permissions', () => {
    for (const role of ROLES) {
      expect(ROLE_PERMISSIONS[role], `${role} has no entry`).toBeDefined();
      const list = ROLE_PERMISSIONS[role];
      expect(new Set(list).size, `${role} lists a permission twice`).toBe(
        list.length,
      );
    }
  });

  it('keeps platform_admin out of clinical and money data', () => {
    // A platform operator administers tenants. Patient records are not theirs.
    const forbidden: Permission[] = [
      'patient:read',
      'opd:read',
      'report:read',
      'bill:read',
      'payment:read',
      'admission:read',
    ];
    const held = new Set<Permission>(ROLE_PERMISSIONS.platform_admin);
    for (const p of forbidden) {
      expect(held.has(p), `platform_admin should not hold ${p}`).toBe(false);
    }
  });
});
