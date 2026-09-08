import { describe, expect, it, vi } from 'vitest';
import { WebhookDispatcher } from './webhook.dispatcher.js';
import type { PrismaService } from '../../prisma/prisma.service.js';

/**
 * The dispatcher polls every 15 seconds. When the database is unreachable —
 * which for a serverless Postgres that suspends when idle is an ordinary
 * overnight condition, not an incident — it used to log a full stack trace on
 * every one of those ticks. An idle night produced thousands of identical
 * errors, which is how a log stops being worth reading.
 *
 * These are the two properties that fix depends on: it must stop hammering, and
 * it must stop shouting.
 */

function dispatcherWith(findMany: () => Promise<unknown>) {
  const prisma = { webhookDelivery: { findMany } } as unknown as PrismaService;
  const config = { get: () => undefined } as never;
  return new WebhookDispatcher(prisma, config);
}

function unreachable(): Error {
  const e = new Error(
    "Can't reach database server at `ep-example.aws.neon.tech:5432`",
  );
  (e as unknown as { code: string }).code = 'P1001';
  return e;
}

describe('webhook dispatch under a database outage', () => {
  it('backs off instead of querying on every tick', async () => {
    const findMany = vi.fn().mockRejectedValue(unreachable());
    const d = dispatcherWith(findMany);

    // The first tick tries and fails, and sets a one-tick wait.
    await d.tick();
    expect(findMany).toHaveBeenCalledTimes(1);

    // The next tick is skipped entirely — no query at all.
    await d.tick();
    expect(findMany).toHaveBeenCalledTimes(1);

    // Then it tries again, fails, and waits twice as long.
    await d.tick();
    expect(findMany).toHaveBeenCalledTimes(2);
    await d.tick();
    await d.tick();
    expect(findMany).toHaveBeenCalledTimes(2);

    // Over twenty ticks a caller that retried every time would have made
    // twenty attempts. Backing off makes a handful.
    for (let i = 0; i < 20; i++) await d.tick();
    expect(findMany.mock.calls.length).toBeLessThan(8);
  });

  it('logs the outage once, not once per tick', async () => {
    const d = dispatcherWith(vi.fn().mockRejectedValue(unreachable()));
    const warn = vi
      .spyOn((d as unknown as { logger: { warn: () => void } }).logger, 'warn')
      .mockImplementation(() => {});
    const error = vi
      .spyOn((d as unknown as { logger: { error: () => void } }).logger, 'error')
      .mockImplementation(() => {});

    for (let i = 0; i < 30; i++) await d.tick();

    expect(warn).toHaveBeenCalledTimes(1);
    // A transient outage is not an error-level event.
    expect(error).not.toHaveBeenCalled();
  });

  it('still reports a genuine fault in full, every time it happens', async () => {
    // A bug in our own query is not transient and must not be quietened.
    const d = dispatcherWith(vi.fn().mockRejectedValue(new Error('column does not exist')));
    const error = vi
      .spyOn((d as unknown as { logger: { error: () => void } }).logger, 'error')
      .mockImplementation(() => {});

    await d.tick();
    await d.tick(); // skipped by the backoff
    await d.tick();

    expect(error).toHaveBeenCalledTimes(2);
    expect(String(error.mock.calls[0][0])).toContain('column does not exist');
  });

  it('recovers and announces it once the database comes back', async () => {
    let fail = true;
    const d = dispatcherWith(
      vi.fn().mockImplementation(() => (fail ? Promise.reject(unreachable()) : Promise.resolve([]))),
    );
    const log = vi
      .spyOn((d as unknown as { logger: { log: () => void } }).logger, 'log')
      .mockImplementation(() => {});
    vi.spyOn(
      (d as unknown as { logger: { warn: () => void } }).logger,
      'warn',
    ).mockImplementation(() => {});

    await d.tick();
    fail = false;
    await d.tick(); // skipped
    await d.tick(); // succeeds

    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][0])).toContain('resumed');
  });
});
