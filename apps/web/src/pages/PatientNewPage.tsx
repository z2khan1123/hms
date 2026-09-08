import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { CreatePatientInput, Patient } from '@hms/shared';
import { IDEMPOTENCY_HEADER } from '@hms/shared';
import { api } from '../lib/api';
import { enqueue } from '../lib/outbox';
import { PatientForm } from '../components/PatientForm';

export function PatientNewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  /** Set when the receptionist came here mid-registration from /opd/new. */
  const returnTo = params.get('returnTo');

  const mutation = useMutation({
    mutationFn: async (values: CreatePatientInput) => {
      // Offline, the registration is queued and sent later. The desk carries on
      // rather than turning the patient away — which is what happens today, on
      // paper, and then gets typed in twice.
      if (!navigator.onLine) {
        await enqueue({
          operation: 'patient.create',
          path: '/patients',
          body: values as unknown as Record<string, unknown>,
          summary: `${values.firstName} ${values.lastName}`,
        });
        return null;
      }

      // Online, it goes straight out — but still with an idempotency key, so a
      // request that times out can be retried without creating a second
      // patient.
      const { data } = await api.post<Patient>('/patients', values, {
        headers: { [IDEMPOTENCY_HEADER]: crypto.randomUUID() },
      });
      return data;
    },
    onSuccess: async (patient) => {
      await queryClient.invalidateQueries({ queryKey: ['patients'] });
      if (!patient) {
        // Queued: there is no id yet, so there is nowhere to navigate to.
        navigate('/patients');
        return;
      }
      navigate(
        returnTo
          ? `${returnTo}${returnTo.includes('?') ? '&' : '?'}patientId=${patient.id}`
          : `/patients/${patient.id}`,
      );
    },
  });

  return (
    <>
      <div className="page-head">
        <h1>Register patient</h1>
        <Link to="/patients">Back to list</Link>
      </div>

      {returnTo && (
        <div className="alert-info">
          After saving you will be returned to the visit registration with this
          patient selected.
        </div>
      )}

      <PatientForm
        mode="create"
        submitLabel="Register patient"
        pending={mutation.isPending}
        serverError={mutation.error}
        onSubmit={(values) => mutation.mutate(values)}
      />
    </>
  );
}
