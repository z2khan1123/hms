import {
  Controller,
  Get,
  Param,
  Query,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { Audit } from '../../common/audit/audit.decorator.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { requireTenant } from '../../common/auth/require-tenant.js';
import { FhirContentTypeInterceptor } from './fhir-content-type.interceptor.js';
import { FhirExceptionFilter } from './fhir-exception.filter.js';
import { type SearchParams, FhirService } from './fhir.service.js';

/**
 * FHIR R4, read-only.
 *
 * Read-only is a decision rather than a first stage. A generic FHIR write would
 * bypass the rules our own screens enforce — an unpaid order cannot start, blood
 * cannot cross an ABO barrier, a payroll run freezes once finalised — and a
 * standard that let anyone write past them would be a liability, not a feature.
 * Anything that needs to write uses the ordinary API, where those rules live.
 *
 * Authentication and tenancy are the same as everywhere else: a JWT or a scoped
 * API key, and each resource needs the read permission for the data behind it.
 * FHIR is a different shape over the same records, never a different set of
 * permissions.
 */
@Controller('fhir')
@UseFilters(FhirExceptionFilter)
@UseInterceptors(FhirContentTypeInterceptor)
export class FhirController {
  constructor(private readonly fhir: FhirService) {}

  /**
   * The conformance statement. It declares exactly `read` and `search-type`
   * and claims nothing else — a CapabilityStatement that overstates what a
   * server does is how integrations get built against interactions that 405.
   */
  @Get('metadata')
  metadata() {
    const base = this.fhir.baseUrl();
    const resources = [
      { type: 'Patient', params: ['_id', 'identifier', 'name', 'gender', 'birthdate'] },
      { type: 'Practitioner', params: ['_id', 'name'] },
      { type: 'Organization', params: ['_id'] },
      { type: 'Encounter', params: ['_id', 'patient', 'subject'] },
      { type: 'Observation', params: ['_id', 'patient', 'subject', 'category'] },
      { type: 'DiagnosticReport', params: ['_id', 'patient', 'subject'] },
      { type: 'Condition', params: ['_id', 'patient', 'subject', 'encounter'] },
      { type: 'MedicationRequest', params: ['_id', 'patient', 'subject', 'encounter'] },
    ];

    return {
      resourceType: 'CapabilityStatement',
      status: 'active',
      date: new Date().toISOString().slice(0, 10),
      publisher: 'HMS',
      kind: 'instance',
      implementation: { description: 'HMS FHIR R4 façade (read-only)', url: `${base}/fhir` },
      fhirVersion: '4.0.1',
      format: ['application/fhir+json'],
      rest: [
        {
          mode: 'server',
          documentation:
            'Read-only. Writes go through the HMS REST API, which enforces clinical and billing rules a generic FHIR write would bypass.',
          security: {
            description:
              'Bearer JWT, or a scoped API key in X-API-Key. Each resource requires the read permission for the underlying data.',
          },
          resource: resources.map((r) => ({
            type: r.type,
            interaction: [{ code: 'read' }, { code: 'search-type' }],
            searchParam: r.params.map((p) => ({
              name: p,
              type: p === 'birthdate' ? 'date' : p === '_id' ? 'token' : 'string',
            })),
          })),
        },
      ],
    };
  }

  // --- Patient ----------------------------------------------------

  @Get('Patient')
  @Permissions('patient:read')
  @Audit('fhir.patient.search')
  searchPatients(@CurrentUser() user: AuthUser, @Query() query: SearchParams) {
    return this.fhir.searchPatients(requireTenant(user), query);
  }

  @Get('Patient/:id')
  @Permissions('patient:read')
  @Audit('fhir.patient.read')
  readPatient(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.fhir.readPatient(requireTenant(user), id);
  }

  // --- Practitioner and Organization -------------------------------

  @Get('Practitioner')
  @Permissions('practitioner:read')
  searchPractitioners(@CurrentUser() user: AuthUser, @Query() query: SearchParams) {
    return this.fhir.searchPractitioners(requireTenant(user), query);
  }

  @Get('Practitioner/:id')
  @Permissions('practitioner:read')
  readPractitioner(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.fhir.readPractitioner(requireTenant(user), id);
  }

  @Get('Organization/:id')
  @Permissions('patient:read')
  readOrganization(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.fhir.readOrganization(requireTenant(user), id);
  }

  // --- Encounter ---------------------------------------------------

  @Get('Encounter')
  @Permissions('opd:read')
  @Audit('fhir.encounter.search')
  searchEncounters(@CurrentUser() user: AuthUser, @Query() query: SearchParams) {
    return this.fhir.searchEncounters(requireTenant(user), query);
  }

  @Get('Encounter/:id')
  @Permissions('opd:read')
  readEncounter(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.fhir.readEncounter(requireTenant(user), id);
  }

  // --- Observation -------------------------------------------------

  @Get('Observation')
  @Permissions('vital:read')
  @Audit('fhir.observation.search')
  searchObservations(@CurrentUser() user: AuthUser, @Query() query: SearchParams) {
    return this.fhir.searchObservations(requireTenant(user), query);
  }

  @Get('Observation/:id')
  @Permissions('vital:read')
  readObservation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.fhir.readObservation(requireTenant(user), id);
  }

  // --- DiagnosticReport --------------------------------------------

  @Get('DiagnosticReport')
  @Permissions('report:read')
  @Audit('fhir.report.search')
  searchReports(@CurrentUser() user: AuthUser, @Query() query: SearchParams) {
    return this.fhir.searchDiagnosticReports(requireTenant(user), query);
  }

  @Get('DiagnosticReport/:id')
  @Permissions('report:read')
  readReport(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.fhir.readDiagnosticReport(requireTenant(user), id);
  }

  // --- Condition ---------------------------------------------------

  @Get('Condition')
  @Permissions('opd:read')
  @Audit('fhir.condition.search')
  searchConditions(@CurrentUser() user: AuthUser, @Query() query: SearchParams) {
    return this.fhir.searchConditions(requireTenant(user), query);
  }

  @Get('Condition/:id')
  @Permissions('opd:read')
  readCondition(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.fhir.readCondition(requireTenant(user), id);
  }

  // --- MedicationRequest -------------------------------------------

  @Get('MedicationRequest')
  @Permissions('prescription:read')
  @Audit('fhir.medication.search')
  searchMedications(@CurrentUser() user: AuthUser, @Query() query: SearchParams) {
    return this.fhir.searchMedicationRequests(requireTenant(user), query);
  }

  @Get('MedicationRequest/:id')
  @Permissions('prescription:read')
  readMedication(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.fhir.readMedicationRequest(requireTenant(user), id);
  }
}
