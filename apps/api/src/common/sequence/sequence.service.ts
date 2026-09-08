import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Human-facing document numbers. Each counter lives on `Tenant` and is bumped
 * with an atomic `increment` inside a transaction, so two concurrent front-desk
 * registrations can never be handed the same number.
 */
export type SequenceKind =
  | 'mrn'
  | 'case'
  | 'opd'
  | 'receipt'
  | 'admission'
  | 'staff'
  | 'donor'
  | 'call'
  | 'birth'
  | 'death'
  | 'visitor'
  | 'complaint';

const COUNTERS = {
  mrn: { seq: 'mrnSeq', prefix: 'mrnPrefix' },
  case: { seq: 'caseSeq', prefix: 'casePrefix' },
  opd: { seq: 'opdSeq', prefix: 'opdPrefix' },
  receipt: { seq: 'receiptSeq', prefix: 'receiptPrefix' },
  admission: { seq: 'admissionSeq', prefix: 'admissionPrefix' },
  staff: { seq: 'staffSeq', prefix: 'staffPrefix' },
  donor: { seq: 'donorSeq', prefix: 'donorPrefix' },
  call: { seq: 'callSeq', prefix: 'callPrefix' },
  birth: { seq: 'birthSeq', prefix: 'birthPrefix' },
  death: { seq: 'deathSeq', prefix: 'deathPrefix' },
  visitor: { seq: 'visitorSeq', prefix: 'visitorPrefix' },
  complaint: { seq: 'complaintSeq', prefix: 'complaintPrefix' },
} as const;

const PAD_WIDTH = 6;

@Injectable()
export class SequenceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Bump and format the next number for `kind`. Must be given the transaction
   * client of the surrounding unit of work: if the caller rolls back, the number
   * is released with it.
   */
  async next(
    tx: Prisma.TransactionClient,
    tenantId: string,
    kind: SequenceKind,
  ): Promise<string> {
    const counter = COUNTERS[kind];
    const tenant = await tx.tenant.update({
      where: { id: tenantId },
      data: { [counter.seq]: { increment: 1 } } as Prisma.TenantUpdateInput,
    });
    return format(tenant[counter.prefix], tenant[counter.seq]);
  }

  /** Same, in a transaction of its own — for callers that have nothing else to do. */
  async nextStandalone(tenantId: string, kind: SequenceKind): Promise<string> {
    return this.prisma.$transaction((tx) => this.next(tx, tenantId, kind));
  }
}

function format(prefix: string, seq: number): string {
  return `${prefix}-${String(seq).padStart(PAD_WIDTH, '0')}`;
}
