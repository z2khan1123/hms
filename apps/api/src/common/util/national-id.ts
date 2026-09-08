import { createHash } from 'node:crypto';

/**
 * A CNIC is never stored in plain text — only a salted hash for matching, and
 * the last four digits so a clerk can confirm they have the right person.
 *
 * Shared between patients and staff on purpose: two copies of this would
 * eventually be salted differently, and then the same national ID would hash
 * two ways and stop matching itself.
 */
export function hashNationalId(
  cnic: string,
  salt: string,
): { hash: string; last4: string } {
  const digits = cnic.replace(/\D/g, '');
  return {
    hash: createHash('sha256').update(`${salt}:${digits}`).digest('hex'),
    last4: digits.slice(-4),
  };
}
