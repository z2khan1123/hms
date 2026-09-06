import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import {
  BLOOD_TYPES,
  createPatientSchema,
  updatePatientSchema,
  type CreatePatientInput,
  type Gender,
  type MaritalStatus,
  type Tpa,
} from '@hms/shared';
import { api } from '../lib/api';
import { ErrorNote } from './QueryFeedback';

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'unknown', label: 'Unknown' },
];

const MARITAL_STATUSES: { value: MaritalStatus; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'married', label: 'Married' },
  { value: 'widowed', label: 'Widowed' },
  { value: 'separated', label: 'Separated' },
  { value: 'not_specified', label: 'Not specified' },
];

/**
 * Blank inputs must not reach the schema: `''` fails `.email()`, the CNIC regex and
 * the address' required fields. Dropping empties turns "left blank" into "absent",
 * which is what every optional field in `createPatientSchema` actually means. An
 * address whose fields are all blank collapses to `undefined` rather than tripping
 * the required `line1`/`city` rules.
 */
function stripEmpty(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripEmpty);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      const cleaned = stripEmpty(raw);
      if (cleaned !== undefined) out[key] = cleaned;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }
  if (typeof value === 'string') return value.trim() === '' ? undefined : value.trim();
  return value;
}

const createResolverSchema = z.preprocess(stripEmpty, createPatientSchema);
const updateResolverSchema = z.preprocess(stripEmpty, updatePatientSchema);

export interface PatientFormProps {
  mode: 'create' | 'edit';
  defaultValues?: Partial<CreatePatientInput>;
  submitLabel: string;
  pending: boolean;
  serverError: unknown;
  onSubmit: (values: CreatePatientInput) => void;
}

