import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  admissionToEncounter,
  diagnosticValueToObservation,
  opdVisitToEncounter,
  toFhirCondition,
  toFhirDiagnosticReport,
  toFhirMedicationRequest,
  toFhirOrganization,
  toFhirPatient,
  toFhirPractitioner,
  vitalToObservation,
} from './fhir.mapper.js';
import type { FhirBundle, FhirResource } from './fhir.types.js';

/** FHIR's default page size, and the cap we will honour. */
const DEFAULT_COUNT = 20;
const MAX_COUNT = 200;

export interface SearchParams {
  _id?: string;
  _count?: string;
  _offset?: string;
  identifier?: string;
  name?: string;
  gender?: string;
  birthdate?: string;
  patient?: string;
  subject?: string;
  encounter?: string;
  status?: string;
  category?: string;
}

/**
 * A read-only FHIR R4 façade.
 *
 * Read-only is a decision, not a stage. Accepting writes means accepting
 * someone else's idea of what a valid record is, and our own screens enforce
 * rules — an unpaid order cannot start, blood cannot be issued across an ABO
 * barrier — that a generic FHIR write would bypass entirely. Anything that
 * needs to write uses the ordinary API, where those rules live.
 *
 * Every query is tenant-scoped from the caller's token, exactly like the rest
 * of the system. FHIR is a different shape over the same data, never a
 * different set of permissions.
 */
