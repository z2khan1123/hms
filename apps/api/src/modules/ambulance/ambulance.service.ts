import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  type AmbulanceCall,
  type CallStage,
  type CompleteCallInput,
  type CreateCallInput,
  type CreateVehicleInput,
  type EmergencyLevel,
  type UpdateVehicleInput,
  type Vehicle,
  type VehicleType,
  callStageOf,
  responseMinutes,
} from '@hms/shared';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import { parseIsoDate } from '../../common/util/dates.js';
import { compareNatural } from '../../common/util/natural-sort.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BillingService } from '../billing/billing.service.js';
import { CasesService } from '../cases/cases.service.js';
import {
  type CallRow,
  callInclude,
  toCallDto,
  toVehicleDto,
  vehicleInclude,
} from './ambulance.mapper.js';

export interface VehicleListFilter {
  type?: VehicleType;
  availableOnly?: boolean;
  includeInactive?: boolean;
}

export interface CallListFilter {
  vehicleId?: string;
  stage?: CallStage;
  emergencyLevel?: EmergencyLevel;
  patientId?: string;
  from?: string;
  to?: string;
  q?: string;
}

/**
 * Ambulance dispatch and the call log.
 *
 * A vehicle being "on call" is derived from its own open calls rather than
 * stored as a flag — a crashed process or a forgotten click would otherwise
 * leave an ambulance permanently unavailable on the board while it sits in the
 * yard.
 */
