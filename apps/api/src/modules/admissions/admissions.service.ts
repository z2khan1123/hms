import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AdmissionStatus } from '@prisma/client';
import type {
  Admission as AdmissionDto,
  AdmissionListItem,
  AdmitPatientInput,
  CreateNurseNoteInput,
  DischargeInput,
  NurseNote,
  TransferBedInput,
} from '@hms/shared';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BillingService } from '../billing/billing.service.js';
import { CasesService } from '../cases/cases.service.js';
import {
  admissionDetailInclude,
  admissionListInclude,
  toAdmissionDto,
  toAdmissionListItem,
} from './admissions.mapper.js';

export interface AdmissionListFilter {
  status?: AdmissionStatus;
  practitionerId?: string;
  patientId?: string;
  wardId?: string;
  q?: string;
}

const LIST_LIMIT = 500;

@Injectable()
export class AdmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly cases: CasesService,
    private readonly billing: BillingService,
  ) {}

  /**
   * Admit a patient in one transaction: validate patient / practitioner / bed
   * against the tenant, reject an unavailable bed, find-or-open the case, mint
   * the admission number, and open the first bed assignment. Nothing is left
   * behind if any step fails.
   */
  async admit(
    tenantId: string,
    userId: string,
    input: AdmitPatientInput,
  ): Promise<AdmissionDto> {
    const admissionId = await this.prisma.$transaction(async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: input.patientId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!patient) throw new BadRequestException('Unknown patient');

      const practitioner = await tx.practitioner.findFirst({
        where: { id: input.practitionerId, tenantId, isActive: true },
        select: { id: true },
      });
      if (!practitioner) throw new BadRequestException('Unknown practitioner');

      const bed = await tx.bed.findFirst({
        where: { id: input.bedId, tenantId },
        include: { assignments: { where: { toAt: null }, select: { id: true } } },
      });
      if (!bed) throw new BadRequestException('Unknown bed');
      this.assertBedFree(bed);

      const kase = await this.cases.findOrOpenInTx(tx, tenantId, userId, {
        patientId: input.patientId,
        caseId: input.caseId,
      });

      if (input.fromOpdVisitId) {
        const visit = await tx.opdVisit.findFirst({
          where: { id: input.fromOpdVisitId, tenantId },
          select: { patientId: true },
        });
        if (!visit) throw new BadRequestException('Unknown OPD visit');
        if (visit.patientId !== input.patientId) {
          throw new BadRequestException(
            'That OPD visit belongs to a different patient',
          );
        }
        const alreadyLinked = await tx.admission.findFirst({
          where: { tenantId, fromOpdVisitId: input.fromOpdVisitId },
          select: { id: true },
        });
        if (alreadyLinked) {
          throw new ConflictException(
            'That OPD visit already has an admission',
          );
        }
      }

      const admittedAt = input.admittedAt ? new Date(input.admittedAt) : new Date();

      // Atomic per-tenant counter, same as MRN / case / OPD / receipt numbers.
      // Counting existing rows instead would let two concurrent admissions
      // compute the same number and collide on the unique constraint.
      const admissionNo = await this.sequence.next(tx, tenantId, 'admission');

      const admission = await tx.admission.create({
        data: {
          tenantId,
          caseId: kase.id,
          patientId: input.patientId,
          admissionNo,
          fromOpdVisitId: input.fromOpdVisitId ?? null,
          practitionerId: input.practitionerId,
          status: 'admitted',
          admittedAt,
          provisionalDiagnosis: input.provisionalDiagnosis ?? null,
          admissionNote: input.admissionNote ?? null,
          admittedById: userId,
        },
      });

      await tx.bedAssignment.create({
        data: {
          tenantId,
          admissionId: admission.id,
          bedId: bed.id,
          fromAt: admittedAt,
          assignedById: userId,
        },
      });

      if (input.fromOpdVisitId) {
        await tx.case.update({
          where: { id: kase.id },
          data: { status: 'moved_to_ipd' },
        });
      }

      return admission.id;
    });

    return this.get(tenantId, admissionId);
  }

  async list(
    tenantId: string,
    filter: AdmissionListFilter,
  ): Promise<AdmissionListItem[]> {
    const rows = await this.prisma.admission.findMany({
      where: {
        tenantId,
        status: filter.status,
        practitionerId: filter.practitionerId,
        patientId: filter.patientId,
        ...(filter.wardId
          ? {
              bedAssignments: {
                some: { toAt: null, bed: { wardId: filter.wardId } },
              },
            }
          : {}),
        ...(filter.q
          ? {
              OR: [
                { admissionNo: { contains: filter.q, mode: 'insensitive' } },
                {
                  case: {
                    caseNo: { contains: filter.q, mode: 'insensitive' },
                  },
                },
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
      include: admissionListInclude,
      orderBy: { admittedAt: 'desc' },
      take: LIST_LIMIT,
    });
    return rows.map(toAdmissionListItem);
  }

  async get(tenantId: string, id: string): Promise<AdmissionDto> {
    const found = await this.prisma.admission.findFirst({
      where: { id, tenantId },
      include: admissionDetailInclude,
    });
    if (!found) throw new NotFoundException('Admission not found');
    return toAdmissionDto(found);
  }

  /**
   * Move the patient to another bed: close the current assignment at `movedAt`,
   * open a new one on the destination. The destination gets the same
   * occupied / blocked / inactive checks as an admission.
   */
  async transfer(
    tenantId: string,
    userId: string,
    id: string,
    input: TransferBedInput,
  ): Promise<AdmissionDto> {
    await this.prisma.$transaction(async (tx) => {
      const admission = await tx.admission.findFirst({
        where: { id, tenantId },
        select: { id: true, status: true },
      });
      if (!admission) throw new NotFoundException('Admission not found');
      if (admission.status !== 'admitted') {
        throw new ConflictException('Only an admitted patient can be transferred');
      }

      const bed = await tx.bed.findFirst({
        where: { id: input.bedId, tenantId },
        include: { assignments: { where: { toAt: null }, select: { id: true } } },
      });
      if (!bed) throw new BadRequestException('Unknown bed');
      this.assertBedFree(bed);

      const movedAt = input.movedAt ? new Date(input.movedAt) : new Date();

      const current = await tx.bedAssignment.findFirst({
        where: { tenantId, admissionId: id, toAt: null },
      });
      if (current) {
        if (current.bedId === bed.id) {
          throw new ConflictException('The patient is already in that bed');
        }
        await tx.bedAssignment.update({
          where: { id: current.id },
          data: { toAt: movedAt },
        });
      }

      await tx.bedAssignment.create({
        data: {
          tenantId,
          admissionId: id,
          bedId: bed.id,
          fromAt: movedAt,
          moveReason: input.reason ?? null,
          assignedById: userId,
        },
      });
    });

    return this.get(tenantId, id);
  }

  /**
   * Discharge: set the status and discharge fields, close the open bed
   * assignment, and — only when a `bedCharge` is confirmed here — post one
   * `BillItem` on the admission's case. Bed charges are never posted per night
   * automatically.
   */
  async discharge(
    tenantId: string,
    userId: string,
    id: string,
    input: DischargeInput,
  ): Promise<AdmissionDto> {
    await this.prisma.$transaction(async (tx) => {
      const admission = await tx.admission.findFirst({
        where: { id, tenantId },
        select: { id: true, status: true, caseId: true },
      });
      if (!admission) throw new NotFoundException('Admission not found');
      if (admission.status !== 'admitted') {
        throw new ConflictException('Only an admitted patient can be discharged');
      }

      const dischargedAt = input.dischargedAt
        ? new Date(input.dischargedAt)
        : new Date();

      const currentBed = await tx.bedAssignment.findFirst({
        where: { tenantId, admissionId: id },
        orderBy: { fromAt: 'desc' },
        include: { bed: { include: { bedType: true } } },
      });
      if (currentBed && currentBed.toAt === null) {
        await tx.bedAssignment.update({
          where: { id: currentBed.id },
          data: { toAt: dischargedAt },
        });
      }

      await tx.admission.update({
        where: { id },
        data: {
          status: 'discharged',
          dischargedAt,
          dischargeSummary: input.dischargeSummary ?? null,
          dischargeAdvice: input.dischargeAdvice ?? null,
          dischargedById: userId,
        },
      });

      if (input.bedCharge) {
        const bc = input.bedCharge;
        const serviceName =
          bc.serviceName ??
          (bc.serviceId ? undefined : currentBed?.bed.bedType.name) ??
          'Bed charge';
        await this.billing.addBillItemInTx(tx, tenantId, userId, {
          caseId: admission.caseId,
          serviceId: bc.serviceId,
          serviceName,
          priceMinor: bc.priceMinor,
          quantity: bc.nights,
          discountBps: bc.discountBps,
          discountMinor: bc.discountMinor,
          discountReason: bc.discountReason ?? null,
          // An inpatient case sits in moved_to_ipd for the whole stay and must
          // still accept the bed charge at discharge.
          billableStatuses: ['open', 'moved_to_ipd'],
        });
      }
    });

    return this.get(tenantId, id);
  }

  /**
   * Undo a discharge. History is kept — the discharge fields stay put, a
   * `revertedAt` + reason is recorded. The patient goes back on the last bed
   * only if it is still free; otherwise the caller is told to transfer them.
   */
  async revertDischarge(
    tenantId: string,
    userId: string,
    id: string,
    reason: string,
  ): Promise<AdmissionDto> {
    await this.prisma.$transaction(async (tx) => {
      const admission = await tx.admission.findFirst({
        where: { id, tenantId },
        select: { id: true, status: true },
      });
      if (!admission) throw new NotFoundException('Admission not found');
      if (admission.status !== 'discharged') {
        throw new ConflictException(
          'Only a discharged admission can be reverted',
        );
      }

      const lastBed = await tx.bedAssignment.findFirst({
        where: { tenantId, admissionId: id },
        orderBy: { fromAt: 'desc' },
        include: {
          bed: {
            include: {
              assignments: { where: { toAt: null }, select: { id: true } },
            },
          },
        },
      });

      if (lastBed) {
        const bed = lastBed.bed;
        const free =
          bed.isActive && !bed.isBlocked && bed.assignments.length === 0;
        if (!free) {
          throw new ConflictException(
            'The previous bed is no longer free — transfer the patient to an available bed instead',
          );
        }
      }

      await tx.admission.update({
        where: { id },
        data: {
          status: 'admitted',
          dischargedAt: null,
          revertedAt: new Date(),
          revertReason: reason,
        },
      });

      if (lastBed) {
        await tx.bedAssignment.create({
          data: {
            tenantId,
            admissionId: id,
            bedId: lastBed.bedId,
            fromAt: new Date(),
            moveReason: 'Re-opened after discharge was reverted',
            assignedById: userId,
          },
        });
      }
    });

    return this.get(tenantId, id);
  }

  // --- nurse notes ---------------------------------------------------

  async listNurseNotes(
    tenantId: string,
    admissionId: string,
  ): Promise<NurseNote[]> {
    await this.assertAdmission(tenantId, admissionId);
    const rows = await this.prisma.nurseNote.findMany({
      where: { tenantId, admissionId },
      orderBy: { recordedAt: 'desc' },
    });
    const names = await this.authorNames(rows.map((r) => r.recordedById));
    return rows.map((r) => ({
      id: r.id,
      note: r.note,
      recordedAt: r.recordedAt.toISOString(),
      recordedBy: r.recordedById ? names.get(r.recordedById) ?? null : null,
    }));
  }

  async addNurseNote(
    tenantId: string,
    userId: string,
    admissionId: string,
    input: CreateNurseNoteInput,
  ): Promise<NurseNote> {
    await this.assertAdmission(tenantId, admissionId);
    const created = await this.prisma.nurseNote.create({
      data: {
        tenantId,
        admissionId,
        note: input.note,
        recordedAt: input.recordedAt ? new Date(input.recordedAt) : new Date(),
        recordedById: userId,
      },
    });
    const names = await this.authorNames([userId]);
    return {
      id: created.id,
      note: created.note,
      recordedAt: created.recordedAt.toISOString(),
      recordedBy: names.get(userId) ?? null,
    };
  }

  // --- helpers ---------------------------------------------------

  private assertBedFree(bed: {
    isActive: boolean;
    isBlocked: boolean;
    assignments: { id: string }[];
  }): void {
    if (!bed.isActive) throw new ConflictException('That bed is inactive');
    if (bed.isBlocked) throw new ConflictException('That bed is blocked');
    if (bed.assignments.length > 0) {
      throw new ConflictException('That bed is already occupied');
    }
  }

  private async assertAdmission(
    tenantId: string,
    id: string,
  ): Promise<void> {
    const found = await this.prisma.admission.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Admission not found');
  }

  private async authorNames(
    ids: (string | null)[],
  ): Promise<Map<string, string>> {
    const wanted = [...new Set(ids.filter((x): x is string => !!x))];
    if (wanted.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: wanted } },
      select: { id: true, firstName: true, lastName: true },
    });
    return new Map(
      users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]),
    );
  }
}
