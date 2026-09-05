import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Appointment } from '@prisma/client';
import {
  type Appointment as AppointmentDto,
  type AppointmentStatus,
  type CreateAppointmentInput,
} from '@hms/shared';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface AppointmentListFilter {
  from?: string;
  to?: string;
  practitionerId?: string;
  patientId?: string;
  status?: AppointmentStatus;
}

const BLOCKING_STATUSES: AppointmentStatus[] = ['booked', 'arrived'];

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tenantId: string,
    createdById: string,
    input: CreateAppointmentInput,
  ): Promise<AppointmentDto> {
    const [patient, practitioner] = await Promise.all([
      this.prisma.patient.findFirst({
        where: { id: input.patientId, tenantId, deletedAt: null },
      }),
      this.prisma.practitioner.findFirst({
        where: { id: input.practitionerId, tenantId, isActive: true },
      }),
    ]);
    if (!patient) throw new BadRequestException('Unknown patient');
    if (!practitioner) throw new BadRequestException('Unknown practitioner');

    await this.assertNoClash(
      tenantId,
      input.practitionerId,
      input.startsAt,
      input.endsAt,
    );

    const created = await this.prisma.appointment.create({
      data: {
        tenantId,
        patientId: input.patientId,
        practitionerId: input.practitionerId,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        reason: input.reason ?? null,
        notes: input.notes ?? null,
        createdById,
      },
    });
    return toDto(created);
  }

  async list(
    tenantId: string,
    filter: AppointmentListFilter,
  ): Promise<AppointmentDto[]> {
    const rows = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        practitionerId: filter.practitionerId,
        patientId: filter.patientId,
        status: filter.status,
        startsAt: {
          gte: filter.from ? new Date(filter.from) : undefined,
          lt: filter.to ? new Date(filter.to) : undefined,
        },
      },
      orderBy: { startsAt: 'asc' },
      take: 500,
    });
    return rows.map(toDto);
  }

  async get(tenantId: string, id: string): Promise<AppointmentDto> {
    const found = await this.prisma.appointment.findFirst({
      where: { id, tenantId },
    });
    if (!found) throw new NotFoundException('Appointment not found');
    return toDto(found);
  }

  async reschedule(
    tenantId: string,
    id: string,
    startsAt: string,
    endsAt: string,
  ): Promise<AppointmentDto> {
    const existing = await this.get(tenantId, id);
    await this.assertNoClash(
      tenantId,
      existing.practitionerId,
      startsAt,
      endsAt,
      id,
    );
    const updated = await this.prisma.appointment.update({
      where: { id },
      data: { startsAt: new Date(startsAt), endsAt: new Date(endsAt) },
    });
    return toDto(updated);
  }

  async setStatus(
    tenantId: string,
    id: string,
    status: AppointmentStatus,
  ): Promise<AppointmentDto> {
    await this.get(tenantId, id);
    const updated = await this.prisma.appointment.update({
      where: { id },
      data: { status },
    });
    return toDto(updated);
  }

  private async assertNoClash(
    tenantId: string,
    practitionerId: string,
    startsAt: string,
    endsAt: string,
    excludeId?: string,
  ): Promise<void> {
    const clash = await this.prisma.appointment.findFirst({
      where: {
        tenantId,
        practitionerId,
        id: excludeId ? { not: excludeId } : undefined,
        status: { in: BLOCKING_STATUSES },
        startsAt: { lt: new Date(endsAt) },
        endsAt: { gt: new Date(startsAt) },
      },
    });
    if (clash) {
      throw new ConflictException(
        'The practitioner already has an appointment overlapping that time',
      );
    }
  }
}

function toDto(a: Appointment): AppointmentDto {
  return {
    id: a.id,
    patientId: a.patientId,
    practitionerId: a.practitionerId,
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt.toISOString(),
    status: a.status,
    reason: a.reason,
    notes: a.notes,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}
