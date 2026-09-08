import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpdVisitStatus, Prisma } from '@prisma/client';
import {
  type CreatePatientAllergyInput,
  type CreatePatientInput,
  type Paginated,
  type Patient as PatientDto,
  type PatientAllergy as PatientAllergyDto,
  type PatientHistoryAlert,
  type UpdatePatientInput,
} from '@hms/shared';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import {
  parseIsoDate,
  toIsoDateTimeOrNull,
} from '../../common/util/dates.js';
import { hashNationalId } from '../../common/util/national-id.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  patientDetailInclude,
  toPatientAllergyDto,
  toPatientDto,
} from './patients.mapper.js';

interface ListOptions {
  page: number;
  pageSize: number;
  q?: string;
}

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly sequence: SequenceService,
  ) {}

  async create(
    tenantId: string,
    input: CreatePatientInput,
  ): Promise<PatientDto> {
    const nid = input.nationalId ? this.hashNationalId(input.nationalId) : null;

    const patient = await this.prisma.$transaction(async (tx) => {
      const mrn = await this.sequence.next(tx, tenantId, 'mrn');
      return tx.patient.create({
        data: {
          tenantId,
          mrn,
          firstName: input.firstName,
          lastName: input.lastName,
          guardianName: input.guardianName ?? null,
          gender: input.gender,
          birthDate: parseIsoDate(input.birthDate),
          maritalStatus: input.maritalStatus ?? null,
          bloodType: input.bloodType ?? null,

          phone: input.phone,
          alternatePhone: input.alternatePhone ?? null,
          email: input.email ?? null,

          nationalIdHash: nid?.hash ?? null,
          nationalIdLast4: nid?.last4 ?? null,

          photoUrl: input.photoUrl ?? null,
          remarks: input.remarks ?? null,

          // knownAllergies is not accepted at registration (a front desk cannot
          // know clinical facts) — left null here and filled in later via update().

          ...(input.address
            ? { address: input.address as Prisma.InputJsonValue }
            : {}),
        },
        include: patientDetailInclude,
      });
    });

    return toPatientDto(patient);
  }

  async list(
    tenantId: string,
    opts: ListOptions,
  ): Promise<Paginated<PatientDto>> {
    const where: Prisma.PatientWhereInput = {
      tenantId,
      deletedAt: null,
      ...(opts.q
        ? {
            OR: [
              { firstName: { contains: opts.q, mode: 'insensitive' } },
              { lastName: { contains: opts.q, mode: 'insensitive' } },
              { mrn: { contains: opts.q, mode: 'insensitive' } },
              { phone: { contains: opts.q } },
              // CNIC is only ever stored hashed; the last 4 are what a desk can search on.
              { nationalIdLast4: { contains: opts.q } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.patient.findMany({
        where,
        include: patientDetailInclude,
        orderBy: { createdAt: 'desc' },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
      }),
      this.prisma.patient.count({ where }),
    ]);

    return {
      data: rows.map(toPatientDto),
      page: opts.page,
      pageSize: opts.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / opts.pageSize)),
    };
  }

  async get(tenantId: string, id: string): Promise<PatientDto> {
    const patient = await this.prisma.patient.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: patientDetailInclude,
    });
    if (!patient) throw new NotFoundException('Patient not found');
    return toPatientDto(patient);
  }

  /**
   * The banner a doctor is shown when a returning patient reaches him: the
   * running allergy note plus a summary of prior OPD visits, diagnoses and
   * admissions. `hasHistory` is false for a genuinely new patient so the client
   * can render nothing.
   */
  async historyAlert(
    tenantId: string,
    id: string,
  ): Promise<PatientHistoryAlert> {
    // A visit is "history" once it is finished — completed or cancelled — as
    // opposed to the one the patient is here for now.
    const historyStatuses: OpdVisitStatus[] = [
      OpdVisitStatus.completed,
      OpdVisitStatus.cancelled,
    ];
    const visitWhere: Prisma.OpdVisitWhereInput = {
      tenantId,
      patientId: id,
      status: { in: historyStatuses },
    };

    const [patient, previousVisitCount, lastVisit, diagnoses, previousAdmissionCount] =
      await this.prisma.$transaction([
        this.prisma.patient.findFirst({
          where: { id, tenantId, deletedAt: null },
          select: { knownAllergies: true, updatedAt: true },
        }),
        this.prisma.opdVisit.count({ where: visitWhere }),
        this.prisma.opdVisit.findFirst({
          where: visitWhere,
          orderBy: { visitAt: 'desc' },
          select: {
            visitAt: true,
            practitioner: { select: { firstName: true, lastName: true } },
          },
        }),
        this.prisma.visitDiagnosis.findMany({
          where: { tenantId, opdVisit: { patientId: id } },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            createdAt: true,
            icd10Code: { select: { code: true, title: true } },
          },
        }),
        this.prisma.admission.count({ where: { tenantId, patientId: id } }),
      ]);

    if (!patient) throw new NotFoundException('Patient not found');

    const knownAllergies = patient.knownAllergies;
    const hasHistory =
      (knownAllergies?.trim().length ?? 0) > 0 ||
      previousVisitCount > 0 ||
      previousAdmissionCount > 0;

    return {
      hasHistory,
      knownAllergies,
      // Best available proxy: the patient row has no per-column change stamp, so
      // this is the row's `updatedAt`, not specifically when the note last moved.
      allergiesUpdatedAt: patient.updatedAt.toISOString(),
      previousVisitCount,
      lastVisitAt: toIsoDateTimeOrNull(lastVisit?.visitAt),
      lastVisitPractitioner: lastVisit
        ? `${lastVisit.practitioner.firstName} ${lastVisit.practitioner.lastName}`
        : null,
      recentDiagnoses: diagnoses.map((d) => ({
        code: d.icd10Code.code,
        title: d.icd10Code.title,
        recordedAt: d.createdAt.toISOString(),
      })),
      previousAdmissionCount,
    };
  }

  async update(
    tenantId: string,
    id: string,
    input: UpdatePatientInput,
  ): Promise<PatientDto> {
    await this.get(tenantId, id);
    const nid = input.nationalId
      ? this.hashNationalId(input.nationalId)
      : undefined;

    const patient = await this.prisma.patient.update({
      where: { id },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        guardianName: input.guardianName,
        gender: input.gender,
        birthDate: input.birthDate ? parseIsoDate(input.birthDate) : undefined,
        maritalStatus: input.maritalStatus,
        bloodType: input.bloodType,

        phone: input.phone,
        alternatePhone: input.alternatePhone,
        email: input.email,

        photoUrl: input.photoUrl,
        knownAllergies: input.knownAllergies,
        remarks: input.remarks,

        status: input.status,
        ...(input.address !== undefined
          ? { address: input.address as Prisma.InputJsonValue }
          : {}),
        ...(nid ? { nationalIdHash: nid.hash, nationalIdLast4: nid.last4 } : {}),
      },
      include: patientDetailInclude,
    });
    return toPatientDto(patient);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.get(tenantId, id);
    await this.prisma.patient.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'inactive' },
    });
  }

  // --- allergies ---------------------------------------------------------
  //
  // Structured allergy records live with the patient: the doctor's own words
  // stay in `knownAllergies`, while these rows are what prescribing and
  // dispensing actually check a medicine against.

  async listAllergies(
    tenantId: string,
    patientId: string,
  ): Promise<PatientAllergyDto[]> {
    await this.assertPatientExists(tenantId, patientId);
    const rows = await this.prisma.patientAllergy.findMany({
      where: { tenantId, patientId },
      orderBy: { recordedAt: 'desc' },
    });
    return rows.map(toPatientAllergyDto);
  }

  async addAllergy(
    tenantId: string,
    recordedById: string,
    patientId: string,
    input: CreatePatientAllergyInput,
  ): Promise<PatientAllergyDto> {
    await this.assertPatientExists(tenantId, patientId);
    const clash = await this.prisma.patientAllergy.findFirst({
      where: { tenantId, patientId, substance: input.substance },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException(
        'That substance is already recorded for this patient',
      );
    }
    const created = await this.prisma.patientAllergy.create({
      data: {
        tenantId,
        patientId,
        substance: input.substance,
        reaction: input.reaction ?? null,
        severity: input.severity,
        recordedById,
      },
    });
    return toPatientAllergyDto(created);
  }

  async removeAllergy(
    tenantId: string,
    patientId: string,
    allergyId: string,
  ): Promise<void> {
    await this.assertPatientExists(tenantId, patientId);
    const found = await this.prisma.patientAllergy.findFirst({
      where: { id: allergyId, tenantId, patientId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Allergy not found');
    await this.prisma.patientAllergy.delete({ where: { id: found.id } });
  }

  private async assertPatientExists(
    tenantId: string,
    id: string,
  ): Promise<void> {
    const found = await this.prisma.patient.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Patient not found');
  }

  private hashNationalId(cnic: string): { hash: string; last4: string } {
    return hashNationalId(
      cnic,
      this.config.getOrThrow<string>('NATIONAL_ID_HASH_SALT'),
    );
  }
}
