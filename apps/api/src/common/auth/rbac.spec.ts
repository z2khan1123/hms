import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLES,
  type Permission,
  type Role,
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
  // Human resources.
  ['staff:manage', 'staff:read'],
  ['attendance:mark', 'attendance:read'],
  ['attendance:mark', 'staff:read'],
  ['leave:apply', 'leave:read'],
  ['leave:approve', 'leave:read'],
  ['roster:manage', 'roster:read'],
  ['roster:manage', 'staff:read'],
  ['payroll:manage', 'payroll:read'],
  ['payroll:manage', 'staff:read'],
  // Blood bank. Issuing a bag is checked against the recipient's group, so
  // whoever may issue must be able to see both the stock and the patient.
  ['blood:collect', 'donor:read'],
  ['blood:collect', 'blood:read'],
  ['blood:issue', 'blood:read'],
  ['blood:issue', 'patient:read'],
  ['blood:discard', 'blood:read'],
  ['donor:manage', 'donor:read'],
  // Ambulance. Nobody dispatches a vehicle they cannot see.
  ['call:dispatch', 'vehicle:read'],
  ['call:dispatch', 'call:read'],
  ['vehicle:manage', 'vehicle:read'],
  // Registers. A death record closes a patient's file, so certifying one
  // requires being able to see the patient it belongs to.
  ['birth:manage', 'birth:read'],
  ['death:manage', 'death:read'],
  ['death:manage', 'patient:read'],
  // Front office.
  ['frontoffice:manage', 'frontoffice:read'],
  ['complaint:manage', 'complaint:read'],
  // Integration.
  ['apikey:manage', 'apikey:read'],
  ['webhook:manage', 'webhook:read'],
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

  it('gives platform_admin every permission there is', () => {
    // The master account. This is the assertion that keeps it master: add a
    // permission to PERMISSIONS and forget it here, and this fails rather than
    // leaving the Super Admin quietly locked out of the new feature.
    const held = new Set<Permission>(ROLE_PERMISSIONS.platform_admin);
    const missing = PERMISSIONS.filter((p) => !held.has(p));
    expect(missing, 'platform_admin must hold every permission').toEqual([]);
  });

  it('leaves platform_admin the only role holding tenant:manage', () => {
    // Widening the master account must not have widened anyone else. Every
    // other role stops short of at least the platform-level permission.
    for (const role of ROLES) {
      if (role === 'platform_admin') continue;
      expect(
        ROLE_PERMISSIONS[role].includes('tenant:manage'),
        `${role} should not hold tenant:manage`,
      ).toBe(false);
    }
  });

  it('keeps the ordinary roles restricted', () => {
    // The point of granting platform_admin everything was that it alone gains.
    // These are spot checks on the boundaries that matter clinically and
    // financially, so a future edit to the matrix cannot quietly erase them.
    const denied: Array<[Role, Permission]> = [
      ['doctor', 'payroll:manage'],
      ['doctor', 'finance:manage'],
      ['nurse', 'prescription:write'],
      ['nurse', 'bill:create'],
      ['pharmacist', 'report:write'],
      ['pharmacist', 'finance:read'],
      ['accountant', 'prescription:write'],
      ['accountant', 'report:write'],
      ['receptionist', 'report:write'],
      ['receptionist', 'finance:read'],
      ['radiologist', 'blood:issue'],
      ['read_only', 'patient:create'],
      ['read_only', 'payment:create'],
    ];
    for (const [role, permission] of denied) {
      expect(
        ROLE_PERMISSIONS[role].includes(permission),
        `${role} should not hold ${permission}`,
      ).toBe(false);
    }
  });
});
