import type { Practitioner } from '@prisma/client';
import type { Practitioner as PractitionerDto } from '@hms/shared';

export function toPractitionerDto(p: Practitioner): PractitionerDto {
  return {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    specialty: p.specialty,
    isActive: p.isActive,
  };
}
