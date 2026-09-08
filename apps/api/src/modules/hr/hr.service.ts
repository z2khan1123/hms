import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  type ApplyLeaveInput,
  type AssignRosterInput,
  type Attendance,
  type CreatePayrollRunInput,
  type CreateStaffInput,
  type HrNamed,
  type LeaveBalance,
  type LeaveRequest,
  type LeaveType,
  type MarkAttendanceInput,
  type PayrollRun,
  type Payslip,
  type RosterEntry,
  type Shift,
  type Staff,
  type UpdatePayslipInput,
  type UpdateStaffInput,
  computePayslip,
  leaveDaysBetween,
} from '@hms/shared';
import { SequenceService } from '../../common/sequence/sequence.service.js';
import { parseIsoDate, parseIsoDateOrNull } from '../../common/util/dates.js';
import { hashNationalId } from '../../common/util/national-id.js';
import { compareNatural } from '../../common/util/natural-sort.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  type LeaveRequestRow,
  type PayrollRunRow,
  attendanceInclude,
  leaveRequestInclude,
  payrollRunInclude,
  payslipInclude,
  rosterInclude,
  staffInclude,
  toAttendanceDto,
  toHrNamedDto,
  toLeaveRequestDto,
  toLeaveTypeDto,
  toPayrollRunDto,
  toPayslipDto,
  toRosterEntryDto,
  toShiftDto,
  toStaffDto,
} from './hr.mapper.js';

type Tx = Prisma.TransactionClient;

const BCRYPT_ROUNDS = 12;

/**
 * A payroll run goes `draft → finalised → paid` and never back. Once it is out
 * of draft its payslips are what people were told they would be paid, so they
 * stop being editable — a correction belongs in the next month's run, where it
 * is visible, not as a quiet edit to a slip somebody has already read.
 *
 * Pure and exported so the rule is pinned by tests rather than only reachable
 * through a database.
 */
export function assertRunIsDraft(status: PayrollRun['status']): void {
  if (status !== 'draft') {
    throw new ConflictException(
      `This payroll run is ${status} and can no longer be changed`,
    );
  }
}

/** The forward-only transition out of `finalised`. */
export function assertRunCanBePaid(status: PayrollRun['status']): void {
  if (status === 'draft') {
    throw new ConflictException('Finalise the run before marking it paid');
  }
  if (status === 'paid') {
    throw new ConflictException('This run has already been marked paid');
  }
}

/**
 * Only a pending request can be decided. Deciding one twice is a conflict, not
 * a silent overwrite: whoever approved it first is on the record, and a second
 * approver has to see that before anything changes.
 */
export function assertLeaveIsPending(status: LeaveRequest['status']): void {
  if (status !== 'pending') {
    throw new ConflictException(`This request has already been ${status}`);
  }
}

export interface StaffListFilter {
  q?: string;
  departmentId?: string;
  role?: Staff['role'];
  includeInactive?: boolean;
}

export interface AttendanceListFilter {
  onDate?: string;
  from?: string;
  to?: string;
  staffId?: string;
  departmentId?: string;
}

export interface LeaveListFilter {
  staffId?: string;
  status?: LeaveRequest['status'];
  from?: string;
  to?: string;
}

export interface RosterListFilter {
  from: string;
  to: string;
  staffId?: string;
  wardId?: string;
  shiftId?: string;
}

/**
 * HR and payroll.
 *
 * Two rules run through everything here. Employment facts never live on the
 * login — a name is read from the `User` so it has one spelling — and money is
 * never added up locally: every payslip figure comes back through the shared
 * `computePayslip`, so the screen, the API and the printed slip agree to the
 * paisa or not at all.
 */
