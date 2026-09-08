import { Injectable, NotFoundException } from '@nestjs/common';
import {
  type PortalAppointment,
  type PortalBill,
  type PortalPrescription,
  type PortalReport,
  type PortalSummary,
  type PortalVisit,
  type RequestAppointmentInput,
  computeCaseBalance,
} from '@hms/shared';
import { parseIsoDate, toIsoDate, toIsoDateTimeOrNull } from '../../common/util/dates.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * What a patient can see of their own record.
 *
 * Every single query here filters on the `patientId` taken from the token —
 * never from a path or a body. There is no endpoint that accepts a patient id,
 * because an endpoint that accepts one is an endpoint somebody will eventually
 * call with a different one.
 */
@Injectable()
export class PortalService {
  constructor(private readonly prisma: PrismaService) {}

  private name(p: { firstName: string; lastName: string } | null): string | null {
    return p ? `${p.firstName} ${p.lastName}`.trim() : null;
  }

  async summary(tenantId: string, patientId: string): Promise<PortalSummary> {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, tenantId, deletedAt: null },
      select: {
        id: true,
        mrn: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        phone: true,
      },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    const [visitCount, lastVisit, upcoming, reports, cases] = await Promise.all([
      this.prisma.opdVisit.count({ where: { tenantId, patientId } }),
      this.prisma.opdVisit.findFirst({
        where: { tenantId, patientId },
        orderBy: { visitAt: 'desc' },
        select: { visitAt: true },
      }),
      this.prisma.appointment.count({
        where: {
          tenantId,
          patientId,
          startsAt: { gte: new Date() },
          status: { in: ['booked', 'arrived'] },
        },
      }),
      // Only finalised reports are ever counted, so the number on the dashboard
      // matches the list they can actually open.
      this.prisma.diagnosticReport.count({
        where: { tenantId, patientId, reportedAt: { not: null } },
      }),
      this.prisma.case.findMany({
        where: { tenantId, patientId },
        select: {
          billItems: { select: { netMinor: true, status: true } },
          payments: { select: { amountMinor: true, reversedAt: true } },
        },
      }),
    ]);

    let outstanding = 0;
    for (const c of cases) {
      outstanding += computeCaseBalance(
        c.billItems,
        c.payments.map((p) => ({
          amountMinor: p.amountMinor,
          reversedAt: toIsoDateTimeOrNull(p.reversedAt),
        })),
      ).balanceMinor;
    }

