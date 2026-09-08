import { z } from 'zod';
import { isoDateSchema, isoDateTimeSchema, booleanQuery } from './common.js';
import { cnicSchema } from './patient.js';
import { ROLES } from './rbac.js';

/**
 * Human resources.
 *
 * The login stays lean and is about access; employment facts live here, so an
 * HR change never touches authentication. A staff profile always belongs to a
 * user — someone the hospital pays is someone who can be held accountable in
 * the audit trail.
 */

// --- reference data --------------------------------------------------------

export const createHrNamedSchema = z.object({
  name: z.string().trim().min(1).max(120),
});
export const updateHrNamedSchema = createHrNamedSchema
  .partial()
  .extend({ isActive: z.boolean().optional() });
export type UpdateHrNamedInput = z.infer<typeof updateHrNamedSchema>;

export const hrNamedSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  isActive: z.boolean(),
});
export type HrNamed = z.infer<typeof hrNamedSchema>;

// --- staff -----------------------------------------------------------------

export const createStaffSchema = z.object({
  /** Creating a login alongside the profile. */
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  role: z.enum(ROLES),

  departmentId: z.string().uuid().optional(),
  designationId: z.string().uuid().optional(),
  phone: z.string().trim().max(30).optional(),
  emergencyPhone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(300).optional(),
  /** Stored as a salted hash plus the last 4, exactly as a patient's is. */
  nationalId: cnicSchema.optional(),
  joinedOn: isoDateSchema,
  /** Monthly basic pay in minor units. A default for payroll, always editable. */
  basicSalaryMinor: z.number().int().min(0).optional(),
});
export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type CreateHrNamedInput = z.infer<typeof createHrNamedSchema>;
export type CreateLeaveTypeInput = z.infer<typeof createLeaveTypeSchema>;
export type CreateShiftInput = z.infer<typeof createShiftSchema>;

export const updateStaffSchema = createStaffSchema
  .omit({ email: true, password: true })
  .partial()
  .extend({
    departmentId: z.string().uuid().nullish(),
    designationId: z.string().uuid().nullish(),
    phone: z.string().trim().max(30).nullish(),
    emergencyPhone: z.string().trim().max(30).nullish(),
    address: z.string().trim().max(300).nullish(),
    basicSalaryMinor: z.number().int().min(0).nullish(),
    leftOn: isoDateSchema.nullish(),
    isActive: z.boolean().optional(),
  });
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;

export const staffSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  staffNo: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  role: z.enum(ROLES),
  department: hrNamedSchema.nullable(),
  designation: hrNamedSchema.nullable(),
  phone: z.string().nullable(),
  emergencyPhone: z.string().nullable(),
  address: z.string().nullable(),
  nationalIdLast4: z.string().nullable(),
  joinedOn: isoDateSchema,
  leftOn: isoDateSchema.nullable(),
  basicSalaryMinor: z.number().int().nullable(),
  isActive: z.boolean(),
});
export type Staff = z.infer<typeof staffSchema>;

export const staffListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  departmentId: z.string().uuid().optional(),
  role: z.enum(ROLES).optional(),
  includeInactive: booleanQuery.optional(),
});

// --- attendance ------------------------------------------------------------

export const attendanceStatusSchema = z.enum([
  'present',
  'absent',
  'late',
  'half_day',
  'on_leave',
  'holiday',
]);
export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>;

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  half_day: 'Half day',
  on_leave: 'On leave',
  holiday: 'Holiday',
};

/** Marking a whole day at once — how a ward actually does it. */
export const markAttendanceSchema = z.object({
  onDate: isoDateSchema,
  entries: z
    .array(
      z.object({
        staffId: z.string().uuid(),
        status: attendanceStatusSchema,
        checkIn: isoDateTimeSchema.optional(),
        checkOut: isoDateTimeSchema.optional(),
        note: z.string().trim().max(300).optional(),
      }),
    )
    .min(1)
    .max(500),
});
export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;

export const attendanceSchema = z.object({
  id: z.string().uuid(),
  staffId: z.string().uuid(),
  staffName: z.string(),
  staffNo: z.string(),
  onDate: isoDateSchema,
  status: attendanceStatusSchema,
  checkIn: isoDateTimeSchema.nullable(),
  checkOut: isoDateTimeSchema.nullable(),
  note: z.string().nullable(),
});
export type Attendance = z.infer<typeof attendanceSchema>;

