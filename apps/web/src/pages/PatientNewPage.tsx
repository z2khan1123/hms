import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  createPatientSchema,
  type CreatePatientInput,
  type Patient,
} from '@hms/shared';
import { api, apiErrorMessage } from '../lib/api';

const GENDERS: CreatePatientInput['gender'][] = [
  'male',
  'female',
  'other',
  'unknown',
];
const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

const optional = { setValueAs: (v: string) => (v === '' ? undefined : v) };

export function PatientNewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreatePatientInput>({
    resolver: zodResolver(createPatientSchema),
    defaultValues: { phone: '+92', gender: 'unknown' },
  });

  const mutation = useMutation({
    mutationFn: async (values: CreatePatientInput) => {
      const { data } = await api.post<Patient>('/patients', values);
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['patients'] });
      navigate('/patients');
    },
    onError: (err) => setServerError(apiErrorMessage(err)),
  });

  return (
    <>
      <div className="page-head">
        <h1>Register patient</h1>
        <Link to="/patients">Back to list</Link>
      </div>

      <div className="card">
        {serverError && <div className="alert">{serverError}</div>}
        <form
          onSubmit={handleSubmit((values) => {
            setServerError(null);
            mutation.mutate(values);
          })}
        >
          <div className="form-grid">
            <div className="field">
              <label>First name</label>
              <input {...register('firstName')} />
              {errors.firstName && (
                <span className="field-error">{errors.firstName.message}</span>
              )}
            </div>
            <div className="field">
              <label>Last name</label>
              <input {...register('lastName')} />
              {errors.lastName && (
                <span className="field-error">{errors.lastName.message}</span>
              )}
            </div>
            <div className="field">
              <label>Gender</label>
              <select {...register('gender')}>
                {GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Date of birth</label>
              <input type="date" {...register('birthDate')} />
              {errors.birthDate && (
                <span className="field-error">{errors.birthDate.message}</span>
              )}
            </div>
            <div className="field">
              <label>Phone</label>
              <input {...register('phone')} placeholder="+923001234567" />
              {errors.phone && (
                <span className="field-error">{errors.phone.message}</span>
              )}
            </div>
            <div className="field">
              <label>Email (optional)</label>
              <input type="email" {...register('email', optional)} />
              {errors.email && (
                <span className="field-error">{errors.email.message}</span>
              )}
            </div>
            <div className="field">
              <label>CNIC (optional)</label>
              <input
                {...register('nationalId', optional)}
                placeholder="35202-1234567-1"
              />
              {errors.nationalId && (
                <span className="field-error">{errors.nationalId.message}</span>
              )}
            </div>
            <div className="field">
              <label>Blood type (optional)</label>
              <select {...register('bloodType', optional)}>
                <option value="">—</option>
                {BLOOD_TYPES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Register patient'}
          </button>
        </form>
      </div>
    </>
  );
}
