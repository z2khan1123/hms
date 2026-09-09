import type { Prisma } from '@prisma/client';

/**
 * Move a visit into `in_consultation` the moment a doctor does clinical work
 * on it.
 *
 * Nothing drove this hop before. A doctor could take the history, record a
 * diagnosis, order an X-ray and write a prescription, and the visit still read
 * `waiting` — so the queue went on showing the patient as waiting to be seen
 * while he was being seen, and the front desk had no way to tell the difference
 * between a full waiting room and an empty one.
 *
 * Making it a side effect of the clinical write rather than a button is
 * deliberate: a doctor should not have to tell the software he has started, and
 * a step he must remember is a step that gets skipped on a busy morning.
 *
 * The reverse hop is NOT automatic. Finishing is a judgement — the doctor may
 * be waiting on a report before he is done — so `completed` stays an explicit
 * act through `setStatus`.
 *
 * Written as `updateMany` filtered on the current status so it is atomic and a
 * no-op from any other state: two writes arriving together cannot both move it,
 * and a completed or cancelled visit is never resurrected by a late edit.
 */
export async function startConsultationIfWaiting(
  tx: Prisma.TransactionClient,
  tenantId: string,
  opdVisitId: string,
): Promise<void> {
  await tx.opdVisit.updateMany({
    where: { id: opdVisitId, tenantId, status: 'waiting' },
    data: { status: 'in_consultation' },
  });
}
