import { z } from 'zod';
import { isoDateSchema, isoDateTimeSchema, booleanQuery, phoneSchema } from './common.js';
import { patientSummarySchema } from './patient.js';

/**
 * Blood bank.
 *
 * The safety-critical part of this module is not the stock count — it is
 * `isCompatible`. Issuing the wrong ABO group is the classic fatal transfusion
 * error, and it is the kind of mistake software should make impossible rather
 * than merely record. The benchmarked product offers a group dropdown and
 * checks nothing.
 *
 * Stock is derived, never stored: a unit is available when it has not been
 * issued, discarded, or reached its expiry. There is no counter to drift.
 */

// --- groups and components -------------------------------------------------

export const bloodGroupSchema = z.enum([
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
]);
export type BloodGroup = z.infer<typeof bloodGroupSchema>;

export const BLOOD_GROUPS = bloodGroupSchema.options;

export const bloodComponentSchema = z.enum([
  'whole_blood',
  'packed_red_cells',
  'plasma',
  'platelets',
  'cryoprecipitate',
]);
export type BloodComponent = z.infer<typeof bloodComponentSchema>;

export const BLOOD_COMPONENT_LABELS: Record<BloodComponent, string> = {
  whole_blood: 'Whole blood',
  packed_red_cells: 'Packed red cells',
  plasma: 'Plasma',
  platelets: 'Platelets',
  cryoprecipitate: 'Cryoprecipitate',
};

/**
 * Typical shelf life in days from collection. A starting point for the expiry
 * date, which the bank always sets explicitly — the real figure depends on the
 * anticoagulant and whether the component was frozen, and no default should
 * quietly decide when blood stops being safe.
 */
export const COMPONENT_SHELF_LIFE_DAYS: Record<BloodComponent, number> = {
  whole_blood: 35,
  packed_red_cells: 42,
  plasma: 365,
  platelets: 5,
  cryoprecipitate: 365,
};

// --- the compatibility rule ------------------------------------------------

/** The antigens a group carries, and therefore what a recipient may receive. */
const RED_CELL_COMPATIBILITY: Record<BloodGroup, readonly BloodGroup[]> = {
  'O-': ['O-'],
  'O+': ['O-', 'O+'],
  'A-': ['O-', 'A-'],
  'A+': ['O-', 'O+', 'A-', 'A+'],
  'B-': ['O-', 'B-'],
  'B+': ['O-', 'O+', 'B-', 'B+'],
  'AB-': ['O-', 'A-', 'B-', 'AB-'],
  'AB+': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
};

/**
 * Plasma runs the OTHER WAY. Plasma carries antibodies rather than antigens, so
 * an AB donor — who has neither anti-A nor anti-B — is the universal plasma
 * donor, and an O recipient can take plasma from anyone. Getting this backwards
 * is a real and well-documented error, which is exactly why it is written down
 * once, here, with tests, instead of being re-derived at each call site.
 *
 * Rh is not a barrier for plasma, so only the ABO letter matters.
 */
const PLASMA_COMPATIBILITY: Record<BloodGroup, readonly BloodGroup[]> = {
  'O-': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
  'O+': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
  'A-': ['A-', 'A+', 'AB-', 'AB+'],
  'A+': ['A-', 'A+', 'AB-', 'AB+'],
  'B-': ['B-', 'B+', 'AB-', 'AB+'],
  'B+': ['B-', 'B+', 'AB-', 'AB+'],
  'AB-': ['AB-', 'AB+'],
  'AB+': ['AB-', 'AB+'],
};

/** Platelets follow plasma's rule in practice, because the bag is mostly plasma. */
function tableFor(component: BloodComponent) {
  return component === 'plasma' ||
    component === 'platelets' ||
    component === 'cryoprecipitate'
    ? PLASMA_COMPATIBILITY
    : RED_CELL_COMPATIBILITY;
}

/**
 * May a unit of `unitGroup` be given to a patient of `recipientGroup`?
 *
 * Shared so the issuing screen, the API and any future cross-match record all
 * answer identically. The API refuses an incompatible issue outright; this is
 * not a warning that can be clicked past.
 */
export function isCompatible(
  unitGroup: BloodGroup,
  recipientGroup: BloodGroup,
  component: BloodComponent,
): boolean {
  return tableFor(component)[recipientGroup].includes(unitGroup);
}