@Injectable()
export class HrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly config: ConfigService,
  ) {}

  // --- departments and designations -----------------------------------

  async listDepartments(
    tenantId: string,
    includeInactive = false,
  ): Promise<HrNamed[]> {
    const rows = await this.prisma.department.findMany({
      where: { tenantId, ...(includeInactive ? {} : { isActive: true }) },
    });
    return rows.map(toHrNamedDto).sort((a, b) => compareNatural(a.name, b.name));
  }

  async createDepartment(
    tenantId: string,
    input: { name: string },
  ): Promise<HrNamed> {
    return toHrNamedDto(
      await this.createNamed(() =>
        this.prisma.department.create({ data: { tenantId, name: input.name } }),
      'A department with that name already exists'),
    );
  }

  async updateDepartment(
    tenantId: string,
    id: string,
    input: { name?: string; isActive?: boolean },
  ): Promise<HrNamed> {
    await this.assertExists(
      this.prisma.department.findFirst({ where: { id, tenantId }, select: { id: true } }),
      'Department',
    );
    return toHrNamedDto(
      await this.createNamed(
        () => this.prisma.department.update({ where: { id }, data: input }),
        'A department with that name already exists',
      ),
    );
  }

  async listDesignations(
    tenantId: string,
    includeInactive = false,
  ): Promise<HrNamed[]> {
    const rows = await this.prisma.designation.findMany({
      where: { tenantId, ...(includeInactive ? {} : { isActive: true }) },
    });
    return rows.map(toHrNamedDto).sort((a, b) => compareNatural(a.name, b.name));
  }

  async createDesignation(
    tenantId: string,
    input: { name: string },
  ): Promise<HrNamed> {
    return toHrNamedDto(
      await this.createNamed(
        () =>
          this.prisma.designation.create({ data: { tenantId, name: input.name } }),
        'A designation with that name already exists',
      ),
    );
  }

  async updateDesignation(
    tenantId: string,
    id: string,
    input: { name?: string; isActive?: boolean },
  ): Promise<HrNamed> {
    await this.assertExists(
      this.prisma.designation.findFirst({ where: { id, tenantId }, select: { id: true } }),
      'Designation',
    );
    return toHrNamedDto(
      await this.createNamed(
        () => this.prisma.designation.update({ where: { id }, data: input }),
        'A designation with that name already exists',
      ),
    );
  }

  // --- leave types ----------------------------------------------------

  async listLeaveTypes(
    tenantId: string,
    includeInactive = false,
  ): Promise<LeaveType[]> {
    const rows = await this.prisma.leaveType.findMany({
      where: { tenantId, ...(includeInactive ? {} : { isActive: true }) },
    });
    return rows
      .map(toLeaveTypeDto)
      .sort((a, b) => compareNatural(a.name, b.name));
  }

  async createLeaveType(
    tenantId: string,
    input: { name: string; daysPerYear?: number | null; isPaid?: boolean },
  ): Promise<LeaveType> {
    return toLeaveTypeDto(
      await this.createNamed(
        () =>
          this.prisma.leaveType.create({
            data: {
              tenantId,
              name: input.name,
              daysPerYear: input.daysPerYear ?? null,
              isPaid: input.isPaid ?? true,
            },
          }),
        'A leave type with that name already exists',
      ),
    );
  }

  async updateLeaveType(
    tenantId: string,
    id: string,
    input: {
      name?: string;
      daysPerYear?: number | null;
      isPaid?: boolean;
      isActive?: boolean;
    },
  ): Promise<LeaveType> {
    await this.assertExists(
      this.prisma.leaveType.findFirst({ where: { id, tenantId }, select: { id: true } }),
      'Leave type',
    );
    return toLeaveTypeDto(
      await this.createNamed(
        () => this.prisma.leaveType.update({ where: { id }, data: input }),
        'A leave type with that name already exists',
      ),
    );
  }

  // --- shifts ---------------------------------------------------------

  async listShifts(
    tenantId: string,
    includeInactive = false,
  ): Promise<Shift[]> {
    const rows = await this.prisma.shift.findMany({
      where: { tenantId, ...(includeInactive ? {} : { isActive: true }) },
    });
    return rows.map(toShiftDto).sort((a, b) => compareNatural(a.name, b.name));
  }

  async createShift(
    tenantId: string,
    input: { name: string; startTime: string; endTime: string },
  ): Promise<Shift> {
    return toShiftDto(
      await this.createNamed(
        () => this.prisma.shift.create({ data: { tenantId, ...input } }),
        'A shift with that name already exists',
      ),
    );
  }

  async updateShift(
    tenantId: string,
    id: string,
    input: {
      name?: string;
      startTime?: string;
      endTime?: string;
      isActive?: boolean;
    },
  ): Promise<Shift> {
    await this.assertExists(
      this.prisma.shift.findFirst({ where: { id, tenantId }, select: { id: true } }),
      'Shift',
    );
    return toShiftDto(
      await this.createNamed(
        () => this.prisma.shift.update({ where: { id }, data: input }),
        'A shift with that name already exists',
      ),
    );
  }

  // --- staff ----------------------------------------------------------

  async listStaff(
    tenantId: string,
    filter: StaffListFilter,
  ): Promise<Staff[]> {
    const q = filter.q?.trim();
    const rows = await this.prisma.staffProfile.findMany({
      where: {
        tenantId,
        ...(filter.includeInactive ? {} : { isActive: true }),
        ...(filter.departmentId ? { departmentId: filter.departmentId } : {}),
        ...(filter.role ? { user: { role: filter.role } } : {}),
        ...(q
          ? {
              OR: [
                { staffNo: { contains: q, mode: 'insensitive' as const } },
                {
                  user: {
                    OR: [
                      { firstName: { contains: q, mode: 'insensitive' as const } },
                      { lastName: { contains: q, mode: 'insensitive' as const } },
                      { email: { contains: q, mode: 'insensitive' as const } },
                    ],
                  },
                },
              ],
            }
          : {}),
      },
      include: staffInclude,
    });
    return rows
      .map(toStaffDto)
      .sort((a, b) => compareNatural(a.staffNo, b.staffNo));
  }

  async getStaff(tenantId: string, id: string): Promise<Staff> {
    const row = await this.prisma.staffProfile.findFirst({
      where: { id, tenantId },
      include: staffInclude,
    });
    if (!row) throw new NotFoundException('Staff member not found');
    return toStaffDto(row);
  }

  /**
   * Creates the login and the employment record together. A staff number comes
   * from the tenant counter inside the same transaction, so two people hired at
   * once cannot be handed the same one — and if this rolls back, the number
   * rolls back with it rather than leaving a hole in the sequence.
   */
  async createStaff(tenantId: string, input: CreateStaffInput): Promise<Staff> {
    const existing = await this.prisma.user.findFirst({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Email already registered');

    await this.assertReferences(tenantId, input.departmentId, input.designationId);

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const nid = input.nationalId
      ? hashNationalId(
          input.nationalId,
          this.config.getOrThrow<string>('NATIONAL_ID_HASH_SALT'),
        )
      : null;

    const created = await this.prisma
      .$transaction(async (tx) => {
        const staffNo = await this.sequence.next(tx, tenantId, 'staff');
        const user = await tx.user.create({
          data: {
            tenantId,
            email: input.email,
            passwordHash,
            firstName: input.firstName,
            lastName: input.lastName,
            role: input.role,
          },
        });
        return tx.staffProfile.create({
          data: {
            tenantId,
            userId: user.id,
            staffNo,
            departmentId: input.departmentId ?? null,
            designationId: input.designationId ?? null,
            phone: input.phone ?? null,
            emergencyPhone: input.emergencyPhone ?? null,
            address: input.address ?? null,
            nationalIdHash: nid?.hash ?? null,
            nationalIdLast4: nid?.last4 ?? null,
            joinedOn: parseIsoDate(input.joinedOn),
            basicSalaryMinor: input.basicSalaryMinor ?? null,
          },
          include: staffInclude,
        });
      })
      .catch((e: unknown) => {
        throw this.asConflict(e, 'That email or staff number is already taken');
      });

    return toStaffDto(created);
  }

  async updateStaff(
    tenantId: string,
    id: string,
    input: UpdateStaffInput,
  ): Promise<Staff> {
    const current = await this.prisma.staffProfile.findFirst({
      where: { id, tenantId },
      select: { id: true, userId: true },
    });
    if (!current) throw new NotFoundException('Staff member not found');

    await this.assertReferences(tenantId, input.departmentId, input.designationId);

    const nid = input.nationalId
      ? hashNationalId(
          input.nationalId,
          this.config.getOrThrow<string>('NATIONAL_ID_HASH_SALT'),
        )
      : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (
        input.firstName !== undefined ||
        input.lastName !== undefined ||
        input.role !== undefined
      ) {
        await tx.user.update({
          where: { id: current.userId },
          data: {
            ...(input.firstName === undefined ? {} : { firstName: input.firstName }),
            ...(input.lastName === undefined ? {} : { lastName: input.lastName }),
            ...(input.role === undefined ? {} : { role: input.role }),
            ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
          },
        });
      }
      return tx.staffProfile.update({
        where: { id },
        data: {
          ...(input.departmentId === undefined
            ? {}
            : { departmentId: input.departmentId }),
          ...(input.designationId === undefined
            ? {}
            : { designationId: input.designationId }),
          ...(input.phone === undefined ? {} : { phone: input.phone }),
          ...(input.emergencyPhone === undefined
            ? {}
            : { emergencyPhone: input.emergencyPhone }),
          ...(input.address === undefined ? {} : { address: input.address }),
          ...(nid
            ? { nationalIdHash: nid.hash, nationalIdLast4: nid.last4 }
            : {}),
          ...(input.joinedOn === undefined
            ? {}
            : { joinedOn: parseIsoDate(input.joinedOn) }),
          ...(input.leftOn === undefined
            ? {}
            : { leftOn: parseIsoDateOrNull(input.leftOn) }),
          ...(input.basicSalaryMinor === undefined
            ? {}
            : { basicSalaryMinor: input.basicSalaryMinor }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        },
        include: staffInclude,
      });
    });

    return toStaffDto(updated);
  }

  // --- attendance -----------------------------------------------------

  async listAttendance(
    tenantId: string,
    filter: AttendanceListFilter,
  ): Promise<Attendance[]> {
    const rows = await this.prisma.staffAttendance.findMany({
      where: {
        tenantId,
        ...(filter.staffId ? { staffId: filter.staffId } : {}),
        ...(filter.departmentId
          ? { staff: { departmentId: filter.departmentId } }
          : {}),
        ...this.dateWindow(filter.onDate, filter.from, filter.to),
      },
      include: attendanceInclude,
      orderBy: [{ onDate: 'desc' }],
    });
    return rows
      .map(toAttendanceDto)
      .sort(
        (a, b) =>
          b.onDate.localeCompare(a.onDate) ||
          compareNatural(a.staffNo, b.staffNo),
      );
  }

  /**
   * Marking a day is an upsert against `(tenantId, staffId, onDate)`. Correcting
   * a mistake is the same action as making the entry, and the unique index —
   * not a prior read — is what stops the same person being marked twice.
   */
  async markAttendance(
    tenantId: string,
    markedById: string,
    input: MarkAttendanceInput,
  ): Promise<Attendance[]> {
    const onDate = parseIsoDate(input.onDate);
    const staffIds = [...new Set(input.entries.map((e) => e.staffId))];
    await this.assertStaffAllExist(tenantId, staffIds);

    await this.prisma.$transaction(
      input.entries.map((e) =>
        this.prisma.staffAttendance.upsert({
          where: {
            tenantId_staffId_onDate: { tenantId, staffId: e.staffId, onDate },
          },
          create: {
            tenantId,
            staffId: e.staffId,
            onDate,
            status: e.status,
            checkIn: e.checkIn ? new Date(e.checkIn) : null,
            checkOut: e.checkOut ? new Date(e.checkOut) : null,
            note: e.note ?? null,
            markedById,
          },
          update: {
            status: e.status,
            checkIn: e.checkIn ? new Date(e.checkIn) : null,
            checkOut: e.checkOut ? new Date(e.checkOut) : null,
            note: e.note ?? null,
            markedById,
          },
        }),
      ),
    );

    return this.listAttendance(tenantId, { onDate: input.onDate });
  }

  // --- leave ----------------------------------------------------------

  async listLeave(
    tenantId: string,
    filter: LeaveListFilter,
  ): Promise<LeaveRequest[]> {
    const rows = await this.prisma.leaveRequest.findMany({
      where: {
        tenantId,
        ...(filter.staffId ? { staffId: filter.staffId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.from ? { toDate: { gte: parseIsoDate(filter.from) } } : {}),
        ...(filter.to ? { fromDate: { lte: parseIsoDate(filter.to) } } : {}),
      },
      include: leaveRequestInclude,
      orderBy: [{ fromDate: 'desc' }],
    });
    return this.withDeciderNames(tenantId, rows);
  }

  async applyLeave(
    tenantId: string,
    actingUserId: string,
    input: ApplyLeaveInput,
  ): Promise<LeaveRequest> {
    const staffId = input.staffId ?? (await this.ownStaffId(tenantId, actingUserId));
    await this.assertStaffAllExist(tenantId, [staffId]);

    const leaveType = await this.prisma.leaveType.findFirst({
      where: { id: input.leaveTypeId, tenantId },
      select: { id: true },
    });
    if (!leaveType) throw new NotFoundException('Leave type not found');

    const created = await this.prisma.leaveRequest.create({
      data: {
        tenantId,
        staffId,
        leaveTypeId: input.leaveTypeId,
        fromDate: parseIsoDate(input.fromDate),
        toDate: parseIsoDate(input.toDate),
        days: leaveDaysBetween(input.fromDate, input.toDate),
        reason: input.reason ?? null,
      },
      include: leaveRequestInclude,
    });
    return toLeaveRequestDto(created, null);
  }

  /**
   * Only a pending request can be decided. Deciding one twice is a 409 rather
   * than a silent overwrite: whoever approved it first is on the record, and a
   * second approver must see that before anything changes.
   */
  async decideLeave(
    tenantId: string,
    decidedById: string,
    id: string,
    input: { status: 'approved' | 'rejected'; decisionNote?: string },
  ): Promise<LeaveRequest> {
    const current = await this.prisma.leaveRequest.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true },
    });
    if (!current) throw new NotFoundException('Leave request not found');
    assertLeaveIsPending(current.status);

    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: input.status,
        decidedById,
        decidedAt: new Date(),
        decisionNote: input.decisionNote ?? null,
      },
      include: leaveRequestInclude,
    });
    const [dto] = await this.withDeciderNames(tenantId, [updated]);
    return dto;
  }

  /**
   * Entitlement against what has been taken, derived from the requests every
   * time. Nothing here is stored: a balance column would be one more thing that
   * can disagree with the requests it was supposed to summarise.
   */
  async leaveBalance(
    tenantId: string,
    staffId: string,
    year: number,
  ): Promise<LeaveBalance[]> {
    await this.assertStaffAllExist(tenantId, [staffId]);
    const [types, requests] = await Promise.all([
      this.prisma.leaveType.findMany({ where: { tenantId, isActive: true } }),
      this.prisma.leaveRequest.findMany({
        where: {
          tenantId,
          staffId,
          status: { in: ['approved', 'pending'] },
          fromDate: {
            gte: parseIsoDate(`${year}-01-01`),
            lte: parseIsoDate(`${year}-12-31`),
          },
        },
        select: { leaveTypeId: true, days: true, status: true },
      }),
    ]);

    return types
      .map((t) => {
        let approvedDays = 0;
        let pendingDays = 0;
        for (const r of requests) {
          if (r.leaveTypeId !== t.id) continue;
          if (r.status === 'approved') approvedDays += r.days;
          else pendingDays += r.days;
        }
        return {
          leaveTypeId: t.id,
          leaveTypeName: t.name,
          daysPerYear: t.daysPerYear,
          approvedDays,
          pendingDays,
          remainingDays:
            t.daysPerYear === null ? null : t.daysPerYear - approvedDays,
        };
      })
      .sort((a, b) => compareNatural(a.leaveTypeName, b.leaveTypeName));
  }

  // --- roster ---------------------------------------------------------

  async listRoster(
    tenantId: string,
    filter: RosterListFilter,
  ): Promise<RosterEntry[]> {
    const rows = await this.prisma.rosterEntry.findMany({
      where: {
        tenantId,
        onDate: {
          gte: parseIsoDate(filter.from),
          lte: parseIsoDate(filter.to),
        },
        ...(filter.staffId ? { staffId: filter.staffId } : {}),
        ...(filter.wardId ? { wardId: filter.wardId } : {}),
        ...(filter.shiftId ? { shiftId: filter.shiftId } : {}),
      },
      include: rosterInclude,
      orderBy: [{ onDate: 'asc' }],
    });
    return rows.map(toRosterEntryDto);
  }

  /** Re-assigning the same person to the same shift on the same day is an edit. */
  async assignRoster(
    tenantId: string,
    assignedById: string,
    input: AssignRosterInput,
  ): Promise<RosterEntry[]> {
    const staffIds = [...new Set(input.entries.map((e) => e.staffId))];
    await this.assertStaffAllExist(tenantId, staffIds);

    const shiftIds = [...new Set(input.entries.map((e) => e.shiftId))];
    const shifts = await this.prisma.shift.count({
      where: { tenantId, id: { in: shiftIds } },
    });
    if (shifts !== shiftIds.length) {
      throw new NotFoundException('One or more shifts were not found');
    }

    await this.prisma.$transaction(
      input.entries.map((e) => {
        const onDate = parseIsoDate(e.onDate);
        return this.prisma.rosterEntry.upsert({
          where: {
            tenantId_staffId_onDate_shiftId: {
              tenantId,
              staffId: e.staffId,
              onDate,
              shiftId: e.shiftId,
            },
          },
          create: {
            tenantId,
            staffId: e.staffId,
            shiftId: e.shiftId,
            onDate,
            wardId: e.wardId ?? null,
            note: e.note ?? null,
            assignedById,
          },
          update: {
            wardId: e.wardId ?? null,
            note: e.note ?? null,
            assignedById,
          },
        });
      }),
    );

    const dates = input.entries.map((e) => e.onDate).sort();
    return this.listRoster(tenantId, {
      from: dates[0],
      to: dates[dates.length - 1],
    });
  }

  // --- payroll --------------------------------------------------------

  async listPayrollRuns(tenantId: string): Promise<PayrollRun[]> {
    const rows = await this.prisma.payrollRun.findMany({
      where: { tenantId },
      include: payrollRunInclude,
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
    return rows.map(toPayrollRunDto);
  }

  async getPayrollRun(
    tenantId: string,
    id: string,
  ): Promise<PayrollRun & { payslips: Payslip[] }> {
    const row = await this.findRun(tenantId, id);
    return {
      ...toPayrollRunDto(row),
      payslips: row.payslips
        .map(toPayslipDto)
        .sort((a, b) => compareNatural(a.staffNo, b.staffNo)),
    };
  }

  /**
   * Opens a month and drafts one payslip per active staff member.
   *
   * Each payslip snapshots the person's name, staff number and designation as
   * they are today. Editing a staff record next month must never rewrite a
   * payslip somebody has already been handed.
   *
   * The advisory lock is what makes "one run per month" true under load: the
   * unique index would catch a duplicate, but two requests racing would both
   * have generated a full set of payslips first, and one of them would roll
   * back after doing all that work. Locking on the month makes the second
   * request wait and then see the run that already exists.
   */
  async createPayrollRun(
    tenantId: string,
    createdById: string,
    input: CreatePayrollRunInput,
  ): Promise<PayrollRun> {
    const run = await this.prisma.$transaction(async (tx) => {
      await this.lockPayrollMonth(tx, tenantId, input.year, input.month);

      const existing = await tx.payrollRun.findFirst({
        where: { tenantId, year: input.year, month: input.month },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException(
          'A payroll run already exists for that month',
        );
      }

      const staff = await tx.staffProfile.findMany({
        where: { tenantId, isActive: true },
        include: staffInclude,
      });

      const created = await tx.payrollRun.create({
        data: {
          tenantId,
          year: input.year,
          month: input.month,
          note: input.note ?? null,
          createdById,
        },
      });

      for (const s of staff) {
        const basicMinor = s.basicSalaryMinor ?? 0;
        // No lines yet, so this is basic pay — but it still goes through the
        // shared function, so there is exactly one definition of "net".
        const totals = computePayslip({ basicMinor, lines: [] });
        await tx.payslip.create({
          data: {
            tenantId,
            runId: created.id,
            staffId: s.id,
            staffNameSnapshot: `${s.user.firstName} ${s.user.lastName}`.trim(),
            staffNoSnapshot: s.staffNo,
            designationSnapshot: s.designation?.name ?? null,
            basicMinor,
            earningsMinor: totals.earningsMinor,
            deductionsMinor: totals.deductionsMinor,
            netMinor: totals.netMinor,
          },
        });
      }

      return created.id;
    });

    return toPayrollRunDto(await this.findRun(tenantId, run));
  }

  /** Editing a payslip is allowed only while its run is still a draft. */
  async updatePayslip(
    tenantId: string,
    id: string,
    input: UpdatePayslipInput,
  ): Promise<Payslip> {
    const current = await this.prisma.payslip.findFirst({
      where: { id, tenantId },
      select: { id: true, basicMinor: true, run: { select: { status: true } } },
    });
    if (!current) throw new NotFoundException('Payslip not found');
    assertRunIsDraft(current.run.status);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.lines) {
        await tx.payslipLine.deleteMany({ where: { payslipId: id } });
        await tx.payslipLine.createMany({
          data: input.lines.map((l, i) => ({
            tenantId,
            payslipId: id,
            kind: l.kind,
            name: l.name,
            amountMinor: l.amountMinor,
            sortOrder: i,
          })),
        });
      }

      const lines = input.lines ?? (await tx.payslipLine.findMany({
        where: { payslipId: id },
        select: { kind: true, amountMinor: true },
      }));
      const basicMinor = input.basicMinor ?? current.basicMinor;
      const totals = computePayslip({ basicMinor, lines });

      return tx.payslip.update({
        where: { id },
        data: {
          basicMinor,
          earningsMinor: totals.earningsMinor,
          deductionsMinor: totals.deductionsMinor,
          netMinor: totals.netMinor,
          ...(input.note === undefined ? {} : { note: input.note }),
        },
        include: payslipInclude,
      });
    });

    return toPayslipDto(updated);
  }

  async finalisePayrollRun(
    tenantId: string,
    finalisedById: string,
    id: string,
  ): Promise<PayrollRun> {
    const run = await this.findRun(tenantId, id);
    assertRunIsDraft(run.status);
    await this.prisma.payrollRun.update({
      where: { id },
      data: { status: 'finalised', finalisedAt: new Date(), finalisedById },
    });
    return toPayrollRunDto(await this.findRun(tenantId, id));
  }

  /** `draft → finalised → paid`, one way. A paid month cannot be reopened. */
  async markPayrollRunPaid(tenantId: string, id: string): Promise<PayrollRun> {
    const run = await this.findRun(tenantId, id);
    assertRunCanBePaid(run.status);
    await this.prisma.payrollRun.update({
      where: { id },
      data: { status: 'paid', paidAt: new Date() },
    });
    return toPayrollRunDto(await this.findRun(tenantId, id));
  }

  // --- internals ------------------------------------------------------

  /**
   * Resolve `decidedById` to a name in one query for the whole page rather than
   * a join per row — the decider is a `User`, and there is no relation on
   * `LeaveRequest` to follow.
   */
  private async withDeciderNames(
    tenantId: string,
    rows: LeaveRequestRow[],
  ): Promise<LeaveRequest[]> {
    const ids = [
      ...new Set(rows.map((r) => r.decidedById).filter((v): v is string => !!v)),
    ];
    const names = new Map<string, string>();
    if (ids.length > 0) {
      const users = await this.prisma.user.findMany({
        where: { tenantId, id: { in: ids } },
        select: { id: true, firstName: true, lastName: true },
      });
      for (const u of users) {
        names.set(u.id, `${u.firstName} ${u.lastName}`.trim());
      }
    }
    return rows.map((r) =>
      toLeaveRequestDto(
        r,
        r.decidedById ? (names.get(r.decidedById) ?? null) : null,
      ),
    );
  }

  private async findRun(tenantId: string, id: string): Promise<PayrollRunRow> {
    const row = await this.prisma.payrollRun.findFirst({
      where: { id, tenantId },
      include: payrollRunInclude,
    });
    if (!row) throw new NotFoundException('Payroll run not found');
    return row;
  }

  /**
   * Serialises everyone opening the same month. `hashtext` maps the key into
   * the 32-bit space the lock takes; a collision only means two unrelated
   * months briefly queue behind each other, which is harmless.
   */
  private async lockPayrollMonth(
    tx: Tx,
    tenantId: string,
    year: number,
    month: number,
  ): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${tenantId}:payroll:${year}-${month}`}))`;
  }

  private dateWindow(
    onDate: string | undefined,
    from: string | undefined,
    to: string | undefined,
  ): { onDate?: Date | { gte?: Date; lte?: Date } } {
    if (onDate) return { onDate: parseIsoDate(onDate) };
    if (!from && !to) return {};
    return {
      onDate: {
        ...(from ? { gte: parseIsoDate(from) } : {}),
        ...(to ? { lte: parseIsoDate(to) } : {}),
      },
    };
  }

  private async ownStaffId(
    tenantId: string,
    userId: string,
  ): Promise<string> {
    const mine = await this.prisma.staffProfile.findFirst({
      where: { tenantId, userId },
      select: { id: true },
    });
    if (!mine) {
      throw new NotFoundException(
        'You do not have a staff record, so leave cannot be applied for',
      );
    }
    return mine.id;
  }

  private async assertStaffAllExist(
    tenantId: string,
    staffIds: string[],
  ): Promise<void> {
    if (staffIds.length === 0) return;
    const found = await this.prisma.staffProfile.count({
      where: { tenantId, id: { in: staffIds } },
    });
    if (found !== staffIds.length) {
      throw new NotFoundException('One or more staff members were not found');
    }
  }

  private async assertReferences(
    tenantId: string,
    departmentId: string | null | undefined,
    designationId: string | null | undefined,
  ): Promise<void> {
    if (departmentId) {
      await this.assertExists(
        this.prisma.department.findFirst({
          where: { id: departmentId, tenantId },
          select: { id: true },
        }),
        'Department',
      );
    }
    if (designationId) {
      await this.assertExists(
        this.prisma.designation.findFirst({
          where: { id: designationId, tenantId },
          select: { id: true },
        }),
        'Designation',
      );
    }
  }

  /**
   * Takes the lookup already bound to its delegate rather than the delegate
   * itself — Prisma's per-model argument types do not survive being widened to
   * a common shape, and widening them is how a tenant filter gets silently
   * dropped.
   */
  private async assertExists(
    lookup: Promise<{ id: string } | null>,
    label: string,
  ): Promise<void> {
    if (!(await lookup)) throw new NotFoundException(`${label} not found`);
  }

  /** Let the unique index be what reports a duplicate name, not a prior read. */
  private async createNamed<T>(
    run: () => Promise<T>,
    message: string,
  ): Promise<T> {
    try {
      return await run();
    } catch (e: unknown) {
      throw this.asConflict(e, message);
    }
  }

  private asConflict(e: unknown, message: string): unknown {
    const code = (e as { code?: string }).code;
    return code === 'P2002' ? new ConflictException(message) : e;
  }
}
