import { describe, expect, it } from 'vitest';
import { computePayslip, leaveDaysBetween } from '@hms/shared';
import { type PayslipRow, toPayrollRunDto, toPayslipDto } from './hr.mapper.js';
import {
  assertLeaveIsPending,
  assertRunCanBePaid,
  assertRunIsDraft,
} from './hr.service.js';

/**
 * These fix the two things a payroll module must never get wrong: what a person
 * is owed, and who is allowed to change it after the fact.
 */

function line(
  kind: 'earning' | 'deduction',
  name: string,
  amountMinor: number,
  sortOrder = 0,
) {
  return {
    id: `line-${name}`,
    payslipId: 'slip-1',
    tenantId: 't1',
    kind,
    name,
    amountMinor,
    sortOrder,
    createdAt: new Date('2026-09-01T00:00:00Z'),
  };
}

function slip(over: Partial<PayslipRow> = {}): PayslipRow {
  return {
    id: 'slip-1',
    tenantId: 't1',
    runId: 'run-1',
    staffId: 'staff-1',
    staffNameSnapshot: 'Ayesha Malik',
    staffNoSnapshot: 'EMP-000004',
    designationSnapshot: 'Staff Nurse',
    basicMinor: 6_000_000,
    earningsMinor: 0,
    deductionsMinor: 0,
    netMinor: 6_000_000,
    workedDays: 26,
    absentDays: 0,
    leaveDays: 2,
    note: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    lines: [],
    ...over,
  } as PayslipRow;
}

describe('payslip arithmetic', () => {
  it('nets basic plus earnings minus deductions, in paisa', () => {
    const totals = computePayslip({
      basicMinor: 6_000_000,
      lines: [
        { kind: 'earning', amountMinor: 500_000 },
        { kind: 'earning', amountMinor: 250_000 },
        { kind: 'deduction', amountMinor: 120_000 },
      ],
    });
    expect(totals.earningsMinor).toBe(750_000);
    expect(totals.deductionsMinor).toBe(120_000);
    expect(totals.netMinor).toBe(6_630_000);
  });

  it('lets net go negative rather than clamping it away', () => {
    // Somebody who took an advance larger than the month's pay really does owe
    // money back. Hiding that behind a zero would lose it.
    const totals = computePayslip({
      basicMinor: 100_000,
      lines: [{ kind: 'deduction', amountMinor: 250_000 }],
    });
    expect(totals.netMinor).toBe(-150_000);
  });

  it('reports the figures from the lines, not the stored columns', () => {
    // The stored columns here are deliberately wrong. The DTO must still be
    // right: whoever holds the printed payslip is right, not a stale column.
    const dto = toPayslipDto(
      slip({
        earningsMinor: 999_999,
        deductionsMinor: 999_999,
        netMinor: 42,
        lines: [line('earning', 'Allowance', 400_000), line('deduction', 'Tax', 100_000, 1)],
      }),
    );
    expect(dto.earningsMinor).toBe(400_000);
    expect(dto.deductionsMinor).toBe(100_000);
    expect(dto.netMinor).toBe(6_300_000);
  });

  it('shows the snapshot, not the live staff record', () => {
    const dto = toPayslipDto(slip());
    expect(dto.staffName).toBe('Ayesha Malik');
    expect(dto.staffNo).toBe('EMP-000004');
    expect(dto.designation).toBe('Staff Nurse');
  });

  it("totals a run from its payslips' recomputed nets", () => {
    const run = toPayrollRunDto({
      id: 'run-1',
      tenantId: 't1',
      year: 2026,
      month: 9,
      status: 'draft',
      finalisedAt: null,
      finalisedById: null,
      paidAt: null,
      note: null,
      createdById: null,
      createdAt: new Date('2026-09-01T00:00:00Z'),
      updatedAt: new Date('2026-09-01T00:00:00Z'),
      payslips: [
        slip({ id: 'a', netMinor: 1, lines: [] }),
        slip({
          id: 'b',
          basicMinor: 4_000_000,
          netMinor: 1,
          lines: [line('deduction', 'Absence', 200_000)],
        }),
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(run.payslipCount).toBe(2);
    expect(run.totalNetMinor).toBe(6_000_000 + 3_800_000);
  });
});

describe('what can still be changed', () => {
  it('lets a draft run be edited', () => {
    expect(() => assertRunIsDraft('draft')).not.toThrow();
  });

  it('freezes a run once it is finalised or paid', () => {
    expect(() => assertRunIsDraft('finalised')).toThrow(/finalised/);
    expect(() => assertRunIsDraft('paid')).toThrow(/paid/);
  });

  it('will not mark a run paid before it is finalised', () => {
    expect(() => assertRunCanBePaid('draft')).toThrow(/Finalise/);
  });

  it('will not pay the same run twice', () => {
    expect(() => assertRunCanBePaid('finalised')).not.toThrow();
    expect(() => assertRunCanBePaid('paid')).toThrow(/already/);
  });

  it('decides a leave request only while it is pending', () => {
    expect(() => assertLeaveIsPending('pending')).not.toThrow();
    for (const decided of ['approved', 'rejected', 'cancelled'] as const) {
      expect(() => assertLeaveIsPending(decided)).toThrow(/already/);
    }
  });
});

describe('leave day counting', () => {
  it('counts both ends of the range', () => {
    expect(leaveDaysBetween('2026-09-07', '2026-09-07')).toBe(1);
    expect(leaveDaysBetween('2026-09-07', '2026-09-09')).toBe(3);
  });

  it('counts across a month boundary', () => {
    expect(leaveDaysBetween('2026-09-29', '2026-10-02')).toBe(4);
  });

  it('counts across a leap day', () => {
    expect(leaveDaysBetween('2028-02-27', '2028-03-01')).toBe(4);
  });

  it('refuses a backwards range instead of returning a negative', () => {
    expect(leaveDaysBetween('2026-09-09', '2026-09-07')).toBe(0);
  });
});
