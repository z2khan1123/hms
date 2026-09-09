import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { startConsultationIfWaiting } from './start-consultation.js';

/**
 * A doctor recorded a history, a diagnosis, an X-ray order and a prescription,
 * and the visit still said `waiting` — so the queue showed the patient as
 * waiting to be seen while he was being seen. These are the two properties the
 * fix rests on.
 */

function fakeTx() {
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  return {
    tx: { opdVisit: { updateMany } } as unknown as Prisma.TransactionClient,
    updateMany,
  };
}

describe('starting a consultation', () => {
  it('only ever moves a visit that is still waiting', async () => {
    // The status is part of the WHERE, not read first and written after. That
    // is what makes it atomic: two writes landing together cannot both move it,
    // and it is a no-op against a completed or cancelled visit rather than
    // resurrecting one.
    const { tx, updateMany } = fakeTx();
    await startConsultationIfWaiting(tx, 'tenant-1', 'visit-1');

    expect(updateMany).toHaveBeenCalledTimes(1);
    const arg = updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({
      id: 'visit-1',
      tenantId: 'tenant-1',
      status: 'waiting',
    });
    expect(arg.data).toEqual({ status: 'in_consultation' });
  });

  it('stays inside the caller tenant', async () => {
    // It runs inside somebody else's transaction, so it cannot rely on the
    // Row-Level Security wrapper having scoped anything for it.
    const { tx, updateMany } = fakeTx();
    await startConsultationIfWaiting(tx, 'tenant-A', 'visit-9');
    expect(updateMany.mock.calls[0][0].where.tenantId).toBe('tenant-A');
  });

  it('never marks a visit completed', async () => {
    // Finishing is a judgement the doctor makes — he may be waiting on a
    // report. This helper must never make it for him.
    const { tx, updateMany } = fakeTx();
    await startConsultationIfWaiting(tx, 't', 'v');
    expect(JSON.stringify(updateMany.mock.calls[0][0])).not.toContain('completed');
  });
});
