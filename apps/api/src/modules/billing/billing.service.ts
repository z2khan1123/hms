import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type ChargeItem, type Payment } from '@prisma/client';
import {
  type AddChargeItemInput,
  type CaseLedger,
  type ChargeItem as ChargeItemDto,
  computeCaseBalance,
  computeChargeLine,
  type CreatePaymentInput,
  type Payment as PaymentDto,
} from '@hms/shared';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import { parseIsoDateOrNull, toIsoDateTimeOrNull } from '../../common/util/dates.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CasesService } from '../cases/cases.service.js';
import { toChargeItemDto, toPaymentDto } from './billing.mapper.js';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly cases: CasesService,
  ) {}

  // --- charge items --------------------------------------------------------

  async addChargeItem(
    tenantId: string,
    createdById: string,
    input: AddChargeItemInput,
  ): Promise<ChargeItemDto> {
    const created = await this.prisma.$transaction((tx) =>
      this.addChargeItemInTx(tx, tenantId, createdById, input),
    );
    return toChargeItemDto(created);
  }

  /**
   * Snapshots the charge master row onto the line — name, department and list
   * price — so editing a charge later never rewrites a bill that was already
   * handed to a patient. All arithmetic goes through `computeChargeLine`, which
   * the web client uses too.
   */
  async addChargeItemInTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    createdById: string,
    input: AddChargeItemInput,
  ): Promise<ChargeItem> {
    await this.cases.assertOpen(tx, tenantId, input.caseId);

    const charge = await tx.charge.findFirst({
      where: { id: input.chargeId, tenantId },
      include: { chargeCategory: true, taxCategory: true },
    });
    if (!charge) throw new BadRequestException('Unknown charge');

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

    const appliedChargeMinor =
      input.appliedChargeMinor ?? charge.standardChargeMinor;
    const taxBps = input.taxBps ?? charge.taxCategory?.rateBps ?? 0;

    const totals = computeChargeLine({
      appliedChargeMinor,
      quantity: input.quantity,
      discountBps: input.discountBps,
      discountMinor: input.discountMinor,
      taxBps,
    });

    return tx.chargeItem.create({
      data: {
        tenantId,
        caseId: input.caseId,
        opdVisitId: input.opdVisitId ?? null,
        chargeId: charge.id,
        chargeName: charge.name,
        chargeType: charge.chargeCategory.chargeType,
        quantity: totals.quantity,
        standardChargeMinor: charge.standardChargeMinor,
        appliedChargeMinor,
        discountBps: totals.discountBps,
        discountMinor: totals.discountMinor,
        taxBps: totals.taxBps,
        taxMinor: totals.taxMinor,
        netMinor: totals.netMinor,
        note: input.note ?? null,
        createdById,
      },
    });
  }

  async listChargeItems(
    tenantId: string,
    caseId: string,
  ): Promise<ChargeItemDto[]> {
    await this.assertCaseExists(tenantId, caseId);
    const rows = await this.prisma.chargeItem.findMany({
      where: { tenantId, caseId },
      orderBy: { chargedAt: 'asc' },
    });
    return rows.map(toChargeItemDto);
  }

  /** Allowed only while the case is open — a closed episode's bill is final. */
  async removeChargeItem(tenantId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const item = await tx.chargeItem.findFirst({
        where: { id, tenantId },
        select: { id: true, caseId: true },
      });
      if (!item) throw new NotFoundException('Charge item not found');
      await this.cases.assertOpen(tx, tenantId, item.caseId);
      await tx.chargeItem.delete({ where: { id } });
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
        chargeItems: { orderBy: { chargedAt: 'asc' } },
        payments: { orderBy: { paidAt: 'asc' } },
      },
    });
    if (!kase) throw new NotFoundException('Case not found');

    // Re-derive each line through the shared arithmetic rather than trusting a
    // hand-rolled sum; the stored columns were written by the same function.
    let grossMinor = 0;
    let discountMinor = 0;
    let taxMinor = 0;
    for (const item of kase.chargeItems) {
      const line = computeChargeLine({
        appliedChargeMinor: item.appliedChargeMinor,
        quantity: item.quantity,
        discountMinor: item.discountMinor,
        taxBps: item.taxBps,
      });
      grossMinor += line.grossMinor;
      discountMinor += line.discountMinor;
      taxMinor += line.taxMinor;
    }

    const balance = computeCaseBalance(
      kase.chargeItems,
      kase.payments.map((p) => ({
        amountMinor: p.amountMinor,
        reversedAt: toIsoDateTimeOrNull(p.reversedAt),
      })),
    );

    return {
      caseId: kase.id,
      caseNo: kase.caseNo,
      currency: kase.tenant.currency,
      items: kase.chargeItems.map(toChargeItemDto),
      payments: kase.payments.map(toPaymentDto),
      grossMinor,
      discountMinor,
      taxMinor,
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