export const attendanceListQuerySchema = z.object({
  onDate: isoDateSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  staffId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
});

// --- leave -----------------------------------------------------------------

export const createLeaveTypeSchema = z.object({
  name: z.string().trim().min(1).max(80),
  daysPerYear: z.number().int().min(0).max(365).nullish(),
  isPaid: z.boolean().optional(),
});
export const updateLeaveTypeSchema = createLeaveTypeSchema
  .partial()
  .extend({ isActive: z.boolean().optional() });
export type UpdateLeaveTypeInput = z.infer<typeof updateLeaveTypeSchema>;

export const leaveTypeSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  daysPerYear: z.number().int().nullable(),
  isPaid: z.boolean(),
  isActive: z.boolean(),
});
export type LeaveType = z.infer<typeof leaveTypeSchema>;

export const leaveRequestStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
  'cancelled',
]);
export type LeaveRequestStatus = z.infer<typeof leaveRequestStatusSchema>;

export const LEAVE_STATUS_LABELS: Record<LeaveRequestStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export const applyLeaveSchema = z
  .object({
    /** Omit to apply for yourself. */
    staffId: z.string().uuid().optional(),
    leaveTypeId: z.string().uuid(),
    fromDate: isoDateSchema,
    toDate: isoDateSchema,
    reason: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.toDate >= v.fromDate, {
    message: 'The end date cannot be before the start date',
    path: ['toDate'],
  });
export type ApplyLeaveInput = z.infer<typeof applyLeaveSchema>;

export const decideLeaveSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  decisionNote: z.string().trim().max(500).optional(),
});
export type DecideLeaveInput = z.infer<typeof decideLeaveSchema>;

/** `GET /hr/leave/balance` — one person, one year. */
export const leaveBalanceQuerySchema = z.object({
  staffId: z.string().uuid(),
  year: z.coerce.number().int().min(2000).max(2200),
});
export type LeaveBalanceQuery = z.infer<typeof leaveBalanceQuerySchema>;

export const leaveRequestSchema = z.object({
  id: z.string().uuid(),
  staffId: z.string().uuid(),
  staffName: z.string(),
  staffNo: z.string(),
  leaveType: leaveTypeSchema,
  fromDate: isoDateSchema,
  toDate: isoDateSchema,
  days: z.number().int(),
  reason: z.string().nullable(),
  status: leaveRequestStatusSchema,
  decidedBy: z.string().nullable(),
  decidedAt: isoDateTimeSchema.nullable(),
  decisionNote: z.string().nullable(),
  createdAt: isoDateTimeSchema,
});
export type LeaveRequest = z.infer<typeof leaveRequestSchema>;

export const leaveListQuerySchema = z.object({
  staffId: z.string().uuid().optional(),
  status: leaveRequestStatusSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

/** Entitlement against what has been taken. Derived, never stored. */
export const leaveBalanceSchema = z.object({
  leaveTypeId: z.string().uuid(),
  leaveTypeName: z.string(),
  daysPerYear: z.number().int().nullable(),
  approvedDays: z.number().int(),
  pendingDays: z.number().int(),
  remainingDays: z.number().int().nullable(),
});
export type LeaveBalance = z.infer<typeof leaveBalanceSchema>;

// --- duty roster -----------------------------------------------------------

export const createShiftSchema = z.object({
  name: z.string().trim().min(1).max(80),
  /** HH:mm. A night shift may legitimately end before it starts. */
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm'),
});
export const updateShiftSchema = createShiftSchema
  .partial()
  .extend({ isActive: z.boolean().optional() });
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;

export const shiftSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  isActive: z.boolean(),
});
export type Shift = z.infer<typeof shiftSchema>;

export const assignRosterSchema = z.object({
  entries: z
    .array(
      z.object({
        staffId: z.string().uuid(),
        shiftId: z.string().uuid(),
        onDate: isoDateSchema,
        wardId: z.string().uuid().optional(),
        note: z.string().trim().max(200).optional(),
      }),
    )
    .min(1)
    .max(500),
});
export type AssignRosterInput = z.infer<typeof assignRosterSchema>;

