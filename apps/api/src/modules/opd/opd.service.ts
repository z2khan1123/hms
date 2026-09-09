import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type BillItem } from '@prisma/client';
import type {
  CreateOpdVisitInput,
  OpdScope,
  OpdVisit as OpdVisitDto,
  OpdVisitListItem,
  OpdVisitStatus,
  UpdateOpdVisitInput,
} from '@hms/shared';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import { zonedDayRange } from '../../common/util/time-zone.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { startConsultationIfWaiting } from './start-consultation.js';
import { BillingService } from '../billing/billing.service.js';
import { CasesService } from '../cases/cases.service.js';
import {
  EMPTY_STAGE_COUNTS,
  opdVisitDetailInclude,
  opdVisitListInclude,
  toOpdVisitDto,
  toOpdVisitListItem,
  type VisitStageCounts,
} from './opd.mapper.js';

export interface OpdListFilter {
  scope: OpdScope;
  practitionerId?: string;
  patientId?: string;
  caseId?: string;
  status?: OpdVisitStatus;
  q?: string;
}

/**
 * registered -> waiting (fee settled) -> in_consultation -> completed, and
 * cancellation off any live state. The registered -> waiting hop also happens
 * automatically when a payment settles the consultation line.
 */
const ALLOWED_TRANSITIONS: Record<OpdVisitStatus, OpdVisitStatus[]> = {
  registered: ['waiting', 'cancelled'],
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
        select: { id: true, consultationFeeMinor: true },
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
          // The desk registers the patient; the fee is not settled yet. A payment
          // that covers the consultation line flips this to `waiting`.
          status: 'registered',
          createdById,
        },
      });

      if (input.symptoms?.length) {
        await this.replaceSymptoms(tx, tenantId, visit.id, input.symptoms);
      }

      let consultationItem: BillItem | undefined;
      if (input.item) {
        // The fee comes from the doctor. An OMITTED price means "charge his
        // fee"; an explicit 0 means a deliberately free consultation and must
        // survive — which is why the contract makes priceMinor optional rather
        // than defaulting it to 0.
        const priceMinor =
          input.item.priceMinor ?? practitioner.consultationFeeMinor ?? 0;
        consultationItem = await this.billing.addBillItemInTx(
          tx,
          tenantId,
          createdById,
          {
            caseId: kase.id,
            opdVisitId: visit.id,
            serviceId: input.item.serviceId,
            serviceName: input.item.serviceName,
            priceMinor,
            quantity: input.item.quantity,
            discountBps: input.item.discountBps,
            discountMinor: input.item.discountMinor,
            discountReason: input.item.discountReason ?? null,
          },
        );
      }

      if (input.payment) {
        // When the money taken at the desk exactly settles the consultation line,
        // allocate it to that line so the visit advances to `waiting`.
        const billItemIds =
          consultationItem &&
          input.payment.amountMinor === consultationItem.netMinor
            ? [consultationItem.id]
            : undefined;
        await this.billing.createPaymentInTx(tx, tenantId, createdById, {
          caseId: kase.id,
          billItemIds,
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
    const counts = await this.loadStageCounts(
      tenantId,
      rows.map((r) => ({ id: r.id, caseId: r.caseId })),
    );
    return rows.map((v) =>
      toOpdVisitListItem(v, counts.get(v.id) ?? EMPTY_STAGE_COUNTS),
    );
  }

  async get(tenantId: string, id: string): Promise<OpdVisitDto> {
    const found = await this.prisma.opdVisit.findFirst({
      where: { id, tenantId },
      include: opdVisitDetailInclude,
    });
    if (!found) throw new NotFoundException('OPD visit not found');
    const counts = await this.loadStageCounts(tenantId, [
      { id: found.id, caseId: found.caseId },
    ]);
    return toOpdVisitDto(found, counts.get(found.id) ?? EMPTY_STAGE_COUNTS);
  }

  /**
   * The counts `computeVisitStage` needs, resolved with two grouped queries for
   * the whole page rather than per row: pending (unreleased) bill lines per
   * case, and `ordered` / `in_progress` service orders per visit.
   */
  private async loadStageCounts(
    tenantId: string,
    visits: { id: string; caseId: string }[],
  ): Promise<Map<string, VisitStageCounts>> {
    const result = new Map<string, VisitStageCounts>();
    if (visits.length === 0) return result;

    const visitIds = visits.map((v) => v.id);
    const caseIds = [...new Set(visits.map((v) => v.caseId))];

    const [pendingByCase, ordersByVisit] = await Promise.all([
      this.prisma.billItem.groupBy({
        by: ['caseId'],
        where: {
          tenantId,
          caseId: { in: caseIds },
          status: 'pending',
          approvedWithoutPayment: false,
        },
        _count: { _all: true },
      }),
      this.prisma.serviceOrder.groupBy({
        by: ['opdVisitId', 'status'],
        where: {
          tenantId,
          opdVisitId: { in: visitIds },
          status: { in: ['ordered', 'sample_collected', 'in_progress'] },
        },
        _count: { _all: true },
      }),
    ]);

    const unpaidByCase = new Map(
      pendingByCase.map((r) => [r.caseId, r._count._all]),
    );
    const orderedByVisit = new Map<string, number>();
    const inProgressByVisit = new Map<string, number>();
    for (const r of ordersByVisit) {
      if (!r.opdVisitId) continue;
      if (r.status === 'ordered') {
        orderedByVisit.set(r.opdVisitId, r._count._all);
      } else {
        // sample_collected and in_progress are both "the department has it".
        // Lumping them together is what stops a drawn-but-unprocessed sample
        // reading as a finished visit.
        inProgressByVisit.set(
          r.opdVisitId,
          (inProgressByVisit.get(r.opdVisitId) ?? 0) + r._count._all,
        );
      }
    }

    for (const v of visits) {
      result.set(v.id, {
        unpaidItemCount: unpaidByCase.get(v.caseId) ?? 0,
        orderedCount: orderedByVisit.get(v.id) ?? 0,
        inProgressCount: inProgressByVisit.get(v.id) ?? 0,
      });
    }
    return result;
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

      // Recording any of this means the doctor has the patient in front of
      // him. Reassigning the visit to a different practitioner does not — that
      // is the desk correcting the booking, not a consultation starting.
      const isClinical =
        input.note !== undefined ||
        input.previousMedicalIssue !== undefined ||
        input.knownAllergies !== undefined ||
        input.symptoms !== undefined ||
        input.findings !== undefined ||
        input.diagnoses !== undefined;
      if (isClinical) await startConsultationIfWaiting(tx, tenantId, id);
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