/** Every group a patient of this group may safely receive, for the UI to filter on. */
export function compatibleDonorGroups(
  recipientGroup: BloodGroup,
  component: BloodComponent,
): readonly BloodGroup[] {
  return tableFor(component)[recipientGroup];
}

/** Plain words for a refusal, so the message is the same everywhere. */
export function incompatibilityReason(
  unitGroup: BloodGroup,
  recipientGroup: BloodGroup,
  component: BloodComponent,
): string | null {
  if (isCompatible(unitGroup, recipientGroup, component)) return null;
  return (
    `${BLOOD_COMPONENT_LABELS[component]} of group ${unitGroup} cannot be given ` +
    `to a ${recipientGroup} patient. Compatible groups: ` +
    `${compatibleDonorGroups(recipientGroup, component).join(', ')}.`
  );
}

// --- donors ----------------------------------------------------------------

/** Whole-blood donation interval. Below this, the donor is deferred. */
export const DONATION_INTERVAL_DAYS = 90;

export const createDonorSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  bloodGroup: bloodGroupSchema,
  phone: phoneSchema,
  birthDate: isoDateSchema.optional(),
  address: z.string().trim().max(300).optional(),
  note: z.string().trim().max(500).optional(),
});
export type CreateDonorInput = z.infer<typeof createDonorSchema>;

export const updateDonorSchema = createDonorSchema.partial().extend({
  birthDate: isoDateSchema.nullish(),
  address: z.string().trim().max(300).nullish(),
  note: z.string().trim().max(500).nullish(),
  isActive: z.boolean().optional(),
});
export type UpdateDonorInput = z.infer<typeof updateDonorSchema>;

export const donorSchema = z.object({
  id: z.string().uuid(),
  donorNo: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  bloodGroup: bloodGroupSchema,
  phone: z.string(),
  birthDate: isoDateSchema.nullable(),
  address: z.string().nullable(),
  note: z.string().nullable(),
  isActive: z.boolean(),
  /** Derived from the donation records, never stored. */
  lastDonatedOn: isoDateSchema.nullable(),
  donationCount: z.number().int(),
  /** True when the last donation was less than the interval ago. */
  isDeferred: z.boolean(),
  /** The first date this donor may give again. Null when they never have. */
  eligibleFrom: isoDateSchema.nullable(),
});
export type Donor = z.infer<typeof donorSchema>;

export const donorListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  bloodGroup: bloodGroupSchema.optional(),
  /** Only donors who may give today. */
  eligibleOnly: booleanQuery.optional(),
  includeInactive: booleanQuery.optional(),
});

/**
 * Whole days since a donation. Shared so the donor list and the collection
 * screen agree on who is deferred.
 */
export function daysSince(fromDate: string, today: string): number {
  const a = new Date(`${fromDate}T00:00:00Z`).getTime();
  const b = new Date(`${today}T00:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.floor((b - a) / 86_400_000);
}

export function isDonorDeferred(
  lastDonatedOn: string | null,
  today: string,
): boolean {
  if (!lastDonatedOn) return false;
  return daysSince(lastDonatedOn, today) < DONATION_INTERVAL_DAYS;
}

/** The date a donor becomes eligible again. */
export function eligibleFrom(lastDonatedOn: string | null): string | null {
  if (!lastDonatedOn) return null;
  const d = new Date(`${lastDonatedOn}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + DONATION_INTERVAL_DAYS);
  return d.toISOString().slice(0, 10);
}

// --- units -----------------------------------------------------------------

/**
 * What a bag is doing. `available` and `expired` are DERIVED — a bag is expired
 * when the date says so, and available when nothing else is true. Only the
 * stored decisions (issued, discarded) are recorded.
 */
export const bloodUnitStatusSchema = z.enum([
  'available',
  'issued',
  'expired',
  'discarded',
]);
export type BloodUnitStatus = z.infer<typeof bloodUnitStatusSchema>;

export const BLOOD_UNIT_STATUS_LABELS: Record<BloodUnitStatus, string> = {
  available: 'Available',
  issued: 'Issued',
  expired: 'Expired',
  discarded: 'Discarded',
};

/** Server and client must agree on what a bag's state is. */
export function bloodUnitStatusOf(
  input: {
    issuedAt?: string | null;
    discardedAt?: string | null;
    expiresOn: string;
  },
  today: string,
): BloodUnitStatus {
  if (input.discardedAt) return 'discarded';
  if (input.issuedAt) return 'issued';
  // Expiry is inclusive of the stated day: a unit expiring today is still good.
  if (input.expiresOn < today) return 'expired';
  return 'available';
}