export const rosterEntrySchema = z.object({
  id: z.string().uuid(),
  staffId: z.string().uuid(),
  staffName: z.string(),
  shift: shiftSchema,
  onDate: isoDateSchema,
  wardId: z.string().uuid().nullable(),
  wardName: z.string().nullable(),
  note: z.string().nullable(),
});
export type RosterEntry = z.infer<typeof rosterEntrySchema>;

export const rosterListQuerySchema = z.object({
  from: isoDateSchema,
  to: isoDateSchema,
  staffId: z.string().uuid().optional(),
  wardId: z.string().uuid().optional(),
  shiftId: z.string().uuid().optional(),
});

// --- payroll ---------------------------------------------------------------

export const payrollRunStatusSchema = z.enum(['draft', 'finalised', 'paid']);
export type PayrollRunStatus = z.infer<typeof payrollRunStatusSchema>;

export const PAYROLL_STATUS_LABELS: Record<PayrollRunStatus, string> = {
  draft: 'Draft',
  finalised: 'Finalised',
  paid: 'Paid',
};

export const createPayrollRunSchema = z.object({
  year: z.number().int().min(2000).max(2200),
  month: z.number().int().min(1).max(12),
  note: z.string().trim().max(300).optional(),
});
export type CreatePayrollRunInput = z.infer<typeof createPayrollRunSchema>;

export const payslipLineInputSchema = z.object({
  kind: z.enum(['earning', 'deduction']),
  name: z.string().trim().min(1).max(120),
  amountMinor: z.number().int().min(0),
});

/** Edit one payslip inside a draft run. */
export const updatePayslipSchema = z.object({
  basicMinor: z.number().int().min(0).optional(),
  lines: z.array(payslipLineInputSchema).max(40).optional(),
  note: z.string().trim().max(300).optional(),
});
export type UpdatePayslipInput = z.infer<typeof updatePayslipSchema>;

export const payslipLineSchema = payslipLineInputSchema.extend({
  id: z.string().uuid(),
  sortOrder: z.number().int(),
});

export const payslipSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  staffId: z.string().uuid(),
  staffName: z.string(),
  staffNo: z.string(),
  designation: z.string().nullable(),
  basicMinor: z.number().int(),
  earningsMinor: z.number().int(),
  deductionsMinor: z.number().int(),
  netMinor: z.number().int(),
  workedDays: z.number().int().nullable(),
  absentDays: z.number().int().nullable(),
  leaveDays: z.number().int().nullable(),
  note: z.string().nullable(),
  lines: z.array(payslipLineSchema),
});
export type Payslip = z.infer<typeof payslipSchema>;

export const payrollRunSchema = z.object({
  id: z.string().uuid(),
  year: z.number().int(),
  month: z.number().int(),
  status: payrollRunStatusSchema,
  finalisedAt: isoDateTimeSchema.nullable(),
  paidAt: isoDateTimeSchema.nullable(),
  note: z.string().nullable(),
  payslipCount: z.number().int(),
  totalNetMinor: z.number().int(),
  createdAt: isoDateTimeSchema,
});
export type PayrollRun = z.infer<typeof payrollRunSchema>;

/**
 * A payslip's arithmetic, shared so the screen and the API agree to the paisa.
 * net = basic + earnings - deductions, and it may legitimately be negative if
 * deductions exceed pay — that is a real situation, not an error to clamp away.
 */
export function computePayslip(input: {
  basicMinor: number;
  lines: readonly { kind: 'earning' | 'deduction'; amountMinor: number }[];
}): { earningsMinor: number; deductionsMinor: number; netMinor: number } {
  let earningsMinor = 0;
  let deductionsMinor = 0;
  for (const line of input.lines) {
    if (line.kind === 'earning') earningsMinor += line.amountMinor;
    else deductionsMinor += line.amountMinor;
  }
  return {
    earningsMinor,
    deductionsMinor,
    netMinor: input.basicMinor + earningsMinor - deductionsMinor,
  };
}

/** Whole days inclusive of both ends — how leave is counted in practice. */
export function leaveDaysBetween(fromDate: string, toDate: string): number {
  const a = new Date(`${fromDate}T00:00:00Z`).getTime();
  const b = new Date(`${toDate}T00:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.floor((b - a) / 86_400_000) + 1;
}
