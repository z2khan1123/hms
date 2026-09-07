import type {
  MedicineBatch,
  MedicineCategory,
  Prisma,
} from '@prisma/client';
import {
  type AllergySeverity,
  type AllergyWarning,
  type Dispense as DispenseDto,
  matchAllergy,
  type Medicine as MedicineDto,
  type MedicineBatch as MedicineBatchDto,
  type MedicineCategory as MedicineCategoryDto,
  type Purchase as PurchaseDto,
} from '@hms/shared';
import { toIsoDate } from '../../common/util/dates.js';
import {
  patientSummarySelect,
  toPatientSummary,
} from '../patients/patients.mapper.js';

// --- categories ---------------------------------------------------------------

export function toMedicineCategoryDto(c: MedicineCategory): MedicineCategoryDto {
  return { id: c.id, name: c.name, isActive: c.isActive };
}

// --- medicines --------------------------------------------------------------

export const medicineInclude = { category: true } as const;

export type MedicineRow = Prisma.MedicineGetPayload<{
  include: typeof medicineInclude;
}>;

/** Stock is never stored on the medicine; it is summed from live batches. */
export interface MedicineStock {
  /** Summed across batches that have not expired. */
  stockOnHand: number;
  /** Earliest expiry still holding stock. */
  nextExpiryDate: string | null;
}

export const EMPTY_STOCK: MedicineStock = {
  stockOnHand: 0,
  nextExpiryDate: null,
};

export function toMedicineDto(
  m: MedicineRow,
  stock: MedicineStock,
): MedicineDto {
  return {
    id: m.id,
    name: m.name,
    genericName: m.genericName,
    category: m.category ? toMedicineCategoryDto(m.category) : null,
    company: m.company,
    strength: m.strength,
    unit: m.unit,
    reorderLevel: m.reorderLevel,
    allergenKeywords: m.allergenKeywords,
    isActive: m.isActive,
    stockOnHand: stock.stockOnHand,
    belowReorderLevel:
      m.reorderLevel !== null && stock.stockOnHand <= m.reorderLevel,
    nextExpiryDate: stock.nextExpiryDate,
  };
}

// --- batches --------------------------------------------------------------

/** A batch is expired the moment its expiry date falls before the current day. */
export function isBatchExpired(expiryDate: Date, asOf: Date): boolean {
  return expiryDate.getTime() < asOf.getTime();
}

export function toMedicineBatchDto(
  b: MedicineBatch,
  medicineName: string,
  asOf: Date,
): MedicineBatchDto {
  return {
    id: b.id,
    medicineId: b.medicineId,
    medicineName,
    batchNo: b.batchNo,
    expiryDate: toIsoDate(b.expiryDate),
    quantity: b.quantity,
    purchasePriceMinor: b.purchasePriceMinor,
    salePriceMinor: b.salePriceMinor,
    isExpired: isBatchExpired(b.expiryDate, asOf),
  };
}

// --- purchases --------------------------------------------------------------

export const purchaseInclude = {
  items: { include: { medicine: { select: { name: true } } } },
} as const;

export type PurchaseRow = Prisma.MedicinePurchaseGetPayload<{
  include: typeof purchaseInclude;
}>;

export function toPurchaseDto(p: PurchaseRow): PurchaseDto {
  return {
    id: p.id,
    supplierName: p.supplierName,
    invoiceNo: p.invoiceNo,
    purchasedAt: p.purchasedAt.toISOString(),
    note: p.note,
    totalMinor: p.totalMinor,
    items: p.items.map((it) => ({
      id: it.id,
      medicineId: it.medicineId,
      medicineName: it.medicine.name,
      batchNo: it.batchNo,
      expiryDate: toIsoDate(it.expiryDate),
      quantity: it.quantity,
      purchasePriceMinor: it.purchasePriceMinor,
      salePriceMinor: it.salePriceMinor,
      lineTotalMinor: it.lineTotalMinor,
    })),
  };
}

// --- dispensing --------------------------------------------------------------

export const dispenseInclude = {
  patient: { select: patientSummarySelect },
  case: { select: { caseNo: true } },
  items: true,
} as const;

export type DispenseRow = Prisma.DispenseGetPayload<{
  include: typeof dispenseInclude;
}>;

// --- the safety check ------------------------------------------------------

export interface AllergyCandidateMedicine {
  id: string;
  name: string;
  genericName: string | null;
  allergenKeywords: string[];
}

export interface RecordedAllergy {
  substance: string;
  reaction: string | null;
  severity: AllergySeverity;
}

/**
 * One `AllergyWarning` for every (medicine, recorded allergy) pair that
 * `matchAllergy` — the shared function the prescribing screen also runs — says
 * collides. Pure so it can be tested without a database, and so the decision of
 * "what counts as a collision" stays entirely in `@hms/shared`.
 */
export function collectAllergyWarnings(
  medicines: readonly AllergyCandidateMedicine[],
  allergies: readonly RecordedAllergy[],
): AllergyWarning[] {
  const warnings: AllergyWarning[] = [];
  for (const medicine of medicines) {
    for (const allergy of allergies) {
      const matchedKeyword = matchAllergy(
        {
          name: medicine.name,
          genericName: medicine.genericName,
          allergenKeywords: medicine.allergenKeywords,
        },
        allergy.substance,
      );
      if (matchedKeyword) {
        warnings.push({
          medicineId: medicine.id,
          medicineName: medicine.name,
          substance: allergy.substance,
          severity: allergy.severity,
          reaction: allergy.reaction,
          matchedKeyword,
        });
      }
    }
  }
  return warnings;
}

export function toDispenseDto(d: DispenseRow): DispenseDto {
  return {
    id: d.id,
    patient: toPatientSummary(d.patient),
    caseId: d.caseId,
    caseNo: d.case.caseNo,
    dispensedAt: d.dispensedAt.toISOString(),
    dispensedBy: d.dispensedById,
    note: d.note,
    billItemId: d.billItemId,
    totalMinor: d.items.reduce((sum, it) => sum + it.lineTotalMinor, 0),
    items: d.items.map((it) => ({
      id: it.id,
      medicineId: it.medicineId,
      medicineName: it.medicineName,
      batchNo: it.batchNo,
      quantity: it.quantity,
      unitPriceMinor: it.unitPriceMinor,
      lineTotalMinor: it.lineTotalMinor,
    })),
  };
}
