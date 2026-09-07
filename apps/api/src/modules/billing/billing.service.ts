import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type BillItem, type Payment , type CaseStatus } from '@prisma/client';
import {
  type AddBillItemInput,
  type AdjustBillItemInput,
  type BillItem as BillItemDto,
  type CaseLedger,
  computeBillLine,
  computeCaseBalance,
  type CreatePaymentInput,
  type Payment as PaymentDto,
  type PendingChargeGroup,
} from '@hms/shared';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import { parseIsoDateOrNull, toIsoDateTimeOrNull } from '../../common/util/dates.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CasesService } from '../cases/cases.service.js';
import {
  patientSummarySelect,
  toPatientSummary,
} from '../patients/patients.mapper.js';
import { toBillItemDto, toPaymentDto } from './billing.mapper.js';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly cases: CasesService,
  ) {}

  // --- bill items --------------------------------------------------------

  async addBillItem(
    tenantId: string,
    createdById: string,
    input: AddBillItemInput,
  ): Promise<BillItemDto> {
    const created = await this.prisma.$transaction((tx) =>
      this.addBillItemInTx(tx, tenantId, createdById, input),
    );
    return toBillItemDto(created);
  }

  /**
   * Snapshots the service's name, department and suggested price onto the line
   * so later edits to the service list never rewrite a bill already handed to a
   * patient. `priceMinor` from the caller is always what gets billed — the
   * service's `defaultPriceMinor` is copied for reference only. When no
   * `serviceId` is given the line is billed by name alone. All arithmetic goes
   * through `computeBillLine`, which the web client uses too.
   */
  async addBillItemInTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    createdById: string,
    input: AddBillItemInput & {
      discountReason?: string | null;
      /** Widen which case statuses accept a line — see CasesService.assertOpen. */
      billableStatuses?: readonly CaseStatus[];
    },
  ): Promise<BillItem> {
    await this.cases.assertOpen(
      tx,
      tenantId,
      input.caseId,
      input.billableStatuses,
    );

    let serviceId: string | null = null;
    let serviceName: string;
    let department = input.department ?? null;
    let defaultPriceMinor: number | null = null;

    if (input.serviceId) {
      const service = await tx.service.findFirst({
        where: { id: input.serviceId, tenantId },
      });
      if (!service) throw new BadRequestException('Unknown service');
      serviceId = service.id;
      serviceName = service.name;
      department = input.department ?? service.department ?? null;
      defaultPriceMinor = service.defaultPriceMinor;
    } else {
      if (!input.serviceName) {
        throw new BadRequestException('A service name is required');
      }
      serviceName = input.serviceName;
    }

    if (input.opdVisitId) {
      const visit = await tx.opdVisit.findFirst({
        where: { id: input.opdVisitId, tenantId },
        select: { caseId: true },
      });
      if (!visit) throw new BadRequestException('Unknown OPD visit');
      if (visit.caseId !== input.caseId) {
        throw new BadRequestException('That visit belongs to a different case');
      }
    }

    const totals = computeBillLine({
      priceMinor: input.priceMinor,
      quantity: input.quantity,
      discountBps: input.discountBps,
      discountMinor: input.discountMinor,
    });

    return tx.billItem.create({
      data: {
        tenantId,
        caseId: input.caseId,
        opdVisitId: input.opdVisitId ?? null,
        serviceId,
        serviceName,
        department,
        quantity: totals.quantity,
        defaultPriceMinor,
        priceMinor: input.priceMinor,
        discountBps: totals.discountBps,
        discountMinor: totals.discountMinor,
        netMinor: totals.netMinor,
        discountReason: input.discountReason ?? null,
        note: input.note ?? null,
        createdById,
      },
    });
  }

  /**
   * A bed charge, confirmed at discharge and never posted per-night on its own.
   * It shares the snapshot + `computeBillLine` path of every other line, so the
   * arithmetic lives in exactly one place. Unlike `addBillItemInTx` it also
   * accepts a case in `moved_to_ipd` (a patient admitted straight from OPD),
   * rejecting only a closed one.
   */


  /**
   * Concede part of a charge that has not been paid yet — in practice a doctor
   * obliging a patient on his own consultation fee. The line is recomputed with
   * `computeBillLine` from the supplied `priceMinor` (falling back to the one
   * already on the line), `quantity` and whichever discount was given; the
   * arithmetic is never hand-rolled.
   *
   * Only a `pending` line may be adjusted. Once the charge is `paid`, `cancelled`
   * or `refunded` the money has changed hands and the correction is a refund —
   * a separate transaction — not an in-place edit.
   *
   * `discountReason` is required by the schema, so a concession is never
   * anonymous. `BillItem` has no `updatedById` column, so the acting user is not
   * written onto the row; the `@Audit` interceptor already records the actor,
   * action and entity id for this mutation, which is the audit trail for who
   * granted the concession.
   */
  async adjustBillItem(
    tenantId: string,
    _actingUserId: string,
    id: string,
    input: AdjustBillItemInput,
  ): Promise<BillItemDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const item = await tx.billItem.findFirst({ where: { id, tenantId } });
      if (!item) throw new NotFoundException('Bill item not found');
      if (item.status !== 'pending') {
        throw new ConflictException(
          'This charge has already been settled; it cannot be edited in place — ' +
            'issue a refund instead',
        );
      }

      const priceMinor = input.priceMinor ?? item.priceMinor;
      const totals = computeBillLine({
        priceMinor,
        quantity: input.quantity ?? item.quantity,
        discountBps: input.discountBps,
        discountMinor: input.discountMinor,
      });

      return tx.billItem.update({
        where: { id },
        data: {
          priceMinor,
          quantity: totals.quantity,
          discountBps: totals.discountBps,
          discountMinor: totals.discountMinor,
          netMinor: totals.netMinor,
          discountReason: input.discountReason,
        },
      });
    });
    return toBillItemDto(updated);
  }

  /** Allowed only while the case is open — a closed episode's bill is final. */
  async removeBillItem(tenantId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const item = await tx.billItem.findFirst({
        where: { id, tenantId },
        select: { id: true, caseId: true },
      });
      if (!item) throw new NotFoundException('Bill item not found');
      await this.cases.assertOpen(tx, tenantId, item.caseId);
      await tx.billItem.delete({ where: { id } });
    });
  }

  // --- payments ------------------------------------------------------------

  async listBillItems(
    tenantId: string,
    caseId: string,
  ): Promise<BillItemDto[]> {
    await this.assertCaseExists(tenantId, caseId);
    const rows = await this.prisma.billItem.findMany({
      where: { tenantId, caseId },
      orderBy: { chargedAt: 'asc' },
    });
    return rows.map(toBillItemDto);
  }

  async createPayment(
    tenantId: string,
    createdById: string,
    input: CreatePaymentInput,
  ): Promise<PaymentDto> {
    const created = await this.prisma.$transaction((tx) =>
      this.createPaymentInTx(tx, tenantId, createdById, input),
    );
    return toPaymentDto(created);
  }

  /**
   * A payment either settles specific bill lines or lands as an unallocated
   * advance. When `billItemIds` are given: every id must belong to this case and
   * tenant and still be `pending`, and `amountMinor` must equal the sum of their
   * `netMinor` to the paisa — a settlement that does not add up is rejected, not
   * quietly absorbed. Settled lines become `paid` and point at the new receipt;
   * a registered visit whose consultation line was just settled advances to
   * `waiting`.
   */
  async createPaymentInTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    createdById: string,
    input: CreatePaymentInput,
  ): Promise<Payment> {
    const found = await tx.case.findFirst({
      where: { id: input.caseId, tenantId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Case not found');

    let settledItems: { id: string; opdVisitId: string | null }[] = [];
    if (input.billItemIds && input.billItemIds.length > 0) {
      const ids = [...new Set(input.billItemIds)];
      const items = await tx.billItem.findMany({
        where: { id: { in: ids }, tenantId },
        select: {
          id: true,
          caseId: true,
          status: true,
          netMinor: true,
          opdVisitId: true,
        },
      });
      if (items.length !== ids.length) {
        throw new BadRequestException(
          'One or more selected bill items were not found for this hospital',
        );
      }
      for (const it of items) {
        if (it.caseId !== input.caseId) {
          throw new BadRequestException(
            'A selected line belongs to a different case',
          );
        }
        if (it.status !== 'pending') {
          throw new BadRequestException(
            'A selected line is not awaiting payment',
          );
        }
      }
      const sumMinor = items.reduce((sum, it) => sum + it.netMinor, 0);
      if (sumMinor !== input.amountMinor) {
        throw new BadRequestException(
          `Payment amount (${input.amountMinor}) must equal the sum of the ` +
            `selected lines (${sumMinor})`,
        );
      }
      settledItems = items.map((it) => ({
        id: it.id,
        opdVisitId: it.opdVisitId,
      }));
    }

    const receiptNo = await this.sequence.next(tx, tenantId, 'receipt');

    const payment = await tx.payment.create({
      data: {
        tenantId,
        caseId: input.caseId,
        receiptNo,
        amountMinor: input.amountMinor,
        mode: input.mode,
        paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
        note: input.note ?? null,
        chequeNo: input.chequeNo ?? null,
        chequeDate: parseIsoDateOrNull(input.chequeDate),
        documentUrl: input.documentUrl ?? null,
        createdById,
      },
    });

    if (settledItems.length > 0) {
      await tx.billItem.updateMany({
        where: { id: { in: settledItems.map((i) => i.id) }, tenantId },
        data: { status: 'paid', paymentId: payment.id },
      });

      const visitIds = [
        ...new Set(
          settledItems
            .map((i) => i.opdVisitId)
            .filter((v): v is string => v !== null),
        ),
      ];
      if (visitIds.length > 0) {
        await tx.opdVisit.updateMany({
          where: { id: { in: visitIds }, tenantId, status: 'registered' },
          data: { status: 'waiting' },
        });
      }
    }

    return payment;
  }

  async listPayments(
    tenantId: string,
    caseId: string,
  ): Promise<PaymentDto[]> {
    await this.assertCaseExists(tenantId, caseId);
    const rows = await this.prisma.payment.findMany({
      where: { tenantId, caseId },
      orderBy: { paidAt: 'asc' },
    });
    return rows.map(toPaymentDto);
  }

  /**
   * A receipt that was printed and handed over is a fact. Reversal is additive —
   * the row keeps its receipt number and gains `reversedAt` + a reason.
   */
  async reversePayment(
    tenantId: string,
    id: string,
    reason: string,
  ): Promise<PaymentDto> {
    const existing = await this.prisma.payment.findFirst({
      where: { id, tenantId },
      select: { id: true, reversedAt: true },
    });
    if (!existing) throw new NotFoundException('Payment not found');
    if (existing.reversedAt) {
      throw new ConflictException('Payment is already reversed');
    }

    // Additive on the receipt, but the lines it settled go back to `pending` and
    // lose their pointer to it — the money is owed again.
    const updated = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.update({
        where: { id },
        data: { reversedAt: new Date(), reversalReason: reason },
      });
      await tx.billItem.updateMany({
        where: { tenantId, paymentId: id },
        data: { status: 'pending', paymentId: null },
      });
      return payment;
    });
    return toPaymentDto(updated);
  }

  // --- the bill ------------------------------------------------------------

  async ledger(tenantId: string, caseId: string): Promise<CaseLedger> {
    const kase = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      select: {
        id: true,
        caseNo: true,
        tenant: { select: { currency: true } },
        billItems: { orderBy: { chargedAt: 'asc' } },
        payments: { orderBy: { paidAt: 'asc' } },
      },
    });
    if (!kase) throw new NotFoundException('Case not found');

    // Re-derive each line through the shared arithmetic rather than trusting a
    // hand-rolled sum; the stored columns were written by the same function.
    let grossMinor = 0;
    let discountMinor = 0;
    for (const item of kase.billItems) {
      const line = computeBillLine({
        priceMinor: item.priceMinor,
        quantity: item.quantity,
        discountMinor: item.discountMinor,
      });
      grossMinor += line.grossMinor;
      discountMinor += line.discountMinor;
    }

    const balance = computeCaseBalance(
      kase.billItems,
      kase.payments.map((p) => ({
        amountMinor: p.amountMinor,
        reversedAt: toIsoDateTimeOrNull(p.reversedAt),
      })),
    );

    return {
      caseId: kase.id,
      caseNo: kase.caseNo,
      currency: kase.tenant.currency,
      items: kase.billItems.map(toBillItemDto),
      payments: kase.payments.map(toPaymentDto),
      grossMinor,
      discountMinor,
      netMinor: balance.chargedMinor,
      paidMinor: balance.paidMinor,
      balanceMinor: balance.balanceMinor,
    };
  }

  /**
   * The cashier's queue. One row per open case that still has `pending` lines,
   * longest-waiting patient first, so the counter works a patient rather than a
   * scattered list of lines.
   */
  async pending(tenantId: string): Promise<PendingChargeGroup[]> {
    const cases = await this.prisma.case.findMany({
      where: {
        tenantId,
        status: 'open',
        billItems: { some: { status: 'pending' } },
      },
      select: {
        id: true,
        caseNo: true,
        patient: { select: patientSummarySelect },
        billItems: {
          where: { status: 'pending' },
          orderBy: { chargedAt: 'asc' },
        },
      },
    });

    return cases
      .map((c) => {
        const items = c.billItems;
        return {
          caseId: c.id,
          caseNo: c.caseNo,
          patient: toPatientSummary(c.patient),
          items: items.map(toBillItemDto),
          pendingCount: items.length,
          pendingMinor: items.reduce((sum, i) => sum + i.netMinor, 0),
          oldestPendingAt: items[0].chargedAt.toISOString(),
        };
      })
      .sort((a, b) => a.oldestPendingAt.localeCompare(b.oldestPendingAt));
  }

  /**
   * Release an unpaid line to its department — a panel patient or a waiver. The
   * money is still owed, so `status` does not change; the line just becomes
   * releasable, and it carries who approved it and why.
   */
  async approveBillItem(
    tenantId: string,
    approvedById: string,
    id: string,
    reason: string,
  ): Promise<BillItemDto> {
    const item = await this.prisma.billItem.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true },
    });
    if (!item) throw new NotFoundException('Bill item not found');
    if (item.status !== 'pending') {
      throw new ConflictException(
        'Only a pending line can be released without payment',
      );
    }

    const updated = await this.prisma.billItem.update({
      where: { id },
      data: {
        approvedWithoutPayment: true,
        approvalReason: reason,
        approvedById,
        approvedAt: new Date(),
      },
    });
    return toBillItemDto(updated);
  }

  private async assertCaseExists(
    tenantId: string,
    caseId: string,
  ): Promise<void> {
    const found = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Case not found');
  }
}
