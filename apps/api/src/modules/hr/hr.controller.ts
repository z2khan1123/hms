import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  type ApplyLeaveInput,
  type AssignRosterInput,
  type CreateHrNamedInput,
  type CreateLeaveTypeInput,
  type CreatePayrollRunInput,
  type CreateShiftInput,
  type CreateStaffInput,
  type DecideLeaveInput,
  type LeaveBalanceQuery,
  type MarkAttendanceInput,
  type UpdateHrNamedInput,
  type UpdateLeaveTypeInput,
  type UpdatePayslipInput,
  type UpdateShiftInput,
  type UpdateStaffInput,
  applyLeaveSchema,
  assignRosterSchema,
  attendanceListQuerySchema,
  createHrNamedSchema,
  createLeaveTypeSchema,
  createPayrollRunSchema,
  createShiftSchema,
  createStaffSchema,
  decideLeaveSchema,
  includeInactiveQuerySchema,
  leaveBalanceQuerySchema,
  leaveListQuerySchema,
  markAttendanceSchema,
  rosterListQuerySchema,
  staffListQuerySchema,
  updateHrNamedSchema,
  updateLeaveTypeSchema,
  updatePayslipSchema,
  updateShiftSchema,
  updateStaffSchema,
} from '@hms/shared';
import { Audit } from '../../common/audit/audit.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { requireTenant } from '../../common/auth/require-tenant.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  type AttendanceListFilter,
  type LeaveListFilter,
  type RosterListFilter,
  type StaffListFilter,
  HrService,
} from './hr.service.js';

type IncludeInactiveQuery = { includeInactive?: boolean };

/**
 * Literal sub-paths (`staff`, `attendance`, `leave`, `roster`, `payroll/*`) are
 * declared before the `:id` routes nested under them so a param route never
 * swallows a literal.
 *
 * Salary figures and national-ID fragments are personal data, so the staff
 * reads and every payroll read carry `@Audit` — the same treatment a patient's
 * record gets.
 */
@Controller('hr')
export class HrController {
  constructor(private readonly hr: HrService) {}

  // --- departments ------------------------------------------------