@Injectable()
export class FhirService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** The absolute base this deployment publishes itself at. */
  baseUrl(): string {
    return (
      this.config.get<string>('PUBLIC_BASE_URL') ?? 'http://localhost:3000/api'
    );
  }

  private page(params: SearchParams): { take: number; skip: number } {
    const count = Number(params._count);
    const offset = Number(params._offset);
    return {
      take: Number.isFinite(count)
        ? Math.min(Math.max(1, Math.trunc(count)), MAX_COUNT)
        : DEFAULT_COUNT,
      skip: Number.isFinite(offset) ? Math.max(0, Math.trunc(offset)) : 0,
    };
  }

  /**
   * A searchset Bundle. `total` is how many matched, not how many are in this
   * page — a consumer that conflates the two silently stops at page one.
   */
  private bundle<T extends FhirResource>(
    type: string,
    resources: T[],
    total: number,
    params: SearchParams,
    { take, skip }: { take: number; skip: number },
  ): FhirBundle<T> {
    const base = this.baseUrl();
    const qs = (extra: Record<string, string>) => {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && k !== '_offset') sp.set(k, String(v));
      }
      for (const [k, v] of Object.entries(extra)) sp.set(k, v);
      return sp.toString();
    };

    const link: FhirBundle<T>['link'] = [
      {
        relation: 'self',
        url: `${base}/fhir/${type}?${qs({ _offset: String(skip), _count: String(take) })}`,
      },
    ];
    if (skip + resources.length < total) {
      link.push({
        relation: 'next',
        url: `${base}/fhir/${type}?${qs({ _offset: String(skip + take), _count: String(take) })}`,
      });
    }

    return {
      resourceType: 'Bundle',
      type: 'searchset',
      total,
      link,
      entry: resources.map((r) => ({
        fullUrl: `${base}/fhir/${type}/${r.id}`,
        resource: r,
        search: { mode: 'match' },
      })),
    };
  }

  // --- Patient --------------------------------------------------------

  private readonly patientSelect = {
    id: true,
    mrn: true,
    firstName: true,
    lastName: true,
    gender: true,
    birthDate: true,
    phone: true,
    alternatePhone: true,
    email: true,
    address: true,
    maritalStatus: true,
    status: true,
    updatedAt: true,
    deathRecord: { select: { diedAt: true } },
  } as const;

  async searchPatients(tenantId: string, params: SearchParams) {
    const { take, skip } = this.page(params);
    const where = {
      tenantId,
      deletedAt: null,
      ...(params._id ? { id: params._id } : {}),
      // FHIR `identifier` may arrive bare or as `system|value`.
      ...(params.identifier
        ? { mrn: params.identifier.split('|').pop() ?? params.identifier }
        : {}),
      ...(params.gender ? { gender: params.gender as 'male' } : {}),
      ...(params.birthdate ? { birthDate: new Date(params.birthdate) } : {}),
      ...(params.name
        ? {
            OR: [
              { firstName: { contains: params.name, mode: 'insensitive' as const } },
              { lastName: { contains: params.name, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.patient.findMany({
        where,
        select: this.patientSelect,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.patient.count({ where }),
    ]);

    const base = this.baseUrl();
    return this.bundle(
      'Patient',
      rows.map((r) => toFhirPatient(r, base, tenantId)),
      total,
      params,
      { take, skip },
    );
  }

  async readPatient(tenantId: string, id: string) {
    const row = await this.prisma.patient.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: this.patientSelect,
    });
    if (!row) throw new NotFoundException('Patient not found');
    return toFhirPatient(row, this.baseUrl(), tenantId);
  }

  // --- Practitioner and Organization ----------------------------------

  async searchPractitioners(tenantId: string, params: SearchParams) {
    const { take, skip } = this.page(params);
    const where = {
      tenantId,
      ...(params._id ? { id: params._id } : {}),
      ...(params.name
        ? {
            OR: [
              { firstName: { contains: params.name, mode: 'insensitive' as const } },
              { lastName: { contains: params.name, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.practitioner.findMany({ where, take, skip, orderBy: { lastName: 'asc' } }),
      this.prisma.practitioner.count({ where }),
    ]);
    return this.bundle('Practitioner', rows.map(toFhirPractitioner), total, params, {
      take,
      skip,
    });
  }

  async readPractitioner(tenantId: string, id: string) {
    const row = await this.prisma.practitioner.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Practitioner not found');
    return toFhirPractitioner(row);
  }

  async readOrganization(tenantId: string, id: string) {
    // A tenant may only ever read itself. Any other id is simply not found.
    if (id !== tenantId) throw new NotFoundException('Organization not found');
    const row = await this.prisma.tenant.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Organization not found');
    return toFhirOrganization(row);
  }

  // --- Encounter ------------------------------------------------------

  /**
   * OPD visits and admissions are both Encounters. They live in separate
   * tables here, so a search reads both, merges by date and pages the result.
   */
  async searchEncounters(tenantId: string, params: SearchParams) {
    const { take, skip } = this.page(params);
    const patientId = this.referenceId(params.patient ?? params.subject);
    const base = this.baseUrl();

    const visitWhere = {
      tenantId,
      ...(params._id ? { id: params._id } : {}),
      ...(patientId ? { patientId } : {}),
    };
    const admissionWhere = { ...visitWhere };

    const [visits, admissions] = await Promise.all([
      this.prisma.opdVisit.findMany({
        where: visitWhere,
        orderBy: { visitAt: 'desc' },
        take: take + skip,
      }),
      this.prisma.admission.findMany({
        where: admissionWhere,
        orderBy: { admittedAt: 'desc' },
        take: take + skip,
      }),
    ]);

    const merged = [
      ...visits.map((v) => ({ at: v.visitAt, r: opdVisitToEncounter(v, base) })),
      ...admissions.map((a) => ({ at: a.admittedAt, r: admissionToEncounter(a, base) })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .map((x) => x.r);

    return this.bundle(
      'Encounter',
      merged.slice(skip, skip + take),
      merged.length,
      params,
      { take, skip },
    );
  }

  async readEncounter(tenantId: string, id: string) {
    const base = this.baseUrl();
    const visit = await this.prisma.opdVisit.findFirst({ where: { id, tenantId } });
    if (visit) return opdVisitToEncounter(visit, base);
    const admission = await this.prisma.admission.findFirst({ where: { id, tenantId } });
    if (admission) return admissionToEncounter(admission, base);
    throw new NotFoundException('Encounter not found');
  }

  // --- Observation ----------------------------------------------------

  /**
   * Vitals and lab values are both Observations, distinguished by `category`.
   * A consumer asking for `category=vital-signs` gets only vitals.
   */
  async searchObservations(tenantId: string, params: SearchParams) {
    const { take, skip } = this.page(params);
    const patientId = this.referenceId(params.patient ?? params.subject);
    const wantVitals = !params.category || params.category.includes('vital-signs');
    const wantLabs = !params.category || params.category.includes('laboratory');

    const vitals = wantVitals
      ? await this.prisma.vitalReading.findMany({
          where: {
            tenantId,
            ...(params._id ? { id: params._id } : {}),
            ...(patientId ? { patientId } : {}),
          },
          include: { vitalType: true },
          orderBy: { recordedAt: 'desc' },
          take: take + skip,
        })
      : [];

    const labs = wantLabs
      ? await this.prisma.diagnosticValue.findMany({
          where: {
            tenantId,
            ...(params._id ? { id: params._id } : {}),
            ...(patientId ? { report: { patientId } } : {}),
          },
          include: {
            report: {
              select: { patientId: true, reportedAt: true, serviceOrderId: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: take + skip,
        })
      : [];

    const merged = [
      ...vitals.map((v) => ({ at: v.recordedAt, r: vitalToObservation(v) })),
      ...labs.map((d) => ({
        at: d.report.reportedAt ?? d.createdAt,
        r: diagnosticValueToObservation(d, d.report),
      })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .map((x) => x.r);

    return this.bundle(
      'Observation',
      merged.slice(skip, skip + take),
      merged.length,
      params,
      { take, skip },
    );
  }

  async readObservation(tenantId: string, id: string) {
    const vital = await this.prisma.vitalReading.findFirst({
      where: { id, tenantId },
      include: { vitalType: true },
    });
    if (vital) return vitalToObservation(vital);

    const value = await this.prisma.diagnosticValue.findFirst({
      where: { id, tenantId },
      include: {
        report: { select: { patientId: true, reportedAt: true, serviceOrderId: true } },
      },
    });
    if (value) return diagnosticValueToObservation(value, value.report);

    throw new NotFoundException('Observation not found');
  }

  // --- DiagnosticReport -----------------------------------------------

  async searchDiagnosticReports(tenantId: string, params: SearchParams) {
    const { take, skip } = this.page(params);
    const patientId = this.referenceId(params.patient ?? params.subject);
    const where = {
      tenantId,
      ...(params._id ? { id: params._id } : {}),
      ...(patientId ? { patientId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.diagnosticReport.findMany({
        where,
        include: {
          values: { select: { id: true } },
          serviceOrder: { select: { serviceName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.diagnosticReport.count({ where }),
    ]);
    return this.bundle(
      'DiagnosticReport',
      rows.map(toFhirDiagnosticReport),
      total,
      params,
      { take, skip },
    );
  }

  async readDiagnosticReport(tenantId: string, id: string) {
    const row = await this.prisma.diagnosticReport.findFirst({
      where: { id, tenantId },
      include: {
        values: { select: { id: true } },
        serviceOrder: { select: { serviceName: true } },
      },
    });
    if (!row) throw new NotFoundException('DiagnosticReport not found');
    return toFhirDiagnosticReport(row);
  }

  // --- Condition ------------------------------------------------------

  async searchConditions(tenantId: string, params: SearchParams) {
    const { take, skip } = this.page(params);
    const patientId = this.referenceId(params.patient ?? params.subject);
    const where = {
      tenantId,
      ...(params._id ? { id: params._id } : {}),
      ...(patientId ? { opdVisit: { patientId } } : {}),
      ...(params.encounter
        ? { opdVisitId: this.referenceId(params.encounter) ?? undefined }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.visitDiagnosis.findMany({
        where,
        include: { icd10Code: true, opdVisit: { select: { patientId: true } } },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.visitDiagnosis.count({ where }),
    ]);
    return this.bundle('Condition', rows.map(toFhirCondition), total, params, {
      take,
      skip,
    });
  }

  async readCondition(tenantId: string, id: string) {
    const row = await this.prisma.visitDiagnosis.findFirst({
      where: { id, tenantId },
      include: { icd10Code: true, opdVisit: { select: { patientId: true } } },
    });
    if (!row) throw new NotFoundException('Condition not found');
    return toFhirCondition(row);
  }

  // --- MedicationRequest ----------------------------------------------

  async searchMedicationRequests(tenantId: string, params: SearchParams) {
    const { take, skip } = this.page(params);
    const patientId = this.referenceId(params.patient ?? params.subject);
    const where = {
      tenantId,
      ...(params._id ? { id: params._id } : {}),
      ...(patientId ? { opdVisit: { patientId } } : {}),
      ...(params.encounter
        ? { opdVisitId: this.referenceId(params.encounter) ?? undefined }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.prescriptionItem.findMany({
        where,
        include: {
          opdVisit: { select: { patientId: true, practitionerId: true } },
        },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.prescriptionItem.count({ where }),
    ]);
    return this.bundle(
      'MedicationRequest',
      rows.map(toFhirMedicationRequest),
      total,
      params,
      { take, skip },
    );
  }

  async readMedicationRequest(tenantId: string, id: string) {
    const row = await this.prisma.prescriptionItem.findFirst({
      where: { id, tenantId },
      include: { opdVisit: { select: { patientId: true, practitionerId: true } } },
    });
    if (!row) throw new NotFoundException('MedicationRequest not found');
    return toFhirMedicationRequest(row);
  }

  /** `Patient/<uuid>` or a bare uuid — FHIR consumers send both. */
  private referenceId(value: string | undefined): string | undefined {
    if (!value) return undefined;
    const id = value.includes('/') ? value.split('/').pop() : value;
    return id && /^[0-9a-f-]{36}$/i.test(id) ? id : undefined;
  }
}
