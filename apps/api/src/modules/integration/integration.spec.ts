import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  API_KEY_PREFIX,
  MAX_DELIVERY_ATTEMPTS,
  WEBHOOK_EVENTS,
  WEBHOOK_EVENT_LABELS,
  apiKeyIsActive,
  parseApiKey,
  createWebhookSchema,
  nextAttemptAt,
  retryDelaySeconds,
  signaturePayload,
  webhookEventSchema,
} from '@hms/shared';
import { callerHasPermission } from '../../common/auth/granted.js';

const NOW = '2026-09-08T12:00:00.000Z';

describe('an API key is judged on its scopes, never on a role', () => {
  const key = {
    id: 'k1',
    email: 'apikey:hms_abcd1234',
    // A key carries a role for the audit trail. It must not confer anything.
    role: 'hospital_admin' as const,
    tenantId: 't1',
    scopes: ['patient:read'] as const,
    apiKeyId: 'k1',
  };

  it('grants exactly what it was issued', () => {
    expect(callerHasPermission(key, 'patient:read')).toBe(true);
  });

  it('grants nothing else, even though its role is hospital_admin', () => {
    // This is the whole point: a hospital_admin can do everything, and a key
    // issued under one still cannot.
    expect(callerHasPermission(key, 'patient:create')).toBe(false);
    expect(callerHasPermission(key, 'payroll:read')).toBe(false);
    expect(callerHasPermission(key, 'apikey:manage')).toBe(false);
  });

  it('still judges a person by their role', () => {
    const person = {
      id: 'u1',
      email: 'someone@example.test',
      role: 'receptionist' as const,
      tenantId: 't1',
    };
    expect(callerHasPermission(person, 'patient:create')).toBe(true);
    expect(callerHasPermission(person, 'payroll:read')).toBe(false);
  });

  it('treats an empty scope list as no authority, not as unrestricted', () => {
    const empty = { ...key, scopes: [] as const };
    expect(callerHasPermission(empty, 'patient:read')).toBe(false);
  });
});

describe('when a key is usable', () => {
  it('is usable when neither revoked nor expired', () => {
    expect(apiKeyIsActive({}, NOW)).toBe(true);
    expect(apiKeyIsActive({ expiresAt: '2027-01-01T00:00:00.000Z' }, NOW)).toBe(true);
  });

  it('is dead once revoked, whatever the expiry says', () => {
    expect(
      apiKeyIsActive(
        { revokedAt: '2026-09-01T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z' },
        NOW,
      ),
    ).toBe(false);
  });

  it('is dead at the instant it expires, not after a grace period', () => {
    expect(apiKeyIsActive({ expiresAt: NOW }, NOW)).toBe(false);
    expect(apiKeyIsActive({ expiresAt: '2026-09-08T11:59:59.000Z' }, NOW)).toBe(false);
  });

  it('uses a prefix that identifies without revealing', () => {
    expect(API_KEY_PREFIX).toBe('hms');
  });
});

/**
 * A receiver verifies these. If the shape drifts, every integration in the
 * field breaks silently — so the format is pinned here rather than only
 * described in documentation.
 */
describe('webhook signing', () => {
  it('signs the timestamp together with the body', () => {
    expect(signaturePayload('1757332800', '{"a":1}')).toBe('1757332800.{"a":1}');
  });

  it('produces a signature a receiver can reproduce from the secret', () => {
    const secret = 'whsec_test';
    const body = '{"event":"patient.created"}';
    const ts = '1757332800';
    const mine = createHmac('sha256', secret)
      .update(signaturePayload(ts, body))
      .digest('hex');
    const theirs = createHmac('sha256', secret)
      .update(`${ts}.${body}`)
      .digest('hex');
    expect(mine).toBe(theirs);
    expect(mine).toHaveLength(64);
  });

  it('changes if the timestamp changes, so a delivery cannot be replayed', () => {
    const secret = 'whsec_test';
    const body = '{"a":1}';
    const a = createHmac('sha256', secret)
      .update(signaturePayload('1757332800', body))
      .digest('hex');
    const b = createHmac('sha256', secret)
      .update(signaturePayload('1757336400', body))
      .digest('hex');
    expect(a).not.toBe(b);
  });
});

