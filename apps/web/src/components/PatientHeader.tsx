import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatAge, type Gender } from '@hms/shared';

/** Structural shape satisfied by both `Patient` and `PatientSummary`. */
export interface HeaderPatient {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  gender: Gender;
  birthDate: string;
  phone: string;
  knownAllergies: string | null;
}

/**
 * The identity strip that sits above every clinical screen. The allergy banner is
 * deliberately loud — an unread allergies field is the biggest safety gap in the
 * products we benchmarked against.
 */
export function PatientHeader({
  patient,
  allergies,
  actions,
  linkToProfile = true,
}: {
  patient: HeaderPatient;
  /** Visit-level allergies override the patient record when present. */
  allergies?: string | null;
  actions?: ReactNode;
  linkToProfile?: boolean;
}) {
  const allergyText = allergies?.trim() || patient.knownAllergies?.trim() || '';
  const name = `${patient.firstName} ${patient.lastName}`;

  return (
    <div className="card patient-header">
      <div className="patient-header-main">
        <div>
          <h2>
            {linkToProfile ? <Link to={`/patients/${patient.id}`}>{name}</Link> : name}
          </h2>
          <div className="patient-meta">
            <span>
              MRN <strong>{patient.mrn}</strong>
            </span>
            <span>
              Age <strong>{formatAge(patient.birthDate)}</strong>
            </span>
            <span>
              Gender <strong>{patient.gender}</strong>
            </span>
            <span>
              Phone <strong>{patient.phone}</strong>
            </span>
          </div>
        </div>
        {actions && <div className="row no-print">{actions}</div>}
      </div>

      {allergyText && (
        <div className="banner-danger" role="alert">
          <strong>Allergies</strong>
          {allergyText}
        </div>
      )}
    </div>
  );
}
