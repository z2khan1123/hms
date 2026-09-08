import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateReferralPaymentInput,
  CreateReferrerInput,
  ReferralPayment as ReferralPaymentDto,
  Referrer as ReferrerDto,
} from '@hms/shared';
import { parseIsoDate } from '../../common/util/dates.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ReferralPaymentListQuery } from './finance.query.js';
import {
  EMPTY_REFERRER_STATS,
  type ReferrerStats,
  referralPaymentInclude,
  toReferralPaymentDto,
  toReferrerDto,
} from './finance.mapper.js';

interface ReferrerBody {
  name?: string;
  phone?: string | null;
  category?: string | null;
  commissionBps?: number | null;
  isActive?: boolean;
}

type DeleteResult = { id: string; softDeleted: boolean };

const LIST_LIMIT = 1000;

@Injectable()
export class ReferralsService {
  constructor(private readonly prisma: PrismaService) {}

  // --- referrers ------------------------------------------------------

  async listReferrers(tenantId: string): Promise<ReferrerDto[]> {
    const rows = await this.prisma.referrer.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      take: LIST_LIMIT,
    });
    const stats = await this.statsFor(
      tenantId,
      rows.map((r) => r.id),
    );
    return rows.map((r) =>
      toReferrerDto(r, stats.get(r.id) ?? EMPTY_REFERRER_STATS),
    );
  }

  async getReferrer(tenantId: string, id: string): Promise<ReferrerDto> {
    const row = await this.prisma.referrer.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Referrer not found');
    const stats = await this.statsFor(tenantId, [id]);
    return toReferrerDto(row, stats.get(id) ?? EMPTY_REFERRER_STATS);
  }

  async createReferrer(
    tenantId: string,
    input: CreateReferrerInput,
  ): Promise<ReferrerDto> {
    await this.assertNameFree(tenantId, input.name);
    const created = await this.prisma.referrer.create({
      data: {
        tenantId,
        name: input.name,
        phone: input.phone ?? null,
        category: input.category ?? null,
        commissionBps: input.commissionBps ?? null,
      },
    });
    return toReferrerDto(created, EMPTY_REFERRER_STATS);
  }

  async updateReferrer(
    tenantId: string,
    id: string,
    input: ReferrerBody,
  ): Promise<ReferrerDto> {
    await this.findReferrer(tenantId, id);
    if (input.name !== undefined) {
      await this.assertNameFree(tenantId, input.name, id);
    }
    await this.prisma.referrer.update({
      where: { id },
      data: {
        name: input.name,
        phone: input.phone === undefined ? undefined : input.phone,
        category: input.category === undefined ? undefined : input.category,
        commissionBps:
          input.commissionBps === undefined ? undefined : input.commissionBps,
        isActive: input.isActive,
      },
    });
    return this.getReferrer(tenantId, id);
  }

  /** Soft delete while cases or payments reference it, hard delete otherwise. */
  async removeReferrer(tenantId: string, id: string): Promise<DeleteResult> {
    await this.findReferrer(tenantId, id);
    const [cases, payments] = await Promise.all([
      this.prisma.case.count({ where: { tenantId, referrerId: id } }),
      this.prisma.referralPayment.count({
        where: { tenantId, referrerId: id },
      }),
    ]);
    if (cases + payments > 0) {
      await this.prisma.referrer.update({
        where: { id },
        data: { isActive: false },
      });
      return { id, softDeleted: true };
    }
    await this.prisma.referrer.delete({ where: { id } });
    return { id, softDeleted: false };
  }

  // --- referral payments -------------------------------------------

  async listPayments(
    tenantId: string,
    filter: ReferralPaymentListQuery,
  ): Promise<ReferralPaymentDto[]> {
    const rows = await this.prisma.referralPayment.findMany({
      where: { tenantId, referrerId: filter.referrerId },
      include: referralPaymentInclude,
      orderBy: { paidAt: 'desc' },
      take: LIST_LIMIT,
    });
    return rows.map(toReferralPaymentDto);
  }

  /**
   * The payment amount is always entered explicitly. `commissionBps` on the
   * referrer is a suggestion the UI may show; a payment is never auto-derived
   * from it.
   */
  async createPayment(
    tenantId: string,
    createdById: string,
    input: CreateReferralPaymentInput,
  ): Promise<ReferralPaymentDto> {
    await this.findReferrer(tenantId, input.referrerId);
    const created = await this.prisma.referralPayment.create({
      data: {
        tenantId,
        referrerId: input.referrerId,
        amountMinor: input.amountMinor,
        paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
        periodFrom: input.periodFrom ? parseIsoDate(input.periodFrom) : null,
        periodTo: input.periodTo ? parseIsoDate(input.periodTo) : null,
        note: input.note ?? null,
      },
      include: referralPaymentInclude,
    });
    return toReferralPaymentDto(created);
  }

  // --- stats -----------------------------------------------------

  /**
   * `caseCount`, `referredNetMinor` and `paidMinor` for a set of referrers, all
   * from grouped queries — never a per-referrer round trip.
   */
  private async statsFor(
    tenantId: string,
    referrerIds: string[],
  ): Promise<Map<string, ReferrerStats>> {
    const map = new Map<string, ReferrerStats>();
    if (referrerIds.length === 0) return map;
    for (const id of referrerIds) map.set(id, { ...EMPTY_REFERRER_STATS });

    const [caseGroups, paymentGroups, cases] = await Promise.all([
      this.prisma.case.groupBy({
        by: ['referrerId'],
        where: { tenantId, referrerId: { in: referrerIds } },
        _count: { _all: true },
      }),
      this.prisma.referralPayment.groupBy({
        by: ['referrerId'],
        where: { tenantId, referrerId: { in: referrerIds } },
        _sum: { amountMinor: true },
      }),
      this.prisma.case.findMany({
        where: { tenantId, referrerId: { in: referrerIds } },
        select: { id: true, referrerId: true },
      }),
    ]);

    for (const g of caseGroups) {
      if (!g.referrerId) continue;
      const stats = map.get(g.referrerId);
      if (stats) stats.caseCount = g._count._all;
    }
    for (const g of paymentGroups) {
      const stats = map.get(g.referrerId);
      if (stats) stats.paidMinor = g._sum.amountMinor ?? 0;
    }

    const referrerByCase = new Map(
      cases.map((c) => [c.id, c.referrerId as string]),
    );
    if (referrerByCase.size > 0) {
      const billGroups = await this.prisma.billItem.groupBy({
        by: ['caseId'],
        where: {
          tenantId,
          caseId: { in: [...referrerByCase.keys()] },
          // A cancelled line was never really billed.
          status: { not: 'cancelled' },
        },
        _sum: { netMinor: true },
      });
      for (const g of billGroups) {
        const referrerId = referrerByCase.get(g.caseId);
        const stats = referrerId ? map.get(referrerId) : undefined;
        if (stats) stats.referredNetMinor += g._sum.netMinor ?? 0;
      }
    }

    return map;
  }

  private async findReferrer(tenantId: string, id: string) {
    const found = await this.prisma.referrer.findFirst({
      where: { id, tenantId },
    });
    if (!found) throw new NotFoundException('Referrer not found');
    return found;
  }

  private async assertNameFree(
    tenantId: string,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const clash = await this.prisma.referrer.findFirst({
      where: {
        tenantId,
        name,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException('A referrer with that name already exists');
    }
  }
}
