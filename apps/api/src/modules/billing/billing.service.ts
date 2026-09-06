import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type BillItem, type Payment } from '@prisma/client';
import {
  type AddBillItemInput,
  type BillItem as BillItemDto,
  type CaseLedger,
  computeBillLine,
  computeCaseBalance,
  type CreatePaymentInput,
  type Payment as PaymentDto,
} from '@hms/shared';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import { parseIsoDateOrNull, toIsoDateTimeOrNull } from '../../common/util/dates.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CasesService } from '../cases/cases.service.js';
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
    input: AddBillItemInput,
  ): Promise<BillItem> {
    await this.cases.assertOpen(tx, tenantId, input.caseId);

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
        note: input.note ?? null,
        createdById,
      },
    });
  }

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

    const receiptNo = await this.sequence.next(tx, tenantId, 'receipt');

    return tx.payment.create({
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

    const updated = await this.prisma.payment.update({
      where: { id },
      data: { reversedAt: new Date(), reversalReason: reason },
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
