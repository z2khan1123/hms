import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  CreateExpenseInput,
  CreateIncomeInput,
  LedgerEntry,
  LedgerHead,
  LedgerSummary,
} from '@hms/shared';
import { parseIsoDate } from '../../common/util/dates.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { FinanceSummaryQuery } from './finance.query.js';
import {
  expenseInclude,
  incomeInclude,
  isSameCalendarDay,
  toExpenseEntryDto,
  toIncomeEntryDto,
  toLedgerHeadDto,
} from './finance.mapper.js';

interface HeadBody {
  name: string;
}

interface LedgerListFilter {
  headId?: string;
  from?: string;
  to?: string;
  q?: string;
}

type DeleteResult = { id: string; softDeleted: boolean };

const LIST_LIMIT = 1000;

/** Inclusive `[from, to]` calendar window -> a `movedAt`/`receivedAt` range. */
function dateRange(
  from?: string,
  to?: string,
): { gte?: Date; lt?: Date } | undefined {
  if (!from && !to) return undefined;
  const range: { gte?: Date; lt?: Date } = {};
  if (from) range.gte = parseIsoDate(from);
  if (to) {
    const end = parseIsoDate(to);
    end.setUTCDate(end.getUTCDate() + 1);
    range.lt = end;
  }
  return range;
}

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  // --- income heads -----------------------------------------------------

  async listIncomeHeads(tenantId: string): Promise<LedgerHead[]> {
    const rows = await this.prisma.incomeHead.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
    return rows.map(toLedgerHeadDto);
  }

  async createIncomeHead(
    tenantId: string,
    input: HeadBody,
  ): Promise<LedgerHead> {
    await this.assertHeadNameFree('income', tenantId, input.name);
    const created = await this.prisma.incomeHead.create({
      data: { tenantId, name: input.name },
    });
    return toLedgerHeadDto(created);
  }

  async updateIncomeHead(
    tenantId: string,
    id: string,
    input: Partial<HeadBody> & { isActive?: boolean },
  ): Promise<LedgerHead> {
    await this.findIncomeHead(tenantId, id);
    if (input.name !== undefined) {
      await this.assertHeadNameFree('income', tenantId, input.name, id);
    }
    const updated = await this.prisma.incomeHead.update({
      where: { id },
      data: { name: input.name, isActive: input.isActive },
    });
    return toLedgerHeadDto(updated);
  }

  /** Soft delete while entries reference it, hard delete otherwise. */
  async removeIncomeHead(
    tenantId: string,
    id: string,
  ): Promise<DeleteResult> {
    await this.findIncomeHead(tenantId, id);
    const inUse = await this.prisma.income.count({
      where: { tenantId, headId: id },
    });
    if (inUse > 0) {
      await this.prisma.incomeHead.update({
        where: { id },
        data: { isActive: false },
      });
      return { id, softDeleted: true };
    }
    await this.prisma.incomeHead.delete({ where: { id } });
    return { id, softDeleted: false };
  }

  // --- expense heads --------------------------------------------------

  async listExpenseHeads(tenantId: string): Promise<LedgerHead[]> {
    const rows = await this.prisma.expenseHead.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
    return rows.map(toLedgerHeadDto);
  }

  async createExpenseHead(
    tenantId: string,
    input: HeadBody,
  ): Promise<LedgerHead> {
    await this.assertHeadNameFree('expense', tenantId, input.name);
    const created = await this.prisma.expenseHead.create({
      data: { tenantId, name: input.name },
    });
    return toLedgerHeadDto(created);
  }

  async updateExpenseHead(
    tenantId: string,
    id: string,
    input: Partial<HeadBody> & { isActive?: boolean },
  ): Promise<LedgerHead> {
    await this.findExpenseHead(tenantId, id);
    if (input.name !== undefined) {
      await this.assertHeadNameFree('expense', tenantId, input.name, id);
    }
    const updated = await this.prisma.expenseHead.update({
      where: { id },
      data: { name: input.name, isActive: input.isActive },
    });
    return toLedgerHeadDto(updated);
  }

  async removeExpenseHead(
    tenantId: string,
    id: string,
  ): Promise<DeleteResult> {
    await this.findExpenseHead(tenantId, id);
    const inUse = await this.prisma.expense.count({
      where: { tenantId, headId: id },
    });
    if (inUse > 0) {
      await this.prisma.expenseHead.update({
        where: { id },
        data: { isActive: false },
      });
      return { id, softDeleted: true };
    }
    await this.prisma.expenseHead.delete({ where: { id } });
    return { id, softDeleted: false };
  }

  // --- income entries -----------------------------------------------

  async listIncome(
    tenantId: string,
    filter: LedgerListFilter,
  ): Promise<LedgerEntry[]> {
    const where: Prisma.IncomeWhereInput = {
      tenantId,
      headId: filter.headId,
      receivedAt: dateRange(filter.from, filter.to),
      ...(filter.q ? { OR: textSearch(filter.q) } : {}),
    };
    const rows = await this.prisma.income.findMany({
      where,
      include: incomeInclude,
      orderBy: { receivedAt: 'desc' },
      take: LIST_LIMIT,
    });
    return rows.map(toIncomeEntryDto);
  }

  async createIncome(
    tenantId: string,
    createdById: string,
    input: CreateIncomeInput,
  ): Promise<LedgerEntry> {
    await this.assertActiveHead('income', tenantId, input.headId);
    const created = await this.prisma.income.create({
      data: {
        tenantId,
        headId: input.headId,
        description: input.description,
        amountMinor: input.amountMinor,
        receivedAt: input.receivedAt ? new Date(input.receivedAt) : new Date(),
        invoiceNo: input.invoiceNo ?? null,
        note: input.note ?? null,
        createdById,
      },
      include: incomeInclude,
    });
    return toIncomeEntryDto(created);
  }

  async removeIncome(tenantId: string, id: string): Promise<DeleteResult> {
    const entry = await this.prisma.income.findFirst({
      where: { id, tenantId },
      select: { id: true, createdAt: true },
    });
    if (!entry) throw new NotFoundException('Income entry not found');
    await this.assertDeletableToday(tenantId, entry.createdAt);
    await this.prisma.income.delete({ where: { id } });
    return { id, softDeleted: false };
  }

  // --- expense entries --------------------------------------------

  async listExpenses(
    tenantId: string,
    filter: LedgerListFilter,
  ): Promise<LedgerEntry[]> {
    const where: Prisma.ExpenseWhereInput = {
      tenantId,
      headId: filter.headId,
      paidAt: dateRange(filter.from, filter.to),
      ...(filter.q ? { OR: textSearch(filter.q) } : {}),
    };
    const rows = await this.prisma.expense.findMany({
      where,
      include: expenseInclude,
      orderBy: { paidAt: 'desc' },
      take: LIST_LIMIT,
    });
    return rows.map(toExpenseEntryDto);
  }

  async createExpense(
    tenantId: string,
    createdById: string,
    input: CreateExpenseInput,
  ): Promise<LedgerEntry> {
    await this.assertActiveHead('expense', tenantId, input.headId);
    const created = await this.prisma.expense.create({
      data: {
        tenantId,
        headId: input.headId,
        description: input.description,
        amountMinor: input.amountMinor,
        paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
        invoiceNo: input.invoiceNo ?? null,
        note: input.note ?? null,
        createdById,
      },
      include: expenseInclude,
    });
    return toExpenseEntryDto(created);
  }

  async removeExpense(tenantId: string, id: string): Promise<DeleteResult> {
    const entry = await this.prisma.expense.findFirst({
      where: { id, tenantId },
      select: { id: true, createdAt: true },
    });
    if (!entry) throw new NotFoundException('Expense entry not found');
    await this.assertDeletableToday(tenantId, entry.createdAt);
    await this.prisma.expense.delete({ where: { id } });
    return { id, softDeleted: false };
  }

  // --- summary ---------------------------------------------------

  /**
   * Period totals plus per-head breakdowns, computed entirely by the database
   * (`aggregate` + `groupBy`). This is money — it is never summed in JavaScript
   * over an unbounded row set.
   */
  async summary(
    tenantId: string,
    query: FinanceSummaryQuery,
  ): Promise<LedgerSummary> {
    const incomeWhere: Prisma.IncomeWhereInput = {
      tenantId,
      receivedAt: dateRange(query.from, query.to),
    };
    const expenseWhere: Prisma.ExpenseWhereInput = {
      tenantId,
      paidAt: dateRange(query.from, query.to),
    };

    const [incomeAgg, expenseAgg, incomeGroups, expenseGroups] =
      await Promise.all([
        this.prisma.income.aggregate({
          where: incomeWhere,
          _sum: { amountMinor: true },
        }),
        this.prisma.expense.aggregate({
          where: expenseWhere,
          _sum: { amountMinor: true },
        }),
        this.prisma.income.groupBy({
          by: ['headId'],
          where: incomeWhere,
          _sum: { amountMinor: true },
        }),
        this.prisma.expense.groupBy({
          by: ['headId'],
          where: expenseWhere,
          _sum: { amountMinor: true },
        }),
      ]);

    const incomeMinor = incomeAgg._sum.amountMinor ?? 0;
    const expenseMinor = expenseAgg._sum.amountMinor ?? 0;

    const [incomeHeads, expenseHeads] = await Promise.all([
      this.prisma.incomeHead.findMany({
        where: { tenantId, id: { in: incomeGroups.map((g) => g.headId) } },
        select: { id: true, name: true },
      }),
      this.prisma.expenseHead.findMany({
        where: { tenantId, id: { in: expenseGroups.map((g) => g.headId) } },
        select: { id: true, name: true },
      }),
    ]);

    const incomeName = new Map(incomeHeads.map((h) => [h.id, h.name]));
    const expenseName = new Map(expenseHeads.map((h) => [h.id, h.name]));

    return {
      incomeMinor,
      expenseMinor,
      netMinor: incomeMinor - expenseMinor,
      byIncomeHead: incomeGroups
        .map((g) => ({
          headId: g.headId,
          name: incomeName.get(g.headId) ?? '(unknown)',
          amountMinor: g._sum.amountMinor ?? 0,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      byExpenseHead: expenseGroups
        .map((g) => ({
          headId: g.headId,
          name: expenseName.get(g.headId) ?? '(unknown)',
          amountMinor: g._sum.amountMinor ?? 0,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  // --- lookups -------------------------------------------------

  private async assertDeletableToday(
    tenantId: string,
    createdAt: Date,
  ): Promise<void> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { timezone: true },
    });
    if (!isSameCalendarDay(createdAt, new Date(), tenant.timezone)) {
      throw new ConflictException(
        'A ledger entry can only be deleted on the day it was created; ' +
          'after that it must be corrected with a compensating entry.',
      );
    }
  }

  private async findIncomeHead(tenantId: string, id: string) {
    const found = await this.prisma.incomeHead.findFirst({
      where: { id, tenantId },
    });
    if (!found) throw new NotFoundException('Income head not found');
    return found;
  }

  private async findExpenseHead(tenantId: string, id: string) {
    const found = await this.prisma.expenseHead.findFirst({
      where: { id, tenantId },
    });
    if (!found) throw new NotFoundException('Expense head not found');
    return found;
  }

  private async assertActiveHead(
    kind: 'income' | 'expense',
    tenantId: string,
    id: string,
  ): Promise<void> {
    const found =
      kind === 'income'
        ? await this.prisma.incomeHead.findFirst({
            where: { id, tenantId, isActive: true },
            select: { id: true },
          })
        : await this.prisma.expenseHead.findFirst({
            where: { id, tenantId, isActive: true },
            select: { id: true },
          });
    if (!found) throw new BadRequestException(`Unknown ${kind} head`);
  }

  private async assertHeadNameFree(
    kind: 'income' | 'expense',
    tenantId: string,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const where = {
      tenantId,
      name,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    };
    const clash =
      kind === 'income'
        ? await this.prisma.incomeHead.findFirst({
            where,
            select: { id: true },
          })
        : await this.prisma.expenseHead.findFirst({
            where,
            select: { id: true },
          });
    if (clash) {
      throw new ConflictException(
        `A${kind === 'expense' ? 'n' : ''} ${kind} head with that name already exists`,
      );
    }
  }
}

function textSearch(
  q: string,
): { [field: string]: { contains: string; mode: 'insensitive' } }[] {
  return [
    { description: { contains: q, mode: 'insensitive' } },
    { invoiceNo: { contains: q, mode: 'insensitive' } },
    { note: { contains: q, mode: 'insensitive' } },
  ];
}
