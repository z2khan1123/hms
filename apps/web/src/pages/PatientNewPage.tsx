import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { CreatePatientInput, Patient } from '@hms/shared';
import { api } from '../lib/api';
import { PatientForm } from '../components/PatientForm';

export function PatientNewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  /** Set when the receptionist came here mid-registration from /opd/new. */
  const returnTo = params.get('returnTo');

  const mutation = useMutation({
    mutationFn: async (values: CreatePatientInput) => {
      const { data } = await api.post<Patient>('/patients', values);
      return data;
    },
    onSuccess: async (patient) => {
      await queryClient.invalidateQueries({ queryKey: ['patients'] });
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
