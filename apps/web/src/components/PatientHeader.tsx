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
  /** Father's or guardian's name. */
  guardianName?: string | null;
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
  showAllergyBanner = true,
}: {
  patient: HeaderPatient;
  /** Visit-level allergies override the patient record when present. */
  allergies?: string | null;
  actions?: ReactNode;
  linkToProfile?: boolean;
  /** Set false where the screen already shows a louder alert of its own. */
  showAllergyBanner?: boolean;
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
            {/* In Pakistan the father's name is how you tell two patients of
                the same name apart, so it sits with the identifiers rather
                than buried in the demographics further down. */}
            {patient.guardianName && (
              <span>
                S/D/O <strong>{patient.guardianName}</strong>
              </span>
            )}
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

      {allergyText && showAllergyBanner && (
        <div className="banner-danger" role="alert">
          <strong>Allergies</strong>
          {allergyText}
        </div>
      )}
    </div>
  );
}
