import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type Patient } from '@prisma/client';
import {
  type Address,
  type CreatePatientInput,
  type Paginated,
  type Patient as PatientDto,
  type UpdatePatientInput,
} from '@hms/shared';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';

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
  ) {}

  async create(
    tenantId: string,
    input: CreatePatientInput,
  ): Promise<PatientDto> {
    const nid = input.nationalId
      ? this.hashNationalId(input.nationalId)
      : null;

    const patient = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.update({
        where: { id: tenantId },
        data: { mrnSeq: { increment: 1 } },
      });
      const mrn = `${tenant.mrnPrefix}-${String(tenant.mrnSeq).padStart(6, '0')}`;
      return tx.patient.create({
        data: {
          tenantId,
          mrn,
          firstName: input.firstName,
          lastName: input.lastName,
          gender: input.gender,
          birthDate: new Date(input.birthDate),
          phone: input.phone,
          email: input.email ?? null,
          nationalIdHash: nid?.hash ?? null,
          nationalIdLast4: nid?.last4 ?? null,
          bloodType: input.bloodType ?? null,
          ...(input.address
            ? { address: input.address as Prisma.InputJsonValue }
            : {}),
        },
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
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.patient.findMany({
        where,
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

    const patient = await this.prisma.patient.update({
      where: { id },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        gender: input.gender,
        birthDate: input.birthDate ? new Date(input.birthDate) : undefined,
        phone: input.phone,
        email: input.email,
        bloodType: input.bloodType,
        status: input.status,
        ...(input.address !== undefined
          ? { address: input.address as Prisma.InputJsonValue }
          : {}),
        ...(nid
          ? { nationalIdHash: nid.hash, nationalIdLast4: nid.last4 }
          : {}),
      },
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

  private hashNationalId(cnic: string): { hash: string; last4: string } {
    const digits = cnic.replace(/\D/g, '');
    const salt = this.config.getOrThrow<string>('NATIONAL_ID_HASH_SALT');
    return {
      hash: createHash('sha256').update(`${salt}:${digits}`).digest('hex'),
      last4: digits.slice(-4),
    };
  }
}

function toPatientDto(p: Patient): PatientDto {
  return {
    id: p.id,
    mrn: p.mrn,
    firstName: p.firstName,
    lastName: p.lastName,
    gender: p.gender,
    birthDate: p.birthDate.toISOString().slice(0, 10),
    phone: p.phone,
    email: p.email,
    nationalIdLast4: p.nationalIdLast4,
    address: (p.address as Address | null) ?? null,
    bloodType: p.bloodType,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