export const recordDonationSchema = z.object({
  donorId: z.string().uuid(),
  bagNo: z.string().trim().min(1).max(60),
  component: bloodComponentSchema,
  collectedOn: isoDateSchema,
  /** Always explicit. A default would be the bank guessing when blood goes bad. */
  expiresOn: isoDateSchema,
  volumeMl: z.number().int().min(1).max(1000).optional(),
  /** Screening results. A unit with a reactive screen can never be issued. */
  screenedAt: isoDateTimeSchema.optional(),
  screeningPassed: z.boolean().optional(),
  note: z.string().trim().max(500).optional(),
});
export type RecordDonationInput = z.infer<typeof recordDonationSchema>;

export const discardUnitSchema = z.object({
  reason: z.string().trim().min(2).max(300),
});

export const bloodUnitSchema = z.object({
  id: z.string().uuid(),
  bagNo: z.string(),
  bloodGroup: bloodGroupSchema,
  component: bloodComponentSchema,
  volumeMl: z.number().int().nullable(),
  collectedOn: isoDateSchema,
  expiresOn: isoDateSchema,
  screenedAt: isoDateTimeSchema.nullable(),
  screeningPassed: z.boolean().nullable(),
  status: bloodUnitStatusSchema,
  donor: z
    .object({
      id: z.string().uuid(),
      donorNo: z.string(),
      name: z.string(),
    })
    .nullable(),
  issuedAt: isoDateTimeSchema.nullable(),
  issuedToPatient: patientSummarySchema.nullable(),
  discardedAt: isoDateTimeSchema.nullable(),
  discardReason: z.string().nullable(),
  note: z.string().nullable(),
});
export type BloodUnit = z.infer<typeof bloodUnitSchema>;

export const bloodUnitListQuerySchema = z.object({
  bloodGroup: bloodGroupSchema.optional(),
  component: bloodComponentSchema.optional(),
  status: bloodUnitStatusSchema.optional(),
  q: z.string().trim().max(120).optional(),
  /** Units expiring within this many days — the bank's daily worry. */
  expiringWithinDays: z.coerce.number().int().min(0).max(365).optional(),
});

/** The stock board: how many bags of each group and component are on the shelf. */
export const bloodStockSchema = z.object({
  totals: z.object({
    available: z.number().int(),
    issued: z.number().int(),
    expired: z.number().int(),
    discarded: z.number().int(),
    /** Available units expiring within 7 days. */
    expiringSoon: z.number().int(),
  }),
  byGroup: z.array(
    z.object({
      bloodGroup: bloodGroupSchema,
      available: z.number().int(),
      expiringSoon: z.number().int(),
      byComponent: z.array(
        z.object({
          component: bloodComponentSchema,
          available: z.number().int(),
        }),
      ),
    }),
  ),
});
export type BloodStock = z.infer<typeof bloodStockSchema>;

// --- issuing ---------------------------------------------------------------

export const issueBloodSchema = z.object({
  unitId: z.string().uuid(),
  patientId: z.string().uuid(),
  caseId: z.string().uuid().optional(),
  /**
   * The recipient's group as established by the bank's own typing, not copied
   * from the patient record. Cross-matching is a bench test, and the result of
   * that test is what the issue must be checked against.
   */
  recipientGroup: bloodGroupSchema,
  /** What the hospital charges for the bag. */
  priceMinor: z.number().int().min(0).optional(),
  crossMatchedBy: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
});
export type IssueBloodInput = z.infer<typeof issueBloodSchema>;

export const bloodIssueSchema = z.object({
  id: z.string().uuid(),
  unit: bloodUnitSchema,
  patient: patientSummarySchema,
  caseId: z.string().uuid(),
  caseNo: z.string(),
  recipientGroup: bloodGroupSchema,
  issuedAt: isoDateTimeSchema,
  issuedBy: z.string().nullable(),
  crossMatchedBy: z.string().nullable(),
  billItemId: z.string().uuid().nullable(),
  note: z.string().nullable(),
});
export type BloodIssue = z.infer<typeof bloodIssueSchema>;

export const bloodIssueListQuerySchema = z.object({
  patientId: z.string().uuid().optional(),
  caseId: z.string().uuid().optional(),
  bloodGroup: bloodGroupSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});
