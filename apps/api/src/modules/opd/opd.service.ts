import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateOpdVisitInput,
  OpdScope,
  OpdVisit as OpdVisitDto,
  OpdVisitListItem,
  OpdVisitStatus,
  UpdateOpdVisitInput,
} from '@hms/shared';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import { parseIsoDateOrNull } from '../../common/util/dates.js';
import { zonedDayRange } from '../../common/util/time-zone.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BillingService } from '../billing/billing.service.js';
import { CasesService } from '../cases/cases.service.js';
import {
  opdVisitDetailInclude,
  opdVisitListInclude,
  toOpdVisitDto,
  toOpdVisitListItem,
} from './opd.mapper.js';

export interface OpdListFilter {
  scope: OpdScope;
  practitionerId?: string;
  patientId?: string;
  caseId?: string;
  status?: OpdVisitStatus;
  q?: string;
}

/** waiting -> in_consultation -> completed, and cancellation off either live state. */
const ALLOWED_TRANSITIONS: Record<OpdVisitStatus, OpdVisitStatus[]> = {
  waiting: ['in_consultation', 'cancelled'],
  in_consultation: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

const LIST_LIMIT = 500;

@Injectable()
export class OpdService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly cases: CasesService,
    private readonly billing: BillingService,
  ) {}

  /**
   * Front-desk registration, start to finish, in one transaction: find or open
   * the case, mint the OPD number, create the visit, attach symptoms, bill the
   * consultation and take the money. If any step fails nothing is left behind —
   * no orphan case, no burnt document number, no charge without a visit.
   */
  async create(
    tenantId: string,
    createdById: string,
    input: CreateOpdVisitInput,
  ): Promise<OpdVisitDto> {
    const visitId = await this.prisma.$transaction(async (tx) => {
      const practitioner = await tx.practitioner.findFirst({
        where: { id: input.practitionerId, tenantId, isActive: true },
        select: { id: true },
      });
      if (!practitioner) throw new BadRequestException('Unknown practitioner');

      if (input.appointmentId) {
        const appointment = await tx.appointment.findFirst({
          where: { id: input.appointmentId, tenantId },
          select: { id: true, patientId: true },
        });
        if (!appointment) throw new BadRequestException('Unknown appointment');
        if (appointment.patientId !== input.patientId) {
          throw new BadRequestException(
            'That appointment belongs to a different patient',
          );
        }
      }

      const kase = await this.cases.findOrOpenInTx(tx, tenantId, createdById, {
        patientId: input.patientId,
        caseId: input.caseId,
        isCasualty: input.isCasualty,
        reference: input.reference,
      });

      const opdNo = await this.sequence.next(tx, tenantId, 'opd');

      const visit = await tx.opdVisit.create({
        data: {
          tenantId,
          caseId: kase.id,
          patientId: input.patientId,
          practitionerId: input.practitionerId,
          appointmentId: input.appointmentId ?? null,
          opdNo,
          visitAt: new Date(input.visitAt),
          isFollowUp: input.isFollowUp ?? false,
          isAntenatal: input.isAntenatal ?? false,
          isLiveConsult: input.isLiveConsult ?? false,
          reference: input.reference ?? null,
          note: input.note ?? null,
          previousMedicalIssue: input.previousMedicalIssue ?? null,
          knownAllergies: input.knownAllergies ?? null,
          createdById,
        },
      });

      if (input.symptoms?.length) {
        await this.replaceSymptoms(tx, tenantId, visit.id, input.symptoms);
      }

      if (input.charge) {
        await this.billing.addChargeItemInTx(tx, tenantId, createdById, {
          caseId: kase.id,
          opdVisitId: visit.id,
          chargeId: input.charge.chargeId,
          appliedChargeMinor: input.charge.appliedChargeMinor,
          quantity: input.charge.quantity,
          discountBps: input.charge.discountBps,
          discountMinor: input.charge.discountMinor,
          taxBps: input.charge.taxBps,
        });
      }

      if (input.payment) {
        await this.billing.createPaymentInTx(tx, tenantId, createdById, {
          caseId: kase.id,
          amountMinor: input.payment.amountMinor,
          mode: input.payment.mode,
          note: input.payment.note,
          chequeNo: input.payment.chequeNo,
          chequeDate: input.payment.chequeDate,
        });
      }

      return visit.id;
    });

    return this.get(tenantId, visitId);
  }

  async list(
    tenantId: string,
    filter: OpdListFilter,
  ): Promise<OpdVisitListItem[]> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const rows = await this.prisma.opdVisit.findMany({
      where: {
        tenantId,
        practitionerId: filter.practitionerId,
        patientId: filter.patientId,
        caseId: filter.caseId,
        status: filter.status,
        ...scopeFilter(filter.scope, tenant.timezone),
        ...(filter.q
          ? {
              OR: [
                { opdNo: { contains: filter.q, mode: 'insensitive' } },
                { case: { caseNo: { contains: filter.q, mode: 'insensitive' } } },
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
      include: opdVisitListInclude,
      orderBy: { visitAt: filter.scope === 'upcoming' ? 'asc' : 'desc' },
      take: LIST_LIMIT,
    });
    return rows.map(toOpdVisitListItem);
  }

  async get(tenantId: string, id: string): Promise<OpdVisitDto> {
    const found = await this.prisma.opdVisit.findFirst({
      where: { id, tenantId },
      include: opdVisitDetailInclude,
    });
    if (!found) throw new NotFoundException('OPD visit not found');
    return toOpdVisitDto(found);
  }

  /**
   * The consultation record. Symptoms, findings and diagnoses are replaced
   * wholesale when supplied — the doctor edits the list as a whole, so a partial
   * merge would silently resurrect entries they removed. Omitting a key leaves
   * that list untouched.
   */
  async update(
    tenantId: string,
    id: string,
    input: UpdateOpdVisitInput,
  ): Promise<OpdVisitDto> {
    const existing = await this.prisma.opdVisit.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('OPD visit not found');
    if (existing.status === 'cancelled') {
      throw new ConflictException('This visit was cancelled');
    }

    await this.prisma.$transaction(async (tx) => {
      if (input.practitionerId) {
        const practitioner = await tx.practitioner.findFirst({
          where: { id: input.practitionerId, tenantId, isActive: true },
          select: { id: true },
        });
        if (!practitioner) throw new BadRequestException('Unknown practitioner');
      }

      await tx.opdVisit.update({
        where: { id },
        data: {
          practitionerId: input.practitionerId,
          note: input.note,
          previousMedicalIssue: input.previousMedicalIssue,
          knownAllergies: input.knownAllergies,
        },
      });

      if (input.symptoms !== undefined) {
        await tx.visitSymptom.deleteMany({ where: { opdVisitId: id } });
        await this.replaceSymptoms(tx, tenantId, id, input.symptoms);
      }
      if (input.findings !== undefined) {
        await tx.visitFinding.deleteMany({ where: { opdVisitId: id } });
        await this.replaceFindings(tx, tenantId, id, input.findings);
      }
      if (input.diagnoses !== undefined) {
        await tx.visitDiagnosis.deleteMany({ where: { opdVisitId: id } });
        await this.replaceDiagnoses(tx, tenantId, id, input.diagnoses);
      }
    });

    return this.get(tenantId, id);
  }

  async setStatus(
    tenantId: string,
    id: string,
    status: OpdVisitStatus,
    reason?: string,
  ): Promise<OpdVisitDto> {
    const existing = await this.prisma.opdVisit.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('OPD visit not found');

    if (!ALLOWED_TRANSITIONS[existing.status].includes(status)) {
      throw new ConflictException(
        `Cannot move a ${existing.status} visit to ${status}`,
      );
    }

    await this.prisma.opdVisit.update({
      where: { id },
      data: {
        status,
        ...(status === 'cancelled' ? { cancelReason: reason ?? null } : {}),
      },
    });
    return this.get(tenantId, id);
  }

  // --- sub-record writers --------------------------------------------------

  private async replaceSymptoms(
    tx: Prisma.TransactionClient,
    tenantId: string,
    opdVisitId: string,
    symptoms: { symptomId?: string; title: string; detail?: string }[],
  ): Promise<void> {
    if (symptoms.length === 0) return;
    await this.assertVocabularyIds(
      tx,
      tenantId,
      'symptom',
      symptoms.map((s) => s.symptomId),
    );
    await tx.visitSymptom.createMany({
      data: symptoms.map((s) => ({
        tenantId,
        opdVisitId,
        symptomId: s.symptomId ?? null,
        title: s.title,
        detail: s.detail ?? null,
      })),
    });
  }

  private async replaceFindings(
    tx: Prisma.TransactionClient,
    tenantId: string,
    opdVisitId: string,
    findings: { findingId?: string; title: string; detail?: string }[],
  ): Promise<void> {
    if (findings.length === 0) return;
    await this.assertVocabularyIds(
      tx,
      tenantId,
      'finding',
      findings.map((f) => f.findingId),
    );
    await tx.visitFinding.createMany({
      data: findings.map((f) => ({
        tenantId,
        opdVisitId,
        findingId: f.findingId ?? null,
        title: f.title,
        detail: f.detail ?? null,
      })),
    });
  }

  private async replaceDiagnoses(
    tx: Prisma.TransactionClient,
    tenantId: string,
    opdVisitId: string,
    diagnoses: { icd10CodeId: string; isPrimary?: boolean; note?: string }[],
  ): Promise<void> {
    if (diagnoses.length === 0) return;

    // (opdVisitId, icd10CodeId) is unique; the last mention of a code wins.
    const byCode = new Map(diagnoses.map((d) => [d.icd10CodeId, d]));
    const codeIds = [...byCode.keys()];

    // ICD-10 is global reference data — deliberately not filtered by tenant.
    const known = await tx.icd10Code.count({ where: { id: { in: codeIds } } });
    if (known !== codeIds.length) {
      throw new BadRequestException('Unknown ICD-10 code');
    }

    await tx.visitDiagnosis.createMany({
      data: [...byCode.values()].map((d) => ({
        tenantId,
        opdVisitId,
        icd10CodeId: d.icd10CodeId,
        isPrimary: d.isPrimary ?? false,
        note: d.note ?? null,
      })),
    });
  }

  /** Free-text entries carry no id; the ones that do must belong to this tenant. */
  private async assertVocabularyIds(
    tx: Prisma.TransactionClient,
    tenantId: string,
    kind: 'symptom' | 'finding',
    ids: (string | undefined)[],
  ): Promise<void> {
    const wanted = [...new Set(ids.filter((id): id is string => !!id))];
    if (wanted.length === 0) return;

    const found =
      kind === 'symptom'
        ? await tx.symptom.count({ where: { tenantId, id: { in: wanted } } })
        : await tx.finding.count({ where: { tenantId, id: { in: wanted } } });

    if (found !== wanted.length) {
      throw new BadRequestException(
        kind === 'symptom' ? 'Unknown symptom' : 'Unknown finding',
      );
    }
  }
}

/** Today / Upcoming / Old, bounded by the hospital's own calendar day. */
function scopeFilter(
  scope: OpdScope,
  timeZone: string,
): Prisma.OpdVisitWhereInput {
  if (scope === 'all') return {};
  const { start, end } = zonedDayRange(timeZone);
  if (scope === 'today') return { visitAt: { gte: start, lt: end } };
  if (scope === 'upcoming') return { visitAt: { gte: end } };
  return { visitAt: { lt: start } };
}

// Kept alongside the service so a caller can normalise a cheque date the same
// way registration does.
export const parseChequeDate = parseIsoDateOrNull;