export function PatientForm({
  mode,
  defaultValues,
  submitLabel,
  pending,
  serverError,
  onSubmit,
}: PatientFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreatePatientInput>({
    resolver: zodResolver(
      mode === 'create' ? createResolverSchema : updateResolverSchema,
    ),
    defaultValues: { gender: 'unknown', phone: '+92', ...defaultValues },
  });

  const tpas = useQuery({
    queryKey: ['tpa', 'list'],
    queryFn: async () => {
      const { data } = await api.get<Tpa[]>('/tpa');
      return data;
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <ErrorNote error={serverError} />

      <div className="card">
        <div className="section">
          <h2>Identity</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="firstName">First name</label>
              <input id="firstName" autoFocus {...register('firstName')} />
              {errors.firstName && (
                <span className="field-error">{errors.firstName.message}</span>
              )}
            </div>
            <div className="field">
              <label htmlFor="lastName">Last name</label>
              <input id="lastName" {...register('lastName')} />
              {errors.lastName && (
                <span className="field-error">{errors.lastName.message}</span>
              )}
            </div>
            <div className="field">
              <label htmlFor="guardianName">Guardian name</label>
              <input id="guardianName" {...register('guardianName')} />
              {errors.guardianName && (
                <span className="field-error">{errors.guardianName.message}</span>
              )}
            </div>
            <div className="field">
              <label htmlFor="gender">Gender</label>
              <select id="gender" {...register('gender')}>
                {GENDERS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
              {errors.gender && (
                <span className="field-error">{errors.gender.message}</span>
              )}
            </div>
            <div className="field">
              <label htmlFor="birthDate">Date of birth</label>
              <input id="birthDate" type="date" {...register('birthDate')} />
              {errors.birthDate && (
                <span className="field-error">{errors.birthDate.message}</span>
              )}
            </div>
            <div className="field">
              <label htmlFor="maritalStatus">Marital status</label>
              <select id="maritalStatus" {...register('maritalStatus')}>
                <option value="">—</option>
                {MARITAL_STATUSES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="bloodType">Blood group</label>
              <select id="bloodType" {...register('bloodType')}>
                <option value="">—</option>
                {BLOOD_TYPES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="nationalId">CNIC</label>
              <input
                id="nationalId"
                inputMode="numeric"
                placeholder="35202-1234567-1"
                {...register('nationalId')}
              />
              {errors.nationalId && (
                <span className="field-error">{errors.nationalId.message}</span>
              )}
              {mode === 'edit' && (
                <span className="hint">
                  Stored hashed — leave blank to keep the CNIC on file.
                </span>
              )}
            </div>
            <div className="field">
              <label htmlFor="photoUrl">Photo URL</label>
              <input id="photoUrl" type="url" {...register('photoUrl')} />
              {errors.photoUrl && (
                <span className="field-error">{errors.photoUrl.message}</span>
              )}
            </div>
          </div>
        </div>

        <div className="section">
          <h2>Contact</h2>
          <div className="form-grid-3">
            <div className="field">
              <label htmlFor="phone">Phone</label>
              <input id="phone" placeholder="+923001234567" {...register('phone')} />
              {errors.phone && (
                <span className="field-error">{errors.phone.message}</span>
              )}
            </div>
            <div className="field">
              <label htmlFor="alternatePhone">Alternate phone</label>
              <input
                id="alternatePhone"
                placeholder="+923001234567"
                {...register('alternatePhone')}
              />
              {errors.alternatePhone && (
                <span className="field-error">{errors.alternatePhone.message}</span>
              )}
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" {...register('email')} />
              {errors.email && (
                <span className="field-error">{errors.email.message}</span>
              )}
            </div>
          </div>
        </div>

        <div className="section">
          <h2>Address</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="address.line1">Address line 1</label>
              <input id="address.line1" {...register('address.line1')} />
              {errors.address?.line1 && (
                <span className="field-error">{errors.address.line1.message}</span>
              )}
            </div>
            <div className="field">
              <label htmlFor="address.line2">Address line 2</label>
              <input id="address.line2" {...register('address.line2')} />
              {errors.address?.line2 && (
                <span className="field-error">{errors.address.line2.message}</span>
              )}
            </div>
          </div>
          <div className="form-grid-3">
            <div className="field">
              <label htmlFor="address.city">City</label>
              <input id="address.city" {...register('address.city')} />
              {errors.address?.city && (
                <span className="field-error">{errors.address.city.message}</span>
              )}
            </div>
            <div className="field">
              <label htmlFor="address.province">Province</label>
              <input id="address.province" {...register('address.province')} />
            </div>
            <div className="field">
              <label htmlFor="address.postalCode">Postal code</label>
              <input id="address.postalCode" {...register('address.postalCode')} />
            </div>
          </div>
          <p className="hint">
            Leave the whole block blank to record no address. Country defaults to PK.
          </p>
        </div>

        <div className="section">
          <h2>Clinical notes</h2>
          <div className="field">
            <label htmlFor="knownAllergies">Known allergies</label>
            <textarea
              id="knownAllergies"
              placeholder="Penicillin, sulfa drugs, latex…"
              {...register('knownAllergies')}
            />
            <span className="hint">
              Shown as a banner on every clinical screen for this patient.
            </span>
            {errors.knownAllergies && (
              <span className="field-error">{errors.knownAllergies.message}</span>
            )}
          </div>
          <div className="field">
            <label htmlFor="remarks">Remarks</label>
            <textarea id="remarks" {...register('remarks')} />
            {errors.remarks && (
              <span className="field-error">{errors.remarks.message}</span>
            )}
          </div>
        </div>

        <div className="section">
          <h2>Payer / TPA</h2>
          <ErrorNote error={tpas.error} fallback="Could not load TPA list" />
          <div className="form-grid-3">
            <div className="field">
              <label htmlFor="tpaId">TPA</label>
              <select id="tpaId" {...register('tpaId')} disabled={tpas.isPending}>
                <option value="">— Self-paying —</option>
                {tpas.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.code ? ` (${t.code})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="tpaMemberId">TPA member ID</label>
              <input id="tpaMemberId" {...register('tpaMemberId')} />
              {errors.tpaMemberId && (
                <span className="field-error">{errors.tpaMemberId.message}</span>
              )}
            </div>
            <div className="field">
              <label htmlFor="tpaValidTill">Valid till</label>
              <input id="tpaValidTill" type="date" {...register('tpaValidTill')} />
              {errors.tpaValidTill && (
                <span className="field-error">{errors.tpaValidTill.message}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <button type="submit" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