@Injectable()
export class AmbulanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly cases: CasesService,
    private readonly billing: BillingService,
  ) {}

  // --- vehicles -------------------------------------------------------

  async listVehicles(
    tenantId: string,
    filter: VehicleListFilter,
  ): Promise<Vehicle[]> {
    const rows = await this.prisma.vehicle.findMany({
      where: {
        tenantId,
        ...(filter.includeInactive ? {} : { isActive: true }),
        ...(filter.type ? { type: filter.type } : {}),
      },
      include: vehicleInclude,
    });
    return rows
      .map(toVehicleDto)
      .filter((v) => !filter.availableOnly || !v.isOnCall)
      .sort((a, b) => compareNatural(a.registrationNo, b.registrationNo));
  }

  async createVehicle(
    tenantId: string,
    input: CreateVehicleInput,
  ): Promise<Vehicle> {
    const created = await this.prisma.vehicle
      .create({
        data: {
          tenantId,
          registrationNo: input.registrationNo,
          model: input.model ?? null,
          type: input.type,
          driverName: input.driverName ?? null,
          driverPhone: input.driverPhone ?? null,
          baseChargeMinor: input.baseChargeMinor ?? null,
          perKmChargeMinor: input.perKmChargeMinor ?? null,
          note: input.note ?? null,
        },
        include: vehicleInclude,
      })
      .catch((e: unknown) => {
        if ((e as { code?: string }).code === 'P2002') {
          throw new ConflictException('That registration number is already on the fleet');
        }
        throw e;
      });
    return toVehicleDto(created);
  }

  async updateVehicle(
    tenantId: string,
    id: string,
    input: UpdateVehicleInput,
  ): Promise<Vehicle> {
    await this.assertVehicleExists(tenantId, id);
    const updated = await this.prisma.vehicle.update({
      where: { id },
      data: {
        ...(input.registrationNo === undefined
          ? {}
          : { registrationNo: input.registrationNo }),
        ...(input.model === undefined ? {} : { model: input.model }),
        ...(input.type === undefined ? {} : { type: input.type }),
        ...(input.driverName === undefined ? {} : { driverName: input.driverName }),
        ...(input.driverPhone === undefined ? {} : { driverPhone: input.driverPhone }),
        ...(input.baseChargeMinor === undefined
          ? {}
          : { baseChargeMinor: input.baseChargeMinor }),
        ...(input.perKmChargeMinor === undefined
          ? {}
          : { perKmChargeMinor: input.perKmChargeMinor }),
        ...(input.note === undefined ? {} : { note: input.note }),
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      },
      include: vehicleInclude,
    });
    return toVehicleDto(updated);
  }

  // --- calls ----------------------------------------------------------

  async listCalls(tenantId: string, filter: CallListFilter): Promise<AmbulanceCall[]> {
    const q = filter.q?.trim();
    const rows = await this.prisma.ambulanceCall.findMany({
      where: {
        tenantId,
        ...(filter.vehicleId ? { vehicleId: filter.vehicleId } : {}),
        ...(filter.emergencyLevel ? { emergencyLevel: filter.emergencyLevel } : {}),
        ...(filter.patientId ? { patientId: filter.patientId } : {}),
        ...(filter.from ? { dispatchedAt: { gte: parseIsoDate(filter.from) } } : {}),
        ...(filter.to ? { dispatchedAt: { lt: this.dayAfter(filter.to) } } : {}),
        ...(q
          ? {
              OR: [
                { callNo: { contains: q, mode: 'insensitive' as const } },
                { callerName: { contains: q, mode: 'insensitive' as const } },
                { callerPhone: { contains: q } },
                { pickupAddress: { contains: q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      include: callInclude,
      orderBy: [{ dispatchedAt: 'desc' }],
    });
    const dtos = rows.map(toCallDto);
    // Stage is derived from the timestamps, so it is filtered here.
    return filter.stage ? dtos.filter((c) => c.stage === filter.stage) : dtos;
  }

  async getCall(tenantId: string, id: string): Promise<AmbulanceCall> {
    return toCallDto(await this.findCall(tenantId, id));
  }

  /**
   * Dispatch. The vehicle must not already be out — but the check and the
   * insert share a transaction and an advisory lock, so two dispatchers cannot
   * both send the same ambulance to different addresses.
   */
  async dispatch(
    tenantId: string,
    createdById: string,
    input: CreateCallInput,
  ): Promise<AmbulanceCall> {
    if (!input.patientId && !input.callerName?.trim()) {
      throw new BadRequestException(
        'Give a caller name when the call is not for a registered patient',
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${tenantId}:vehicle:${input.vehicleId}`}))`;

      const vehicle = await tx.vehicle.findFirst({
        where: { id: input.vehicleId, tenantId },
        select: { id: true, isActive: true, registrationNo: true },
      });
      if (!vehicle) throw new NotFoundException('Vehicle not found');
      if (!vehicle.isActive) {
        throw new ConflictException('That vehicle is out of service');
      }

      const open = await tx.ambulanceCall.count({
        where: {
          tenantId,
          vehicleId: vehicle.id,
          completedAt: null,
          cancelledAt: null,
        },
      });
      if (open > 0) {
        throw new ConflictException(
          `${vehicle.registrationNo} is already out on a call`,
        );
      }

      if (input.patientId) {
        const patient = await tx.patient.findFirst({
          where: { id: input.patientId, tenantId, deletedAt: null },
          select: { id: true },
        });
        if (!patient) throw new NotFoundException('Patient not found');
      }

      const callNo = await this.sequence.next(tx, tenantId, 'call');
      return tx.ambulanceCall.create({
        data: {
          tenantId,
          callNo,
          vehicleId: vehicle.id,
          patientId: input.patientId ?? null,
          callerName: input.callerName ?? null,
          callerPhone: input.callerPhone ?? null,
          emergencyLevel: input.emergencyLevel,
          pickupAddress: input.pickupAddress,
          dropAddress: input.dropAddress ?? null,
          dispatchedAt: input.dispatchedAt ? new Date(input.dispatchedAt) : new Date(),
          note: input.note ?? null,
          createdById,
        },
        include: callInclude,
      });
    });
    return toCallDto(created);
  }

  /** Mark arrival. Separate from completion so response time is a real figure. */
  async markArrived(
    tenantId: string,
    id: string,
    arrivedAt?: string,
  ): Promise<AmbulanceCall> {
    const call = await this.findCall(tenantId, id);
    this.assertOpen(call);
    if (call.arrivedAt) {
      throw new ConflictException('That call is already marked as arrived');
    }
    const updated = await this.prisma.ambulanceCall.update({
      where: { id },
      data: { arrivedAt: arrivedAt ? new Date(arrivedAt) : new Date() },
      include: callInclude,
    });
    return toCallDto(updated);
  }

  /**
   * Close the call, optionally billing for it.
   *
   * A charge needs a patient, because a charge has to land on somebody's case.
   * Leaving it out logs the call without a bill — an ambulance sent to a road
   * accident is not always somebody's invoice.
   */
  async complete(
    tenantId: string,
    userId: string,
    id: string,
    input: CompleteCallInput,
  ): Promise<AmbulanceCall> {
    const completed = await this.prisma.$transaction(async (tx) => {
      const call = await tx.ambulanceCall.findFirst({ where: { id, tenantId } });
      if (!call) throw new NotFoundException('Call not found');
      if (call.cancelledAt) throw new ConflictException('That call was cancelled');
      if (call.completedAt) throw new ConflictException('That call is already closed');

      const patientId = input.patientId ?? call.patientId;
      let billItemId = call.billItemId;
      let caseId = call.caseId;

      if (input.chargeMinor !== undefined) {
        if (!patientId) {
          throw new BadRequestException(
            'A charge needs a patient — attach one to the call, or close it without a charge',
          );
        }
        const kase = await this.cases.findOrOpenInTx(tx, tenantId, userId, {
          patientId,
          caseId: input.caseId ?? call.caseId ?? undefined,
        });
        caseId = kase.id;
        const item = await this.billing.addBillItemInTx(tx, tenantId, userId, {
          caseId: kase.id,
          serviceName: `Ambulance — ${call.callNo}`,
          department: 'ambulance',
          quantity: 1,
          priceMinor: input.chargeMinor,
        });
        billItemId = item.id;
      }

      return tx.ambulanceCall.update({
        where: { id },
        data: {
          arrivedAt:
            call.arrivedAt ?? (input.arrivedAt ? new Date(input.arrivedAt) : new Date()),
          completedAt: input.completedAt ? new Date(input.completedAt) : new Date(),
          distanceKm: input.distanceKm ?? call.distanceKm,
          chargeMinor: input.chargeMinor ?? call.chargeMinor,
          patientId: patientId ?? null,
          caseId,
          billItemId,
          ...(input.note === undefined ? {} : { note: input.note }),
        },
        include: callInclude,
      });
    });
    return toCallDto(completed);
  }

  async cancel(tenantId: string, id: string, reason: string): Promise<AmbulanceCall> {
    const call = await this.findCall(tenantId, id);
    this.assertOpen(call);
    const updated = await this.prisma.ambulanceCall.update({
      where: { id },
      data: { cancelledAt: new Date(), cancelReason: reason },
      include: callInclude,
    });
    return toCallDto(updated);
  }

  /** Response times, the number an ambulance service is actually judged on. */
  async responseStats(
    tenantId: string,
    from?: string,
    to?: string,
  ): Promise<{
    calls: number;
    arrived: number;
    averageResponseMinutes: number | null;
    byLevel: { emergencyLevel: EmergencyLevel; calls: number; averageResponseMinutes: number | null }[];
  }> {
    const rows = await this.prisma.ambulanceCall.findMany({
      where: {
        tenantId,
        cancelledAt: null,
        ...(from ? { dispatchedAt: { gte: parseIsoDate(from) } } : {}),
        ...(to ? { dispatchedAt: { lt: this.dayAfter(to) } } : {}),
      },
      select: { dispatchedAt: true, arrivedAt: true, emergencyLevel: true },
    });

    const minutesOf = (r: (typeof rows)[number]) =>
      responseMinutes(r.dispatchedAt.toISOString(), r.arrivedAt?.toISOString() ?? null);

    const average = (list: typeof rows) => {
      const mins = list.map(minutesOf).filter((m): m is number => m !== null);
      if (mins.length === 0) return null;
      return Math.round(mins.reduce((a, b) => a + b, 0) / mins.length);
    };

    const levels: EmergencyLevel[] = ['critical', 'urgent', 'routine'];
    return {
      calls: rows.length,
      arrived: rows.filter((r) => r.arrivedAt).length,
      averageResponseMinutes: average(rows),
      byLevel: levels.map((lvl) => {
        const mine = rows.filter((r) => r.emergencyLevel === lvl);
        return {
          emergencyLevel: lvl,
          calls: mine.length,
          averageResponseMinutes: average(mine),
        };
      }),
    };
  }

  // --- internals ------------------------------------------------------

  private assertOpen(call: CallRow): void {
    const stage = callStageOf({
      cancelledAt: call.cancelledAt?.toISOString() ?? null,
      completedAt: call.completedAt?.toISOString() ?? null,
      arrivedAt: call.arrivedAt?.toISOString() ?? null,
    });
    if (stage === 'completed' || stage === 'cancelled') {
      throw new ConflictException(`That call is already ${stage}`);
    }
  }

  private async findCall(tenantId: string, id: string): Promise<CallRow> {
    const row = await this.prisma.ambulanceCall.findFirst({
      where: { id, tenantId },
      include: callInclude,
    });
    if (!row) throw new NotFoundException('Call not found');
    return row;
  }

  private async assertVehicleExists(tenantId: string, id: string): Promise<void> {
    const found = await this.prisma.vehicle.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Vehicle not found');
  }

  private dayAfter(isoDate: string): Date {
    const d = parseIsoDate(isoDate);
    d.setUTCDate(d.getUTCDate() + 1);
    return d;
  }
}

export type { Prisma };
