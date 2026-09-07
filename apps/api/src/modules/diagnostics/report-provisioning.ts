import type { Prisma, ServiceDepartment } from '@prisma/client';

/**
 * The slice of a `ServiceOrder` needed to seed its report. `department` is
 * nullable on the order; the test definition's department is the fallback.
 */
export interface ReportOrderSeed {
  id: string;
  serviceId: string | null;
  caseId: string;
  patientId: string;
  department: ServiceDepartment | null;
}

/**
 * Find the single `DiagnosticReport` for an order, or create it. Shared by the
 * orders controller (sample collection) and the diagnostics module (the
 * technician's save), so both derive `patientId`, `caseId`, `department` and
 * `labTestId` from the order's service the same way.
 *
 * `patch` is applied whether the row is found or freshly created.
 */
export async function findOrCreateReportInTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  order: ReportOrderSeed,
  patch?: Partial<Prisma.DiagnosticReportUncheckedCreateInput>,
) {
  const existing = await tx.diagnosticReport.findUnique({
    where: { serviceOrderId: order.id },
  });

  const labTest = order.serviceId
    ? await tx.labTest.findFirst({
        where: { tenantId, serviceId: order.serviceId },
        select: { id: true, department: true },
      })
    : null;

  if (existing) {
    if (!patch) return existing;
    return tx.diagnosticReport.update({ where: { id: existing.id }, data: patch });
  }

  const department: ServiceDepartment =
    order.department ?? labTest?.department ?? 'other';

  return tx.diagnosticReport.create({
    data: {
      tenantId,
      serviceOrderId: order.id,
      patientId: order.patientId,
      caseId: order.caseId,
      labTestId: labTest?.id ?? null,
      department,
      ...patch,
    },
  });
}
