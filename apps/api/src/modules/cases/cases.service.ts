import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Case } from '@prisma/client';
import type {
  Case as CaseDto,
  CaseStatus,
  OpenCaseInput,
} from '@hms/shared';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { caseDetailInclude, toCaseDto } from './cases.mapper.js';

export interface CaseListFilter {
  patientId?: string;
  status?: CaseStatus;
  q?: string;
}

const LIST_LIMIT = 200;

@Injectable()
export class CasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
  ) {}

  async open(
    tenantId: string,
    createdById: string,
    input: OpenCaseInput,
  ): Promise<CaseDto> {
    const created = await this.prisma.$transaction((tx) =>
      this.openInTx(tx, tenantId, createdById, input),
    );
    return this.get(tenantId, created.id);
  }

  async openInTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    createdById: string,
    input: OpenCaseInput,
  ): Promise<Case> {
    const patient = await tx.patient.findFirst({
      where: { id: input.patientId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!patient) throw new BadRequestException('Unknown patient');

    const caseNo = await this.sequence.next(tx, tenantId, 'case');

    return tx.case.create({
      data: {
        tenantId,
        patientId: input.patientId,
        caseNo,
        isCasualty: input.isCasualty ?? false,
        reference: input.reference ?? null,
        createdById,
      },
    });
  }

  /**
   * OPD registration attaches to a case rather than creating one per visit: an
   * explicit `caseId` is honoured, an existing open case is reused, and only a
   * patient with no open case gets a new one.
   */
  async findOrOpenInTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    createdById: string,
    input: OpenCaseInput & { caseId?: string },
  ): Promise<Case> {
    if (input.caseId) {
      const existing = await tx.case.findFirst({
        where: { id: input.caseId, tenantId },
      });
      if (!existing) throw new BadRequestException('Unknown case');
      if (existing.patientId !== input.patientId) {
        throw new BadRequestException(
          'That case belongs to a different patient',
        );
      }
      if (existing.status !== 'open') {
        throw new ConflictException('That case is no longer open');
      }
      return existing;
    }

    const open = await tx.case.findFirst({
      where: { tenantId, patientId: input.patientId, status: 'open' },
      orderBy: { openedAt: 'desc' },
    });
    if (open) return open;

    return this.openInTx(tx, tenantId, createdById, input);
  }

  async list(tenantId: string, filter: CaseListFilter): Promise<CaseDto[]> {
    const rows = await this.prisma.case.findMany({
      where: {
        tenantId,
        patientId: filter.patientId,
        status: filter.status,
        ...(filter.q
          ? {
              OR: [
                { caseNo: { contains: filter.q, mode: 'insensitive' } },
                { reference: { contains: filter.q, mode: 'insensitive' } },
                {
                  patient: {
                    OR: [
                      { mrn: { contains: filter.q, mode: 'insensitive' } },
                      { firstName: { contains: filter.q, mode: 'insensitive' } },
                      { lastName: { contains: filter.q, mode: 'insensitive' } },
                      { phone: { contains: filter.q } },
                    ],
                  },
                },
              ],
            }
          : {}),
      },
      include: caseDetailInclude,
      orderBy: { openedAt: 'desc' },
      take: LIST_LIMIT,
    });
    return rows.map(toCaseDto);
  }

  async get(tenantId: string, id: string): Promise<CaseDto> {
    const found = await this.prisma.case.findFirst({
      where: { id, tenantId },
      include: caseDetailInclude,
    });
    if (!found) throw new NotFoundException('Case not found');
    return toCaseDto(found);
  }

  async close(
    tenantId: string,
    id: string,
    reason?: string,
  ): Promise<CaseDto> {
    const existing = await this.prisma.case.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Case not found');
    if (existing.status !== 'open') {
      throw new ConflictException('Case is already closed');
    }

    await this.prisma.case.update({
      where: { id },
      data: {
        status: 'closed',
        closedAt: new Date(),
        closedReason: reason ?? null,
      },
    });
    return this.get(tenantId, id);
  }

  /** Shared guard: billing may only move money on a case that is still open. */
  /**
   * A case must be billable to take a new line. `open` always is; an inpatient
   * case sits in `moved_to_ipd` for the whole stay and must still accept the
   * bed charge at discharge, so callers can widen the set. `closed` never is.
   */
  async assertOpen(
    tx: Prisma.TransactionClient,
    tenantId: string,
    caseId: string,
    billableStatuses: readonly CaseStatus[] = ['open'],
  ): Promise<Case> {
    const found = await tx.case.findFirst({ where: { id: caseId, tenantId } });
    if (!found) throw new NotFoundException('Case not found');
    if (!billableStatuses.includes(found.status)) {
      throw new ConflictException('Case is closed');
    }
    return found;
  }
}
