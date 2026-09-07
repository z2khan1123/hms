import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  type AllergyWarning,
  type CreateMedicineInput,
  type CreateDispenseInput,
  type CreatePurchaseInput,
  type Dispense as DispenseDto,
  type Medicine as MedicineDto,
  type MedicineBatch as MedicineBatchDto,
  type MedicineCategory as MedicineCategoryDto,
  type Purchase as PurchaseDto,
} from '@hms/shared';
import { parseIsoDate, toIsoDate } from '../../common/util/dates.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BillingService } from '../billing/billing.service.js';
import { CasesService } from '../cases/cases.service.js';
import type {
  AllergyCheckInput,
  BatchListQuery,
  DispenseListQuery,
} from './pharmacy.query.js';
import {
  collectAllergyWarnings,
  dispenseInclude,
  EMPTY_STOCK,
  medicineInclude,
  type MedicineStock,
  purchaseInclude,
  toDispenseDto,
  toMedicineBatchDto,
  toMedicineCategoryDto,
  toMedicineDto,
  toPurchaseDto,
} from './pharmacy.mapper.js';

interface CategoryBody {
  name: string;
}

export interface MedicineListFilter {
  q?: string;
  categoryId?: string;
  lowStockOnly?: boolean;
  includeInactive?: boolean;
}

type UpdateMedicineBody = Partial<CreateMedicineInput> & {
  genericName?: string | null;
  categoryId?: string | null;
  company?: string | null;
  strength?: string | null;
  unit?: string | null;
  reorderLevel?: number | null;
  isActive?: boolean;
};

type DeleteResult = { id: string; softDeleted: boolean };

const LIST_LIMIT = 1000;