describe('retry backs off and then gives up', () => {
  it('waits longer after each failure', () => {
    const delays = [1, 2, 3, 4, 5].map(retryDelaySeconds);
    expect(delays).toEqual([30, 120, 480, 1920, 7680]);
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThan(delays[i - 1]);
    }
  });

  it('schedules another try while attempts remain', () => {
    const from = new Date('2026-09-08T12:00:00.000Z');
    const next = nextAttemptAt(1, from);
    expect(next).not.toBeNull();
    expect(next?.toISOString()).toBe('2026-09-08T12:00:30.000Z');
  });

  it('gives up rather than retrying for ever', () => {
    // An unbounded queue of undeliverable events is a disk-space incident
    // waiting to happen.
    expect(nextAttemptAt(MAX_DELIVERY_ATTEMPTS)).toBeNull();
    expect(nextAttemptAt(MAX_DELIVERY_ATTEMPTS + 1)).toBeNull();
  });

  it('spends under three hours in total before abandoning', () => {
    let total = 0;
    for (let a = 1; a < MAX_DELIVERY_ATTEMPTS; a++) total += retryDelaySeconds(a);
    expect(total).toBeLessThan(3 * 60 * 60);
    expect(total).toBeGreaterThan(60 * 60);
  });
});

describe('the event catalogue', () => {
  it('labels every event it offers', () => {
    for (const e of WEBHOOK_EVENTS) {
      expect(WEBHOOK_EVENT_LABELS[e], e).toBeTruthy();
    }
  });

  it('is a closed list, so a new column is not a breaking change', () => {
    expect(webhookEventSchema.safeParse('patient.created').success).toBe(true);
    expect(webhookEventSchema.safeParse('anything.else').success).toBe(false);
  });
});

describe('webhook endpoints must be https', () => {
  const base = { events: ['patient.created'] as const };

  it('accepts https', () => {
    expect(
      createWebhookSchema.safeParse({ ...base, url: 'https://example.test/hook' })
        .success,
    ).toBe(true);
  });

  it('refuses http — we will not post patient data in the clear', () => {
    const r = createWebhookSchema.safeParse({
      ...base,
      url: 'http://example.test/hook',
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/https/);
  });
});

/**
 * The secret is base64url, and that alphabet contains `_` and `-`. Splitting a
 * key on `_` therefore produced four parts for roughly half of all generated
 * keys and rejected them as malformed — indistinguishable, from outside, from a
 * wrong secret. Parsed by position now, and pinned here.
 */
describe('parsing a presented key', () => {
  it('parses an ordinary key', () => {
    expect(parseApiKey('hms_a1b2c3d4_abcdef')).toEqual({
      prefix: 'hms_a1b2c3d4',
      secret: 'abcdef',
    });
  });

  it('keeps underscores that belong to the secret', () => {
    expect(parseApiKey('hms_a1b2c3d4_aa_bb_cc')).toEqual({
      prefix: 'hms_a1b2c3d4',
      secret: 'aa_bb_cc',
    });
  });

  it('keeps hyphens too — base64url has those as well', () => {
    expect(parseApiKey('hms_a1b2c3d4_aa-bb_cc-dd')?.secret).toBe('aa-bb_cc-dd');
  });

  it('accepts every secret a real generator can produce', () => {
    // The exact alphabet `randomBytes(32).toString('base64url')` draws from.
    const alphabet =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    for (const ch of alphabet) {
      const secret = `x${ch}y`;
      expect(parseApiKey(`hms_a1b2c3d4_${secret}`)?.secret, ch).toBe(secret);
    }
  });

  it('tolerates surrounding whitespace from a copy-paste', () => {
    expect(parseApiKey('  hms_a1b2c3d4_abcdef \n')?.secret).toBe('abcdef');
  });

  it('refuses anything that is not one of ours', () => {
    expect(parseApiKey('')).toBeNull();
    expect(parseApiKey('nope')).toBeNull();
    expect(parseApiKey('other_a1b2c3d4_abcdef')).toBeNull();
    expect(parseApiKey('hms_a1b2c3d4')).toBeNull();
    expect(parseApiKey('hms__abcdef')).toBeNull();
    expect(parseApiKey('hms_a1b2c3d4_')).toBeNull();
    expect(parseApiKey('_hms_x_y')).toBeNull();
  });
});
