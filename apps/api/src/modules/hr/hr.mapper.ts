import type {
  Department,
  Designation,
  LeaveType,
  Prisma,
  Shift,
} from '@prisma/client';
import {
  type Attendance as AttendanceDto,
  type HrNamed,
  type LeaveRequest as LeaveRequestDto,
  type LeaveType as LeaveTypeDto,
  type PayrollRun as PayrollRunDto,
  type Payslip as PayslipDto,
  type RosterEntry as RosterEntryDto,
  type Shift as ShiftDto,
  type Staff as StaffDto,
  computePayslip,
} from '@hms/shared';
import { toIsoDate, toIsoDateOrNull } from '../../common/util/dates.js';

// --- reference data --------------------------------------------------------

export function toHrNamedDto(r: Department | Designation): HrNamed {
  return { id: r.id, name: r.name, isActive: r.isActive };
}

export function toLeaveTypeDto(r: LeaveType): LeaveTypeDto {
  return {
    id: r.id,
    name: r.name,
    daysPerYear: r.daysPerYear,
    isPaid: r.isPaid,
    isActive: r.isActive,
  };
}

export function toShiftDto(r: Shift): ShiftDto {
  return {
    id: r.id,
    name: r.name,
    startTime: r.startTime,
    endTime: r.endTime,
    isActive: r.isActive,
  };
}

// --- staff -----------------------------------------------------------------

export const staffInclude = {
  user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
  department: true,
  designation: true,
} as const;

export type StaffRow = Prisma.StaffProfileGetPayload<{
  include: typeof staffInclude;
}>;

/**
 * Name and role come from the `User`, not from a copy on the profile. One
 * spelling of a person's name in the system means a rename cannot leave the
 * staff list disagreeing with the login it belongs to.
 */
export function toStaffDto(r: StaffRow): StaffDto {
  return {
    id: r.id,
    userId: r.userId,
    staffNo: r.staffNo,
    firstName: r.user.firstName,
    lastName: r.user.lastName,
    email: r.user.email,
    role: r.user.role,
    department: r.department ? toHrNamedDto(r.department) : null,
    designation: r.designation ? toHrNamedDto(r.designation) : null,
    phone: r.phone,
    emergencyPhone: r.emergencyPhone,
    address: r.address,
    nationalIdLast4: r.nationalIdLast4,
    joinedOn: toIsoDate(r.joinedOn),
    leftOn: toIsoDateOrNull(r.leftOn),
    basicSalaryMinor: r.basicSalaryMinor,
    isActive: r.isActive,
  };
}

export function staffFullName(r: {
  user: { firstName: string; lastName: string };
}): string {
  return `${r.user.firstName} ${r.user.lastName}`.trim();
}

// --- attendance ------------------------------------------------------------

export const attendanceInclude = {
  staff: { include: { user: { select: { firstName: true, lastName: true } } } },
} as const;

export type AttendanceRow = Prisma.StaffAttendanceGetPayload<{
  include: typeof attendanceInclude;
}>;

export function toAttendanceDto(r: AttendanceRow): AttendanceDto {
  return {
    id: r.id,
    staffId: r.staffId,
    staffName: staffFullName(r.staff),
    staffNo: r.staff.staffNo,
    onDate: toIsoDate(r.onDate),
    status: r.status,
    checkIn: r.checkIn ? r.checkIn.toISOString() : null,
    checkOut: r.checkOut ? r.checkOut.toISOString() : null,
    note: r.note,
  };
}

// --- leave -----------------------------------------------------------------

export const leaveRequestInclude = {
  staff: { include: { user: { select: { firstName: true, lastName: true } } } },
  leaveType: true,
} as const;

export type LeaveRequestRow = Prisma.LeaveRequestGetPayload<{
  include: typeof leaveRequestInclude;
}>;