  @Get('departments')
  @Permissions('staff:read')
  listDepartments(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(includeInactiveQuerySchema))
    query: IncludeInactiveQuery,
  ) {
    return this.hr.listDepartments(requireTenant(user), query.includeInactive ?? false);
  }

  @Post('departments')
  @Permissions('staff:manage')
  createDepartment(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createHrNamedSchema)) dto: CreateHrNamedInput,
  ) {
    return this.hr.createDepartment(requireTenant(user), dto);
  }

  @Patch('departments/:id')
  @Permissions('staff:manage')
  updateDepartment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateHrNamedSchema)) dto: UpdateHrNamedInput,
  ) {
    return this.hr.updateDepartment(requireTenant(user), id, dto);
  }

  // --- designations -----------------------------------------------

  @Get('designations')
  @Permissions('staff:read')
  listDesignations(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(includeInactiveQuerySchema))
    query: IncludeInactiveQuery,
  ) {
    return this.hr.listDesignations(requireTenant(user), query.includeInactive ?? false);
  }

  @Post('designations')
  @Permissions('staff:manage')
  createDesignation(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createHrNamedSchema)) dto: CreateHrNamedInput,
  ) {
    return this.hr.createDesignation(requireTenant(user), dto);
  }

  @Patch('designations/:id')
  @Permissions('staff:manage')
  updateDesignation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateHrNamedSchema)) dto: UpdateHrNamedInput,
  ) {
    return this.hr.updateDesignation(requireTenant(user), id, dto);
  }

  // --- leave types ------------------------------------------------

  @Get('leave-types')
  @Permissions('leave:read')
  listLeaveTypes(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(includeInactiveQuerySchema))
    query: IncludeInactiveQuery,
  ) {
    return this.hr.listLeaveTypes(requireTenant(user), query.includeInactive ?? false);
  }

  @Post('leave-types')
  @Permissions('leave:approve')
  createLeaveType(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createLeaveTypeSchema)) dto: CreateLeaveTypeInput,
  ) {
    return this.hr.createLeaveType(requireTenant(user), dto);
  }

  @Patch('leave-types/:id')
  @Permissions('leave:approve')
  updateLeaveType(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateLeaveTypeSchema)) dto: UpdateLeaveTypeInput,
  ) {
    return this.hr.updateLeaveType(requireTenant(user), id, dto);
  }

  // --- shifts -----------------------------------------------------

  @Get('shifts')
  @Permissions('roster:read')
  listShifts(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(includeInactiveQuerySchema))
    query: IncludeInactiveQuery,
  ) {
    return this.hr.listShifts(requireTenant(user), query.includeInactive ?? false);
  }

  @Post('shifts')
  @Permissions('roster:manage')
  createShift(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createShiftSchema)) dto: CreateShiftInput,
  ) {
    return this.hr.createShift(requireTenant(user), dto);
  }

  @Patch('shifts/:id')
  @Permissions('roster:manage')
  updateShift(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateShiftSchema)) dto: UpdateShiftInput,
  ) {
    return this.hr.updateShift(requireTenant(user), id, dto);
  }

  // --- staff ------------------------------------------------------

  @Get('staff')
  @Permissions('staff:read')
  @Audit('staff.list')
  listStaff(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(staffListQuerySchema)) query: StaffListFilter,
  ) {
    return this.hr.listStaff(requireTenant(user), query);
  }

  @Post('staff')
  @Permissions('staff:manage')
  @Audit('staff.create')
  createStaff(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createStaffSchema)) dto: CreateStaffInput,
  ) {
    return this.hr.createStaff(requireTenant(user), dto);
  }

  @Get('staff/:id')
  @Permissions('staff:read')
  @Audit('staff.read')
  getStaff(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.hr.getStaff(requireTenant(user), id);
  }

  @Patch('staff/:id')
  @Permissions('staff:manage')
  @Audit('staff.update')
  updateStaff(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateStaffSchema)) dto: UpdateStaffInput,
  ) {
    return this.hr.updateStaff(requireTenant(user), id, dto);
  }

  // --- attendance -------------------------------------------------

  @Get('attendance')
  @Permissions('attendance:read')
  listAttendance(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(attendanceListQuerySchema))
    query: AttendanceListFilter,
  ) {
    return this.hr.listAttendance(requireTenant(user), query);
  }

  @Post('attendance')
  @Permissions('attendance:mark')
  markAttendance(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(markAttendanceSchema)) dto: MarkAttendanceInput,
  ) {
    return this.hr.markAttendance(requireTenant(user), user.id, dto);
  }

  // --- leave ------------------------------------------------------

  @Get('leave/balance')
  @Permissions('leave:read')
  leaveBalance(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(leaveBalanceQuerySchema))
    query: LeaveBalanceQuery,
  ) {
    return this.hr.leaveBalance(requireTenant(user), query.staffId, query.year);
  }

  @Get('leave')
  @Permissions('leave:read')
  listLeave(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(leaveListQuerySchema)) query: LeaveListFilter,
  ) {
    return this.hr.listLeave(requireTenant(user), query);
  }

  @Post('leave')
  @Permissions('leave:apply')
  applyLeave(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(applyLeaveSchema)) dto: ApplyLeaveInput,
  ) {
    return this.hr.applyLeave(requireTenant(user), user.id, dto);
  }

  @Post('leave/:id/decide')
  @Permissions('leave:approve')
  decideLeave(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(decideLeaveSchema)) dto: DecideLeaveInput,
  ) {
    return this.hr.decideLeave(requireTenant(user), user.id, id, dto);
  }

  // --- roster -----------------------------------------------------

  @Get('roster')
  @Permissions('roster:read')
  listRoster(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(rosterListQuerySchema)) query: RosterListFilter,
  ) {
    return this.hr.listRoster(requireTenant(user), query);
  }

  @Post('roster')
  @Permissions('roster:manage')
  assignRoster(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(assignRosterSchema)) dto: AssignRosterInput,
  ) {
    return this.hr.assignRoster(requireTenant(user), user.id, dto);
  }

  // --- payroll ----------------------------------------------------

  @Get('payroll/runs')
  @Permissions('payroll:read')
  @Audit('payroll.list')
  listPayrollRuns(@CurrentUser() user: AuthUser) {
    return this.hr.listPayrollRuns(requireTenant(user));
  }

  @Post('payroll/runs')
  @Permissions('payroll:manage')
  @Audit('payroll.run.create')
  createPayrollRun(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createPayrollRunSchema))
    dto: CreatePayrollRunInput,
  ) {
    return this.hr.createPayrollRun(requireTenant(user), user.id, dto);
  }

  @Get('payroll/runs/:id')
  @Permissions('payroll:read')
  @Audit('payroll.run.read')
  getPayrollRun(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.hr.getPayrollRun(requireTenant(user), id);
  }

  @Post('payroll/runs/:id/finalise')
  @Permissions('payroll:manage')
  @Audit('payroll.run.finalise')
  finalisePayrollRun(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.hr.finalisePayrollRun(requireTenant(user), user.id, id);
  }

  @Post('payroll/runs/:id/pay')
  @Permissions('payroll:manage')
  @Audit('payroll.run.pay')
  markPayrollRunPaid(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.hr.markPayrollRunPaid(requireTenant(user), id);
  }

  @Patch('payroll/slips/:id')
  @Permissions('payroll:manage')
  @Audit('payroll.slip.update')
  updatePayslip(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePayslipSchema)) dto: UpdatePayslipInput,
  ) {
    return this.hr.updatePayslip(requireTenant(user), id, dto);
  }
}