@Injectable()
export class PharmacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly cases: CasesService,
  ) {}

  // --- categories ----------------------------------------------------------

  async listCategories(tenantId: string): Promise<MedicineCategoryDto[]> {
    const rows = await this.prisma.medicineCategory.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
    return rows.map(toMedicineCategoryDto);
  }

  async createCategory(
    tenantId: string,
    input: CategoryBody,
  ): Promise<MedicineCategoryDto> {
    const clash = await this.prisma.medicineCategory.findFirst({
      where: { tenantId, name: input.name },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException(
        'A medicine category with that name already exists',
      );
    }
    const created = await this.prisma.medicineCategory.create({
      data: { tenantId, name: input.name },
    });
    return toMedicineCategoryDto(created);
  }

  // --- medicines ---------------------------------------------------------

  async listMedicines(
    tenantId: string,
    filter: MedicineListFilter,
  ): Promise<MedicineDto[]> {
    const where: Prisma.MedicineWhereInput = {
      tenantId,
      categoryId: filter.categoryId,
      ...(filter.includeInactive ? {} : { isActive: true }),
      ...(filter.q
        ? {
            OR: [
              { name: { contains: filter.q, mode: 'insensitive' } },
              { genericName: { contains: filter.q, mode: 'insensitive' } },
              { company: { contains: filter.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.medicine.findMany({
      where,
      include: medicineInclude,
      orderBy: { name: 'asc' },
      take: LIST_LIMIT,
    });

    const stock = await this.stockFor(
      tenantId,
      rows.map((r) => r.id),
    );
    const dtos = rows.map((r) =>
      toMedicineDto(r, stock.get(r.id) ?? EMPTY_STOCK),
    );
    return filter.lowStockOnly
      ? dtos.filter((d) => d.belowReorderLevel)
      : dtos;
  }

  async getMedicine(tenantId: string, id: string): Promise<MedicineDto> {
    const row = await this.prisma.medicine.findFirst({
      where: { id, tenantId },
      include: medicineInclude,
    });
    if (!row) throw new NotFoundException('Medicine not found');
    const stock = await this.stockFor(tenantId, [id]);
    return toMedicineDto(row, stock.get(id) ?? EMPTY_STOCK);
  }

  async createMedicine(
    tenantId: string,
    input: CreateMedicineInput,
  ): Promise<MedicineDto> {
    if (input.categoryId) await this.assertCategory(tenantId, input.categoryId);
    await this.assertMedicineNameFree(
      tenantId,
      input.name,
      input.strength ?? null,
    );
    const created = await this.prisma.medicine.create({
      data: {
        tenantId,
        name: input.name,
        genericName: input.genericName ?? null,
        categoryId: input.categoryId ?? null,
        company: input.company ?? null,
        strength: input.strength ?? null,
        unit: input.unit ?? null,
        reorderLevel: input.reorderLevel ?? null,
        allergenKeywords: input.allergenKeywords ?? [],
      },
      include: medicineInclude,
    });
    return toMedicineDto(created, EMPTY_STOCK);
  }

  async updateMedicine(
    tenantId: string,
    id: string,
    input: UpdateMedicineBody,
  ): Promise<MedicineDto> {
    const existing = await this.prisma.medicine.findFirst({
      where: { id, tenantId },
      select: { id: true, name: true, strength: true },
    });
    if (!existing) throw new NotFoundException('Medicine not found');
    if (input.categoryId) await this.assertCategory(tenantId, input.categoryId);

    if (input.name !== undefined || input.strength !== undefined) {
      const name = input.name ?? existing.name;
      const strength =
        input.strength !== undefined ? input.strength : existing.strength;
      await this.assertMedicineNameFree(tenantId, name, strength ?? null, id);
    }

    const updated = await this.prisma.medicine.update({
      where: { id },
      data: {
        name: input.name,
        genericName:
          input.genericName === undefined ? undefined : input.genericName,
        categoryId:
          input.categoryId === undefined ? undefined : input.categoryId,
        company: input.company === undefined ? undefined : input.company,
        strength: input.strength === undefined ? undefined : input.strength,
        unit: input.unit === undefined ? undefined : input.unit,
        reorderLevel:
          input.reorderLevel === undefined ? undefined : input.reorderLevel,
        allergenKeywords: input.allergenKeywords ?? undefined,
        isActive: input.isActive,
      },
      include: medicineInclude,
    });
    const stock = await this.stockFor(tenantId, [id]);
    return toMedicineDto(updated, stock.get(id) ?? EMPTY_STOCK);
  }

  /**
   * Soft delete (`isActive = false`) while any batch, dispense item or
   * prescription item still points at the medicine; hard delete when nothing
   * does. History is never rewritten.
   */
  async removeMedicine(tenantId: string, id: string): Promise<DeleteResult> {
    const existing = await this.prisma.medicine.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Medicine not found');

    const [batches, dispenseItems, prescriptionItems] =
      await this.prisma.$transaction([
        this.prisma.medicineBatch.count({ where: { tenantId, medicineId: id } }),
        this.prisma.dispenseItem.count({ where: { tenantId, medicineId: id } }),
        this.prisma.prescriptionItem.count({
          where: { tenantId, medicineId: id },
        }),
      ]);

    if (batches + dispenseItems + prescriptionItems > 0) {
      await this.prisma.medicine.update({
        where: { id },
        data: { isActive: false },
      });
      return { id, softDeleted: true };
    }
    await this.prisma.medicine.delete({ where: { id } });
    return { id, softDeleted: false };
  }

  // --- batches / stock -------------------------------------------------

  async listBatches(
    tenantId: string,
    filter: BatchListQuery,
  ): Promise<MedicineBatchDto[]> {
    const asOf = startOfToday();
    const where: Prisma.MedicineBatchWhereInput = {
      tenantId,
      medicineId: filter.medicineId,
      ...(filter.includeEmpty ? {} : { quantity: { gt: 0 } }),
      ...(filter.expiringInDays !== undefined
        ? { expiryDate: { lte: addDays(asOf, filter.expiringInDays) } }
        : {}),
    };
    const rows = await this.prisma.medicineBatch.findMany({
      where,
      include: { medicine: { select: { name: true } } },
      orderBy: [{ expiryDate: 'asc' }, { batchNo: 'asc' }],
      take: LIST_LIMIT,
    });
    return rows.map((b) => toMedicineBatchDto(b, b.medicine.name, asOf));
  }

  // --- purchases -----------------------------------------------------

  async listPurchases(tenantId: string): Promise<PurchaseDto[]> {
    const rows = await this.prisma.medicinePurchase.findMany({
      where: { tenantId },
      include: purchaseInclude,
      orderBy: { purchasedAt: 'desc' },
      take: LIST_LIMIT,
    });
    return rows.map(toPurchaseDto);
  }

  async getPurchase(tenantId: string, id: string): Promise<PurchaseDto> {
    const row = await this.prisma.medicinePurchase.findFirst({
      where: { id, tenantId },
      include: purchaseInclude,
    });
    if (!row) throw new NotFoundException('Purchase not found');
    return toPurchaseDto(row);
  }

  /**
   * One transaction: create the purchase and its line items, then for every
   * line find-or-create the `MedicineBatch` keyed by
   * `(tenantId, medicineId, batchNo)` — adding to the quantity on hand when the
   * batch already exists, creating it when it does not — and refresh the
   * batch's expiry and prices from this delivery.
   */
  async createPurchase(
    tenantId: string,
    createdById: string,
    input: CreatePurchaseInput,
  ): Promise<PurchaseDto> {
    const id = await this.prisma.$transaction(async (tx) => {
      const medicineIds = [...new Set(input.items.map((i) => i.medicineId))];
      const known = await tx.medicine.findMany({
        where: { id: { in: medicineIds }, tenantId },
        select: { id: true },
      });
      if (known.length !== medicineIds.length) {
        throw new BadRequestException(
          'One or more medicines are not from this hospital',
        );
      }

      const items = input.items.map((it) => ({
        ...it,
        lineTotalMinor: it.quantity * it.purchasePriceMinor,
      }));
      const totalMinor = items.reduce((sum, it) => sum + it.lineTotalMinor, 0);

      const purchase = await tx.medicinePurchase.create({
        data: {
          tenantId,
          supplierName: input.supplierName,
          invoiceNo: input.invoiceNo ?? null,
          purchasedAt: input.purchasedAt
            ? new Date(input.purchasedAt)
            : new Date(),
          note: input.note ?? null,
          totalMinor,
          createdById,
          items: {
            create: items.map((it) => ({
              tenantId,
              medicineId: it.medicineId,
              batchNo: it.batchNo,
              expiryDate: parseIsoDate(it.expiryDate),
              quantity: it.quantity,
              purchasePriceMinor: it.purchasePriceMinor,
              salePriceMinor: it.salePriceMinor ?? null,
              lineTotalMinor: it.lineTotalMinor,
            })),
          },
        },
      });

      for (const it of items) {
        const expiryDate = parseIsoDate(it.expiryDate);
        const existing = await tx.medicineBatch.findUnique({
          where: {
            tenantId_medicineId_batchNo: {
              tenantId,
              medicineId: it.medicineId,
              batchNo: it.batchNo,
            },
          },
        });
        if (existing) {
          await tx.medicineBatch.update({
            where: { id: existing.id },
            data: {
              quantity: existing.quantity + it.quantity,
              expiryDate,
              purchasePriceMinor: it.purchasePriceMinor,
              salePriceMinor: it.salePriceMinor ?? existing.salePriceMinor,
            },
          });
        } else {
          await tx.medicineBatch.create({
            data: {
              tenantId,
              medicineId: it.medicineId,
              batchNo: it.batchNo,
              expiryDate,
              quantity: it.quantity,
              purchasePriceMinor: it.purchasePriceMinor,
              salePriceMinor: it.salePriceMinor ?? null,
            },
          });
        }
      }

      return purchase.id;
    });

    return this.getPurchase(tenantId, id);
  }

  // --- dispensing --------------------------------------------------

  async listDispenses(
    tenantId: string,
    filter: DispenseListQuery,
  ): Promise<DispenseDto[]> {
    const rows = await this.prisma.dispense.findMany({
      where: {
        tenantId,
        patientId: filter.patientId,
        caseId: filter.caseId,
      },
      include: dispenseInclude,
      orderBy: { dispensedAt: 'desc' },
      take: LIST_LIMIT,
    });
    return rows.map(toDispenseDto);
  }

  async getDispense(tenantId: string, id: string): Promise<DispenseDto> {
    const row = await this.prisma.dispense.findFirst({
      where: { id, tenantId },
      include: dispenseInclude,
    });
    if (!row) throw new NotFoundException('Dispense not found');
    return toDispenseDto(row);
  }

  /**
   * One transaction: resolve the case, draw every line from its batch (refusing
   * an expired batch or one without enough on hand), decrement the batch, then
   * post a SINGLE `BillItem` for the whole handover onto the case and link it
   * back as `Dispense.billItemId`. One handover, one line on the bill.
   */
  async createDispense(
    tenantId: string,
    dispensedById: string,
    input: CreateDispenseInput,
  ): Promise<DispenseDto> {
    const asOf = startOfToday();

    const id = await this.prisma.$transaction(async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: input.patientId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!patient) throw new BadRequestException('Unknown patient');

      const kase = await this.cases.findOrOpenInTx(tx, tenantId, dispensedById, {
        patientId: input.patientId,
        caseId: input.caseId,
      });

      let opdVisitId: string | null = null;
      if (input.opdVisitId) {
        const visit = await tx.opdVisit.findFirst({
          where: { id: input.opdVisitId, tenantId },
          select: { caseId: true },
        });
        if (!visit) throw new BadRequestException('Unknown OPD visit');
        if (visit.caseId !== kase.id) {
          throw new BadRequestException('That visit belongs to a different case');
        }
        opdVisitId = input.opdVisitId;
      }

      let admissionId: string | null = null;
      if (input.admissionId) {
        const admission = await tx.admission.findFirst({
          where: { id: input.admissionId, tenantId },
          select: { caseId: true },
        });
        if (!admission) throw new BadRequestException('Unknown admission');
        if (admission.caseId !== kase.id) {
          throw new BadRequestException(
            'That admission belongs to a different case',
          );
        }
        admissionId = input.admissionId;
      }

      const itemData: Prisma.DispenseItemCreateManyDispenseInput[] = [];
      let totalMinor = 0;

      for (const line of input.items) {
        // Re-read every iteration so two lines drawing on the same batch see
        // the running quantity, not a stale snapshot.
        const batch = await tx.medicineBatch.findFirst({
          where: { id: line.batchId, tenantId },
          include: { medicine: { select: { name: true } } },
        });
        if (!batch) throw new BadRequestException('Unknown batch');

        if (batch.expiryDate.getTime() < asOf.getTime()) {
          throw new ConflictException(
            `${batch.medicine.name} batch ${batch.batchNo} expired on ` +
              `${toIsoDate(batch.expiryDate)} and cannot be dispensed`,
          );
        }
        if (line.quantity > batch.quantity) {
          throw new ConflictException(
            `Only ${batch.quantity} unit(s) of ${batch.medicine.name} ` +
              `(batch ${batch.batchNo}) on hand; ${line.quantity} requested`,
          );
        }

        await tx.medicineBatch.update({
          where: { id: batch.id },
          data: { quantity: batch.quantity - line.quantity },
        });

        const unitPriceMinor =
          line.unitPriceMinor ?? batch.salePriceMinor ?? 0;
        const lineTotalMinor = unitPriceMinor * line.quantity;
        totalMinor += lineTotalMinor;

        itemData.push({
          tenantId,
          medicineId: batch.medicineId,
          batchId: batch.id,
          medicineName: batch.medicine.name,
          batchNo: batch.batchNo,
          quantity: line.quantity,
          unitPriceMinor,
          lineTotalMinor,
        });
      }

      const dispense = await tx.dispense.create({
        data: {
          tenantId,
          caseId: kase.id,
          patientId: input.patientId,
          opdVisitId,
          admissionId,
          dispensedById,
          note: input.note ?? null,
          items: { create: itemData },
        },
      });

      const billItem = await this.billing.addBillItemInTx(
        tx,
        tenantId,
        dispensedById,
        {
          caseId: kase.id,
          opdVisitId: opdVisitId ?? undefined,
          serviceName: 'Pharmacy',
          department: 'pharmacy',
          priceMinor: totalMinor,
          quantity: 1,
          billableStatuses: ['open', 'moved_to_ipd'],
        },
      );

      await tx.dispense.update({
        where: { id: dispense.id },
        data: { billItemId: billItem.id },
      });

      return dispense.id;
    });

    return this.getDispense(tenantId, id);
  }

  // --- the safety check ------------------------------------------

  /**
   * For every (medicine, recorded allergy) pair, ask the shared `matchAllergy`
   * whether they collide and return one `AllergyWarning` per hit. The matching
   * itself is never reimplemented here: the prescribing screen runs the same
   * function locally and the two must agree on what counts as a collision.
   */
  async allergyCheck(
    tenantId: string,
    input: AllergyCheckInput,
  ): Promise<AllergyWarning[]> {
    const patient = await this.prisma.patient.findFirst({
      where: { id: input.patientId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    const [allergies, medicines] = await this.prisma.$transaction([
      this.prisma.patientAllergy.findMany({
        where: { tenantId, patientId: input.patientId },
        orderBy: { recordedAt: 'desc' },
      }),
      this.prisma.medicine.findMany({
        where: { tenantId, id: { in: input.medicineIds } },
      }),
    ]);

    return collectAllergyWarnings(
      medicines.map((m) => ({
        id: m.id,
        name: m.name,
        genericName: m.genericName,
        allergenKeywords: m.allergenKeywords,
      })),
      allergies.map((a) => ({
        substance: a.substance,
        reaction: a.reaction,
        severity: a.severity,
      })),
    );
  }

  // --- helpers --------------------------------------------------

  /**
   * Grouped, not per-medicine: two `groupBy` queries give the live on-hand total
   * and the earliest in-stock expiry for a whole set of medicines at once.
   */
  private async stockFor(
    tenantId: string,
    medicineIds: string[],
  ): Promise<Map<string, MedicineStock>> {
    const map = new Map<string, MedicineStock>();
    if (medicineIds.length === 0) return map;

    const asOf = startOfToday();
    const nonExpired: Prisma.MedicineBatchWhereInput = {
      tenantId,
      medicineId: { in: medicineIds },
      expiryDate: { gte: asOf },
    };

    const [sums, expiries] = await this.prisma.$transaction([
      this.prisma.medicineBatch.groupBy({
        by: ['medicineId'],
        where: nonExpired,
        _sum: { quantity: true },
      }),
      this.prisma.medicineBatch.groupBy({
        by: ['medicineId'],
        where: { ...nonExpired, quantity: { gt: 0 } },
        _min: { expiryDate: true },
      }),
    ]);

    for (const id of medicineIds) map.set(id, { ...EMPTY_STOCK });
    for (const s of sums) {
      map.set(s.medicineId, {
        stockOnHand: s._sum.quantity ?? 0,
        nextExpiryDate: null,
      });
    }
    for (const e of expiries) {
      const current = map.get(e.medicineId) ?? { ...EMPTY_STOCK };
      current.nextExpiryDate = e._min.expiryDate
        ? toIsoDate(e._min.expiryDate)
        : null;
      map.set(e.medicineId, current);
    }
    return map;
  }

  private async assertCategory(tenantId: string, id: string): Promise<void> {
    const found = await this.prisma.medicineCategory.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!found) throw new BadRequestException('Unknown medicine category');
  }

  private async assertMedicineNameFree(
    tenantId: string,
    name: string,
    strength: string | null,
    exceptId?: string,
  ): Promise<void> {
    const clash = await this.prisma.medicine.findFirst({
      where: {
        tenantId,
        name,
        strength,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException(
        'A medicine with that name and strength already exists',
      );
    }
  }
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function addDays(base: Date, days: number): Date {
  const out = new Date(base);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}
