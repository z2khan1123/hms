import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  type CreatePatientInput,
  type Paginated,
  type Patient as PatientDto,
  type UpdatePatientInput,
} from '@hms/shared';
import { createHash } from 'node:crypto';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import { parseIsoDate, parseIsoDateOrNull } from '../../common/util/dates.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  patientDetailInclude,
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
    if (input.tpaId) await this.assertTpa(tenantId, input.tpaId);

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
          knownAllergies: input.knownAllergies ?? null,
          remarks: input.remarks ?? null,

          tpaId: input.tpaId ?? null,
          tpaMemberId: input.tpaMemberId ?? null,
          tpaValidTill: parseIsoDateOrNull(input.tpaValidTill),

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

  async update(
    tenantId: string,
    id: string,
    input: UpdatePatientInput,
  ): Promise<PatientDto> {
    await this.get(tenantId, id);
    const nid = input.nationalId
      ? this.hashNationalId(input.nationalId)
      : undefined;
    if (input.tpaId) await this.assertTpa(tenantId, input.tpaId);

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

        tpaId: input.tpaId,
        tpaMemberId: input.tpaMemberId,
        ...(input.tpaValidTill !== undefined
          ? { tpaValidTill: parseIsoDate(input.tpaValidTill) }
          : {}),

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

  private async assertTpa(tenantId: string, tpaId: string): Promise<void> {
    const tpa = await this.prisma.tpa.findFirst({
      where: { id: tpaId, tenantId },
      select: { id: true },
    });
    if (!tpa) throw new BadRequestException('Unknown TPA');
  }

  private hashNationalId(cnic: string): { hash: string; last4: string } {
    const digits = cnic.replace(/\D/g, '');
    const salt = this.config.getOrThrow<string>('NATIONAL_ID_HASH_SALT');
    return {
      hash: createHash('sha256').update(`${salt}:${digits}`).digest('hex'),
      last4: digits.slice(-4),
    };
  }
}
