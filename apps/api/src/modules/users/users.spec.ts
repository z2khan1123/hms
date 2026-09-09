import { describe, expect, it } from 'vitest';
import {
  ROLE_PERMISSIONS,
  createUserSchema,
  updateUserSchema,
  userListQuerySchema,
} from '@hms/shared';

/**
 * The rules here are the ones that, if wrong, either hand somebody an account
 * they should not have or lock a hospital out of its own system.
 */

describe('creating a staff account', () => {
  const valid = {
    email: 'Nurse.Ali@Demo-Hospital.test',
    firstName: 'Ali',
    lastName: 'Raza',
    role: 'nurse' as const,
    password: 'a-long-enough-password',
  };

  it('lower-cases the email, so one person cannot hold two accounts', () => {
    // The unique key is (tenantId, email). Without normalising, Nurse.Ali@ and
    // nurse.ali@ are two rows, two logins, and two different permission sets.
    const parsed = createUserSchema.parse(valid);
    expect(parsed.email).toBe('nurse.ali@demo-hospital.test');
  });

  it('refuses a password shorter than twelve characters', () => {
    const result = createUserSchema.safeParse({ ...valid, password: 'Passw0rd!' });
    expect(result.success).toBe(false);
  });

  it('accepts a long passphrase with no symbols in it', () => {
    // Length is the rule. Composition requirements produce `Password1!` and a
    // note on the monitor, which is the threat that actually happens.
    const result = createUserSchema.safeParse({
      ...valid,
      password: 'correct horse battery staple',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a role that is not a real role', () => {
    const result = createUserSchema.safeParse({ ...valid, role: 'superuser' });
    expect(result.success).toBe(false);
  });
});

describe('editing a staff account', () => {
  it('does not let the email be changed', () => {
    // Changing the login identity silently moves an account from one person to
    // another. Deactivate and create instead: both facts stay in the audit
    // trail, and nobody inherits a session.
    const parsed = updateUserSchema.parse({
      firstName: 'Ali',
      email: 'someone.else@demo-hospital.test',
    } as never);
    expect('email' in parsed).toBe(false);
  });

  it('refuses an empty change', () => {
    expect(updateUserSchema.safeParse({}).success).toBe(false);
  });
});

describe('the account list filter', () => {
  it('treats includeInactive=false as false', () => {
    // z.coerce.boolean() would read the string "false" as true and quietly
    // show deactivated accounts as though they could still sign in.
    expect(userListQuerySchema.parse({ includeInactive: 'false' }).includeInactive).toBe(
      false,
    );
    expect(userListQuerySchema.parse({ includeInactive: 'true' }).includeInactive).toBe(
      true,
    );
  });
});

describe('who may administer users', () => {
  it('gives user:manage only to the two administrator roles', () => {
    // If a clinical role could create accounts, it could create itself an
    // administrator. This is the assertion that stops that being introduced by
    // a well-meaning edit to the matrix.
    const holders = Object.entries(ROLE_PERMISSIONS)
      .filter(([, perms]) => perms.includes('user:manage'))
      .map(([role]) => role)
      .sort();
    expect(holders).toEqual(['hospital_admin', 'platform_admin']);
  });

  it('never grants user:manage without user:read', () => {
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      if (perms.includes('user:manage')) {
        expect(perms.includes('user:read'), `${role} manages without reading`).toBe(true);
      }
    }
  });
});