export function toLeaveRequestDto(
  r: LeaveRequestRow,
  decidedByName: string | null,
): LeaveRequestDto {
  return {
    id: r.id,
    staffId: r.staffId,
    staffName: staffFullName(r.staff),
    staffNo: r.staff.staffNo,
    leaveType: toLeaveTypeDto(r.leaveType),
    fromDate: toIsoDate(r.fromDate),
    toDate: toIsoDate(r.toDate),
    days: r.days,
    reason: r.reason,
    status: r.status,
    decidedBy: decidedByName,
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
    decisionNote: r.decisionNote,
    createdAt: r.createdAt.toISOString(),
  };
}

// --- roster ----------------------------------------------------------------

export const rosterInclude = {
  staff: { include: { user: { select: { firstName: true, lastName: true } } } },
  shift: true,
  ward: { select: { id: true, name: true } },
} as const;

export type RosterRow = Prisma.RosterEntryGetPayload<{
  include: typeof rosterInclude;
}>;

export function toRosterEntryDto(r: RosterRow): RosterEntryDto {
  return {
    id: r.id,
    staffId: r.staffId,
    staffName: staffFullName(r.staff),
    shift: toShiftDto(r.shift),
    onDate: toIsoDate(r.onDate),
    wardId: r.wardId,
    wardName: r.ward?.name ?? null,
    note: r.note,
  };
}

// --- payroll ---------------------------------------------------------------

export const payslipInclude = {
  lines: { orderBy: { sortOrder: 'asc' } },
} as const;

export type PayslipRow = Prisma.PayslipGetPayload<{
  include: typeof payslipInclude;
}>;

/**
 * Every figure on a payslip comes back through the shared `computePayslip`
 * rather than from the stored columns. The columns exist so payroll can be
 * queried and totalled in SQL, but if they ever drifted from the lines they
 * were computed from, the person holding the printout would be right and the
 * database would be wrong. Recomputing here means the two cannot disagree.
 *
 * Name, staff number and designation are read from the snapshot, never from
 * the live staff record — editing someone's designation must not silently
 * rewrite a payslip they were handed three months ago.
 */
export function toPayslipDto(r: PayslipRow): PayslipDto {
  const totals = computePayslip({ basicMinor: r.basicMinor, lines: r.lines });
  return {
    id: r.id,
    runId: r.runId,
    staffId: r.staffId,
    staffName: r.staffNameSnapshot,
    staffNo: r.staffNoSnapshot,
    designation: r.designationSnapshot,
    basicMinor: r.basicMinor,
    earningsMinor: totals.earningsMinor,
    deductionsMinor: totals.deductionsMinor,
    netMinor: totals.netMinor,
    workedDays: r.workedDays,
    absentDays: r.absentDays,
    leaveDays: r.leaveDays,
    note: r.note,
    lines: r.lines.map((l) => ({
      id: l.id,
      kind: l.kind,
      name: l.name,
      amountMinor: l.amountMinor,
      sortOrder: l.sortOrder,
    })),
  };
}

export const payrollRunInclude = {
  payslips: { include: payslipInclude },
} as const;

export type PayrollRunRow = Prisma.PayrollRunGetPayload<{
  include: typeof payrollRunInclude;
}>;

/** The run's total is the sum of its payslips as `computePayslip` sees them. */
export function toPayrollRunDto(r: PayrollRunRow): PayrollRunDto {
  let totalNetMinor = 0;
  for (const slip of r.payslips) {
    totalNetMinor += computePayslip({
      basicMinor: slip.basicMinor,
      lines: slip.lines,
    }).netMinor;
  }
  return {
    id: r.id,
    year: r.year,
    month: r.month,
    status: r.status,
    finalisedAt: r.finalisedAt ? r.finalisedAt.toISOString() : null,
    paidAt: r.paidAt ? r.paidAt.toISOString() : null,
    note: r.note,
    payslipCount: r.payslips.length,
    totalNetMinor,
    createdAt: r.createdAt.toISOString(),
  };
}
