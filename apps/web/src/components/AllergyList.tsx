import { ALLERGY_SEVERITY_LABELS, type PatientAllergy } from '@hms/shared';
import { formatDateTime } from '../lib/format';

/**
 * The structured allergy list — one record per substance, which is what the
 * software checks a prescription or a dispense against. Severity carries a word,
 * never colour alone.
 */
export function AllergyList({
  allergies,
  onDelete,
  deletingId,
}: {
  allergies: readonly PatientAllergy[];
  onDelete?: (id: string) => void;
  deletingId?: string | null;
}) {
  return (
    <ul className="allergy-list">
      {allergies.map((a) => (
        <li key={a.id}>
          <span className="allergy-substance">{a.substance}</span>
          <span className={`badge badge-${a.severity}`}>
            {ALLERGY_SEVERITY_LABELS[a.severity]}
          </span>
          {a.reaction && <span className="allergy-reaction">{a.reaction}</span>}
          <span className="muted" style={{ fontSize: 12 }}>
            recorded {formatDateTime(a.recordedAt)}
            {a.recordedBy ? ` by ${a.recordedBy}` : ''}
          </span>
          {onDelete && (
            <button
              type="button"
              className="secondary no-print"
              style={{ marginLeft: 'auto', padding: '3px 8px', fontSize: 12 }}
              disabled={deletingId === a.id}
              onClick={() => onDelete(a.id)}
            >
              Remove
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
