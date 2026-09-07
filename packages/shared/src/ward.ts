import { z } from 'zod';
import { booleanQuery } from './common.js';

/**
 * Beds, wards and floors are entered by each hospital. A seven-bed clinic and a
 * seventy-bed hospital run identical code — capacity is data, never a tier.
 */

export const bedBlockReasonSchema = z.enum([
  'cleaning',
  'maintenance',
  'reserved',
  'other',
]);
export type BedBlockReason = z.infer<typeof bedBlockReasonSchema>;

export const BED_BLOCK_REASON_LABELS: Record<BedBlockReason, string> = {
  cleaning: 'Cleaning',
  maintenance: 'Maintenance',
  reserved: 'Reserved',
  other: 'Other',
};

/**
 * What the board shows. Only `blocked` is a stored decision — `occupied` is
 * derived from an open bed assignment, so the board can never disagree with who
 * is actually lying in the bed.
 */
export const bedStatusSchema = z.enum(['available', 'occupied', 'blocked']);
export type BedStatus = z.infer<typeof bedStatusSchema>;

export const BED_STATUS_LABELS: Record<BedStatus, string> = {
  available: 'Available',
  occupied: 'Occupied',
  blocked: 'Blocked',
};

/** Server and client must agree on what a bed's state is. */
export function bedStatusOf(input: {
  isBlocked: boolean;
  occupantAdmissionId?: string | null;
}): BedStatus {
  if (input.occupantAdmissionId) return 'occupied';
  if (input.isBlocked) return 'blocked';
  return 'available';
}

// --- floors ----------------------------------------------------------------

export const createFloorSchema = z.object({
  name: z.string().trim().min(1).max(80),
  sortOrder: z.number().int().min(0).max(999).optional(),
});
export const updateFloorSchema = createFloorSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export const floorSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});
export type Floor = z.infer<typeof floorSchema>;

// --- bed types -------------------------------------------------------------

export const createBedTypeSchema = z.object({
  name: z.string().trim().min(1).max(80),
  /** Suggested nightly rate. What the patient pays is set on their bill. */
  defaultNightlyRateMinor: z.number().int().min(0).nullish(),
});
export const updateBedTypeSchema = createBedTypeSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export const bedTypeSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  defaultNightlyRateMinor: z.number().int().nullable(),
  isActive: z.boolean(),
});
export type BedType = z.infer<typeof bedTypeSchema>;

// --- wards -----------------------------------------------------------------

export const createWardSchema = z.object({
  floorId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
});
export const updateWardSchema = createWardSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export const wardSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  isActive: z.boolean(),
  floor: floorSchema,
});
export type Ward = z.infer<typeof wardSchema>;

// --- beds ------------------------------------------------------------------

export const createBedSchema = z.object({
  wardId: z.string().uuid(),
  bedTypeId: z.string().uuid(),
  name: z.string().trim().min(1).max(40),
});
export const updateBedSchema = createBedSchema.partial().extend({
  isActive: z.boolean().optional(),
});

/** Add several beds at once — nobody wants to type GF-101 … GF-120 by hand. */
export const createBedRangeSchema = z.object({
  wardId: z.string().uuid(),
  bedTypeId: z.string().uuid(),
  prefix: z.string().trim().min(1).max(20),
  from: z.number().int().min(0).max(9999),
  to: z.number().int().min(0).max(9999),
  /** Zero-pad the number to this width, e.g. 3 gives GF-101. */
  pad: z.number().int().min(1).max(6).optional(),
});
export type CreateBedRangeInput = z.infer<typeof createBedRangeSchema>;

export const blockBedSchema = z.object({
  reason: bedBlockReasonSchema,
  note: z.string().trim().max(300).optional(),
});

export const bedOccupantSchema = z.object({
  admissionId: z.string().uuid(),
  admissionNo: z.string(),
  patientId: z.string().uuid(),
  patientName: z.string(),
  mrn: z.string(),
  admittedAt: z.string(),
});
export type BedOccupant = z.infer<typeof bedOccupantSchema>;

export const bedSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  isActive: z.boolean(),
  isBlocked: z.boolean(),
  blockReason: bedBlockReasonSchema.nullable(),
  blockNote: z.string().nullable(),
  bedType: bedTypeSchema,
  ward: z.object({
    id: z.string().uuid(),
    name: z.string(),
    floor: z.object({ id: z.string().uuid(), name: z.string() }),
  }),
  status: bedStatusSchema,
  occupant: bedOccupantSchema.nullable(),
});
export type Bed = z.infer<typeof bedSchema>;

/** The ward board, grouped the way a nursing station reads it. */
export const bedBoardSchema = z.object({
  totals: z.object({
    total: z.number().int(),
    occupied: z.number().int(),
    available: z.number().int(),
    blocked: z.number().int(),
  }),
  floors: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      wards: z.array(
        z.object({
          id: z.string().uuid(),
          name: z.string(),
          beds: z.array(bedSchema),
        }),
      ),
    }),
  ),
});
export type BedBoard = z.infer<typeof bedBoardSchema>;

export const bedListQuerySchema = z.object({
  wardId: z.string().uuid().optional(),
  status: bedStatusSchema.optional(),
  includeInactive: booleanQuery.optional(),
});
