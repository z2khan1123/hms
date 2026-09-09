import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type CreateServiceOrdersInput,
  isReleasable,
  type ServiceDepartment,
  type ServiceOrder as ServiceOrderDto,
  type ServiceOrderStatus,
} from '@hms/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { startConsultationIfWaiting } from '../opd/start-consultation.js';
import { BillingService } from '../billing/billing.service.js';
import { CasesService } from '../cases/cases.service.js';
import { findOrCreateReportInTx } from '../diagnostics/report-provisioning.js';
import { serviceOrderInclude, toServiceOrderDto } from './orders.mapper.js';

export interface ServiceOrderListFilter {
  department?: ServiceDepartment;
  status?: ServiceOrderStatus;
  patientId?: string;
  opdVisitId?: string;
  caseId?: string;
  releasableOnly?: boolean;
  q?: string;
}

/**
 * ordered -> [sample_collected ->] in_progress -> completed, plus cancellation
 * off any live state. `completed` is only reachable through `in_progress`, so the
 * releasability gate on the `in_progress` hop can never be skipped. The
 * `ordered -> sample_collected` hop has its own route (`POST
 * /orders/:id/collect-sample`) which applies the same releasability gate.
 */
const ALLOWED_TRANSITIONS: Record<ServiceOrderStatus, ServiceOrderStatus[]> = {
  ordered: ['in_progress', 'cancelled'],
  sample_collected: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

const LIST_LIMIT = 500;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly cases: CasesService,
  ) {}

  /**
   * One transaction per request: for every order we resolve the service (or take
   * a free-text name), create the `pending` bill line, and create the order
   * linked to it. The bill line and the order are born together or not at all —
   * a recommendation the cashier never sees is how revenue goes missing.
   */
  async create(
    tenantId: string,
    orderedById: string,
    input: CreateServiceOrdersInput,
  ): Promise<ServiceOrderDto[]> {
    const createdIds = await this.prisma.$transaction(async (tx) => {
      const visit = await tx.opdVisit.findFirst({
        where: { id: input.opdVisitId, tenantId },
        select: { id: true, caseId: true, patientId: true },
      });
      if (!visit) throw new BadRequestException('Unknown OPD visit');
      await this.cases.assertOpen(tx, tenantId, visit.caseId);

      const ids: string[] = [];
      for (const order of input.orders) {
        if (!order.serviceId && !order.serviceName) {
          throw new BadRequestException(
            'Each order needs a service or a service name',
          );
        }

        let defaultPriceMinor: number | null = null;
        if (order.serviceId) {
          const service = await tx.service.findFirst({
            where: { id: order.serviceId, tenantId },
            select: { defaultPriceMinor: true },
          });
          if (!service) throw new BadRequestException('Unknown service');
          defaultPriceMinor = service.defaultPriceMinor;
        }

        const priceMinor = order.priceMinor ?? defaultPriceMinor ?? 0;

        // Reuse the billing arithmetic and the service snapshotting; the line is
        // created `pending` (the schema default).
        const billItem = await this.billing.addBillItemInTx(
          tx,
          tenantId,
          orderedById,
          {
            caseId: visit.caseId,
            opdVisitId: visit.id,
            serviceId: order.serviceId,
            serviceName: order.serviceName,
            priceMinor,
            quantity: order.quantity,
            note: order.note,
          },
        );

        const created = await tx.serviceOrder.create({
          data: {
            tenantId,
            caseId: visit.caseId,
            patientId: visit.patientId,
            opdVisitId: visit.id,
            serviceId: billItem.serviceId,
            serviceName: billItem.serviceName,
            department: billItem.department,
            billItemId: billItem.id,
            status: 'ordered',
            note: order.note ?? null,
            orderedById,
          },
        });
        ids.push(created.id);
      }

      // Sending the patient for a test is clinical work: the doctor has him.
      await startConsultationIfWaiting(tx, tenantId, visit.id);
      return ids;
    });

    const rows = await this.prisma.serviceOrder.findMany({
      where: { tenantId, id: { in: createdIds } },
      include: serviceOrderInclude,
      orderBy: { orderedAt: 'asc' },
    });
    return rows.map(toServiceOrderDto);
  }

  async list(
    tenantId: string,
    filter: ServiceOrderListFilter,
  ): Promise<ServiceOrderDto[]> {
    const where: Prisma.ServiceOrderWhereInput = {
      tenantId,
      department: filter.department,
      status: filter.status,
      patientId: filter.patientId,
      opdVisitId: filter.opdVisitId,
      caseId: filter.caseId,
      ...(filter.releasableOnly
        ? {
            billItem: {
              OR: [{ status: 'paid' }, { approvedWithoutPayment: true }],
            },
          }
        : {}),
      ...(filter.q
        ? {
            OR: [
              { serviceName: { contains: filter.q, mode: 'insensitive' } },
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
    };

    const rows = await this.prisma.serviceOrder.findMany({
      where,
      include: serviceOrderInclude,
      orderBy: { orderedAt: 'desc' },
      take: LIST_LIMIT,
    });
    return rows.map(toServiceOrderDto);
  }

  async get(tenantId: string, id: string): Promise<ServiceOrderDto> {
    const found = await this.prisma.serviceOrder.findFirst({
      where: { id, tenantId },
      include: serviceOrderInclude,
    });
    if (!found) throw new NotFoundException('Order not found');
    return toServiceOrderDto(found);
  }

  /**
   * Record that the specimen has been taken. Allowed only from `ordered`, and
   * only when the order is releasable (paid or approved without payment) — the
   * same gate as starting work; otherwise 409. Moves the order to
   * `sample_collected` and stamps the collection on the report row, creating
   * that row if it does not exist yet.
   */
  async collectSample(
    tenantId: string,
    actorId: string,
    id: string,
    collectedAt: string | undefined,
  ): Promise<ServiceOrderDto> {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.serviceOrder.findFirst({
        where: { id, tenantId },
        select: {
          id: true,
          status: true,
          serviceId: true,
          caseId: true,
          patientId: true,
          department: true,
          billItem: {
            select: { status: true, approvedWithoutPayment: true },
          },
        },
      });
      if (!order) throw new NotFoundException('Order not found');

      if (order.status !== 'ordered') {
        throw new ConflictException(
          `Cannot collect a sample for a ${order.status} order`,
        );
      }

      const releasable = isReleasable({
        billStatus: order.billItem?.status ?? null,
        approvedWithoutPayment: order.billItem?.approvedWithoutPayment ?? false,
      });
      if (!releasable) {
        throw new ConflictException(
          'This order has not been paid for. Send the patient to the billing ' +
            'counter to pay or have it approved before collecting a sample.',
        );
      }

      const when = collectedAt ? new Date(collectedAt) : new Date();
      await tx.serviceOrder.update({
        where: { id },
        data: { status: 'sample_collected' },
      });
      await findOrCreateReportInTx(tx, tenantId, order, {
        sampleCollectedAt: when,
        sampleCollectedById: actorId,
      });
    });
    return this.get(tenantId, id);
  }

  /**
   * Move an order through its worklist. Starting work (`in_progress`) is refused
   * with 409 unless the linked bill line is paid or approved without payment —
   * the lab only works on released orders.
   */
  async setStatus(
    tenantId: string,
    actorId: string,
    id: string,
    status: ServiceOrderStatus,
    reason: string | undefined,
  ): Promise<ServiceOrderDto> {
    const order = await this.prisma.serviceOrder.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        status: true,
        billItem: {
          select: { status: true, approvedWithoutPayment: true },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    if (
      order.status !== status &&
      !ALLOWED_TRANSITIONS[order.status].includes(status)
    ) {
      throw new ConflictException(
        `Cannot move a ${order.status} order to ${status}`,
      );
    }

    if (status === 'in_progress') {
      const releasable = isReleasable({
        billStatus: order.billItem?.status ?? null,
        approvedWithoutPayment: order.billItem?.approvedWithoutPayment ?? false,
      });
      if (!releasable) {
        throw new ConflictException(
          'This order has not been paid for. Send the patient to the billing ' +
            'counter to pay or have it approved before starting work.',
        );
      }
    }

    const data: Prisma.ServiceOrderUpdateInput = { status };
    if (status === 'in_progress') {
      data.startedAt = new Date();
      data.startedById = actorId;
    } else if (status === 'completed') {
      data.completedAt = new Date();
      data.completedById = actorId;
    } else if (status === 'cancelled') {
      data.cancelledAt = new Date();
      data.cancelReason = reason ?? null;
    }

    await this.prisma.serviceOrder.update({ where: { id }, data });
    return this.get(tenantId, id);
  }

  async cancel(
    tenantId: string,
    id: string,
    reason: string | undefined,
  ): Promise<ServiceOrderDto> {
    const order = await this.prisma.serviceOrder.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === 'completed') {
      throw new ConflictException('A completed order cannot be cancelled');
    }
    if (order.status === 'cancelled') {
      throw new ConflictException('Order is already cancelled');
    }

    await this.prisma.serviceOrder.update({
      where: { id },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelReason: reason ?? null,
      },
    });
    return this.get(tenantId, id);
  }
}
