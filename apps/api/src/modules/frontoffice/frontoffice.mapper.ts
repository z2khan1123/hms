import type { Prisma, PostalLog } from '@prisma/client';
import {
  type Complaint as ComplaintDto,
  type PhoneCall as PhoneCallDto,
  type PostalItem as PostalItemDto,
  type Visitor as VisitorDto,
  complaintAgeDays,
} from '@hms/shared';
import { toIsoDate, toIsoDateOrNull, toIsoDateTimeOrNull } from '../../common/util/dates.js';
import { patientSummarySelect, toPatientSummary } from '../patients/patients.mapper.js';

export const patientOnly = {
  patient: { select: patientSummarySelect },
} as const;

export type VisitorRow = Prisma.VisitorLogGetPayload<{
  include: typeof patientOnly;
}>;

export function toVisitorDto(r: VisitorRow, recordedBy: string | null): VisitorDto {
  return {
    id: r.id,
    passNo: r.passNo,
    name: r.name,
    phone: r.phone,
    patient: r.patient ? toPatientSummary(r.patient) : null,
    visitingWhom: r.visitingWhom,
    purpose: r.purpose,
    idCardLast4: r.idCardLast4,
    numberOfVisitors: r.numberOfVisitors,
    arrivedAt: r.arrivedAt.toISOString(),
    leftAt: toIsoDateTimeOrNull(r.leftAt),
    note: r.note,
    recordedBy,
    // Derived from `leftAt`, which is what makes the "still inside" list
    // trustworthy enough to evacuate a building with.
    isInside: !r.leftAt,
  };
}

export type PhoneCallRow = Prisma.PhoneCallLogGetPayload<{
  include: typeof patientOnly;
}>;

export function toPhoneCallDto(
  r: PhoneCallRow,
  recordedBy: string | null,
): PhoneCallDto {
  return {
    id: r.id,
    direction: r.direction,
    callerName: r.callerName,
    phone: r.phone,
    patient: r.patient ? toPatientSummary(r.patient) : null,
    purpose: r.purpose,
    calledAt: r.calledAt.toISOString(),
    durationMinutes: r.durationMinutes,
    outcome: r.outcome,
    followUpOn: toIsoDateOrNull(r.followUpOn),
    note: r.note,
    recordedBy,
  };
}

export function toPostalItemDto(
  r: PostalLog,
  recordedBy: string | null,
): PostalItemDto {
  return {
    id: r.id,
    direction: r.direction,
    party: r.party,
    addressedTo: r.addressedTo,
    reference: r.reference,
    courier: r.courier,
    trackingNo: r.trackingNo,
    onDate: toIsoDate(r.onDate),
    note: r.note,
    recordedBy,
  };
}

export const complaintInclude = {
  patient: { select: patientSummarySelect },
  assignedTo: { select: { firstName: true, lastName: true } },
} as const;

export type ComplaintRow = Prisma.ComplaintGetPayload<{
  include: typeof complaintInclude;
}>;

export function toComplaintDto(
  r: ComplaintRow,
  recordedBy: string | null,
  now: string,
): ComplaintDto {
  return {
    id: r.id,
    reference: r.reference,
    complainantName: r.complainantName,
    phone: r.phone,
    patient: r.patient ? toPatientSummary(r.patient) : null,
    about: r.about,
    severity: r.severity,
    description: r.description,
    status: r.status,
    assignedTo: r.assignedTo
      ? `${r.assignedTo.firstName} ${r.assignedTo.lastName}`.trim()
      : null,
    resolution: r.resolution,
    receivedAt: r.receivedAt.toISOString(),
    resolvedAt: toIsoDateTimeOrNull(r.resolvedAt),
    recordedBy,
    // Age stops counting when it was resolved, so an old closed complaint does
    // not keep inflating as if nobody had dealt with it.
    ageDays: complaintAgeDays(
      r.receivedAt.toISOString(),
      toIsoDateTimeOrNull(r.resolvedAt),
      now,
    ),
  };
}