    return {
      patient: {
        id: patient.id,
        mrn: patient.mrn,
        firstName: patient.firstName,
        lastName: patient.lastName,
        birthDate: toIsoDate(patient.birthDate),
        phone: patient.phone,
      },
      visitCount,
      lastVisitAt: toIsoDateTimeOrNull(lastVisit?.visitAt),
      upcomingAppointments: upcoming,
      finalisedReports: reports,
      outstandingBalanceMinor: outstanding,
    };
  }

  async visits(tenantId: string, patientId: string): Promise<PortalVisit[]> {
    const rows = await this.prisma.opdVisit.findMany({
      where: { tenantId, patientId },
      include: {
        practitioner: { select: { firstName: true, lastName: true } },
        diagnoses: { include: { icd10Code: { select: { code: true, title: true } } } },
      },
      orderBy: { visitAt: 'desc' },
      take: 100,
    });
    return rows.map((v) => ({
      id: v.id,
      opdNo: v.opdNo,
      visitAt: v.visitAt.toISOString(),
      doctor: this.name(v.practitioner),
      status: v.status,
      diagnoses: v.diagnoses.map((d) => ({
        code: d.icd10Code.code,
        title: d.icd10Code.title,
      })),
    }));
  }

  async prescriptions(
    tenantId: string,
    patientId: string,
  ): Promise<PortalPrescription[]> {
    const rows = await this.prisma.prescriptionItem.findMany({
      where: { tenantId, opdVisit: { patientId } },
      include: {
        opdVisit: {
          select: {
            id: true,
            visitAt: true,
            practitioner: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((p) => ({
      id: p.id,
      visitId: p.opdVisit.id,
      prescribedAt: p.createdAt.toISOString(),
      doctor: this.name(p.opdVisit.practitioner),
      drugName: p.drugName,
      dose: p.dose,
      frequency: p.frequency,
      durationDays: p.durationDays,
      instructions: p.instructions,
    }));
  }

  /**
   * Finalised reports only.
   *
   * A patient reading a draft result before a clinician has released it is how
   * somebody learns they have cancer from a web page at two in the morning.
   * The filter is `reportedAt: { not: null }` and it is not optional.
   */
  async reports(tenantId: string, patientId: string): Promise<PortalReport[]> {
    const rows = await this.prisma.diagnosticReport.findMany({
      where: { tenantId, patientId, reportedAt: { not: null } },
      include: {
        serviceOrder: { select: { serviceName: true } },
        values: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { reportedAt: 'desc' },
      take: 100,
    });

    return rows.map((r) => ({
      id: r.id,
      serviceName: r.serviceOrder.serviceName,
      department: r.department,
      reportedAt: toIsoDateTimeOrNull(r.reportedAt),
      isFinal: true as const,
      impression: r.impression,
      values: r.values.map((v) => ({
        name: v.name,
        value: v.valueNumber !== null ? String(v.valueNumber) : (v.valueText ?? ''),
        unit: v.unit,
        flag: v.flag,
        referenceRange:
          v.refText ??
          (v.refLow !== null || v.refHigh !== null
            ? `${v.refLow ?? ''} – ${v.refHigh ?? ''}`.trim()
            : null),
      })),
    }));
  }

  async bills(tenantId: string, patientId: string): Promise<PortalBill[]> {
    const rows = await this.prisma.case.findMany({
      where: { tenantId, patientId },
      include: {
        billItems: { orderBy: { chargedAt: 'desc' } },
        payments: true,
      },
      orderBy: { openedAt: 'desc' },
      take: 50,
    });

    return rows.map((c) => {
      const totals = computeCaseBalance(
        c.billItems,
        c.payments.map((p) => ({
          amountMinor: p.amountMinor,
          reversedAt: toIsoDateTimeOrNull(p.reversedAt),
        })),
      );
      return {
        caseId: c.id,
        caseNo: c.caseNo,
        openedAt: c.openedAt.toISOString(),
        status: c.status,
        chargedMinor: totals.chargedMinor,
        paidMinor: totals.paidMinor,
        balanceMinor: totals.balanceMinor,
        items: c.billItems.map((i) => ({
          id: i.id,
          name: i.serviceName,
          chargedAt: i.chargedAt.toISOString(),
          quantity: i.quantity,
          netMinor: i.netMinor,
          status: i.status,
        })),
      };
    });
  }

  async appointments(
    tenantId: string,
    patientId: string,
  ): Promise<PortalAppointment[]> {
    const rows = await this.prisma.appointment.findMany({
      where: { tenantId, patientId },
      include: { practitioner: { select: { firstName: true, lastName: true } } },
      orderBy: { startsAt: 'desc' },
      take: 50,
    });
    return rows.map((a) => ({
      id: a.id,
      scheduledAt: a.startsAt.toISOString(),
      doctor: this.name(a.practitioner),
      status: a.status,
      reason: a.reason,
    }));
  }

  /**
   * A request, not a booking. The desk turns it into a real appointment —
   * letting the portal write into the diary would let anyone fill a clinic
   * overnight.
   */
  async requestAppointment(
    tenantId: string,
    patientId: string,
    input: RequestAppointmentInput,
  ): Promise<{ id: string; status: string; preferredDate: string }> {
    if (input.practitionerId) {
      const doctor = await this.prisma.practitioner.findFirst({
        where: { id: input.practitionerId, tenantId, isActive: true },
        select: { id: true },
      });
      if (!doctor) throw new NotFoundException('That doctor is not available');
    }

    const created = await this.prisma.appointmentRequest.create({
      data: {
        tenantId,
        patientId,
        practitionerId: input.practitionerId ?? null,
        preferredDate: parseIsoDate(input.preferredDate),
        reason: input.reason ?? null,
      },
    });
    return {
      id: created.id,
      status: created.status,
      preferredDate: toIsoDate(created.preferredDate),
    };
  }

  async myRequests(tenantId: string, patientId: string) {
    const rows = await this.prisma.appointmentRequest.findMany({
      where: { tenantId, patientId },
      include: { practitioner: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => ({
      id: r.id,
      preferredDate: toIsoDate(r.preferredDate),
      doctor: this.name(r.practitioner),
      reason: r.reason,
      status: r.status,
      declineReason: r.declineReason,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // --- staff side: the request queue -----------------------------------

  async listRequests(tenantId: string, status?: string) {
    const rows = await this.prisma.appointmentRequest.findMany({
      where: { tenantId, ...(status ? { status: status as 'pending' } : {}) },
      include: {
        patient: { select: { mrn: true, firstName: true, lastName: true, phone: true } },
        practitioner: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ status: 'asc' }, { preferredDate: 'asc' }],
      take: 200,
    });
    return rows.map((r) => ({
      id: r.id,
      patientId: r.patientId,
      mrn: r.patient.mrn,
      patientName: `${r.patient.firstName} ${r.patient.lastName}`.trim(),
      phone: r.patient.phone,
      doctor: this.name(r.practitioner),
      practitionerId: r.practitionerId,
      preferredDate: toIsoDate(r.preferredDate),
      reason: r.reason,
      status: r.status,
      declineReason: r.declineReason,
      appointmentId: r.appointmentId,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async declineRequest(
    tenantId: string,
    handledById: string,
    id: string,
    reason: string,
  ) {
    const found = await this.prisma.appointmentRequest.findFirst({
      where: { id, tenantId, status: 'pending' },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Request not found, or already handled');
    await this.prisma.appointmentRequest.update({
      where: { id },
      data: {
        status: 'declined',
        declineReason: reason,
        handledById,
        handledAt: new Date(),
      },
    });
  }

  /** Link a request to the appointment the desk created from it. */
  async markBooked(
    tenantId: string,
    handledById: string,
    id: string,
    appointmentId: string,
  ) {
    const found = await this.prisma.appointmentRequest.findFirst({
      where: { id, tenantId, status: 'pending' },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Request not found, or already handled');
    await this.prisma.appointmentRequest.update({
      where: { id },
      data: {
        status: 'booked',
        appointmentId,
        handledById,
        handledAt: new Date(),
      },
    });
  }
}
