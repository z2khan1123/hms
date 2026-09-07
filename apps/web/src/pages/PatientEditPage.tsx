import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { CreatePatientInput, Patient, UpdatePatientInput } from '@hms/shared';
import { api } from '../lib/api';
import { PatientForm } from '../components/PatientForm';
import { ErrorNote, Loading } from '../components/QueryFeedback';

/** Patient record -> form defaults. The CNIC is write-only, so it starts blank. */
function toFormValues(p: Patient): Partial<UpdatePatientInput> {
  return {
    firstName: p.firstName,
    lastName: p.lastName,
    guardianName: p.guardianName ?? undefined,
    gender: p.gender,
    birthDate: p.birthDate,
    maritalStatus: p.maritalStatus ?? undefined,
    bloodType: (p.bloodType as CreatePatientInput['bloodType']) ?? undefined,
    phone: p.phone,
    alternatePhone: p.alternatePhone ?? undefined,
    email: p.email ?? undefined,
    address: p.address ?? undefined,
    photoUrl: p.photoUrl ?? undefined,
    knownAllergies: p.knownAllergies ?? undefined,
    remarks: p.remarks ?? undefined,
  };
}

export function PatientEditPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const patient = useQuery({
    queryKey: ['patient', 'detail', id],
    queryFn: async () => {
      const { data } = await api.get<Patient>(`/patients/${id}`);
      return data;
    },
    enabled: Boolean(id),
  });

  const mutation = useMutation({
    mutationFn: async (values: UpdatePatientInput) => {
      const { data } = await api.patch<Patient>(`/patients/${id}`, values);
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['patient', 'detail', id] });
      await queryClient.invalidateQueries({ queryKey: ['patients'] });
      navigate(`/patients/${id}`);
    },
  });

  return (
    <>
      <div className="page-head">
        <h1>Edit patient</h1>
        <Link to={`/patients/${id}`}>Back to profile</Link>
      </div>

      <ErrorNote error={patient.error} fallback="Could not load this patient" />
      {patient.isPending && <Loading />}

      {patient.data && (
        <PatientForm
          mode="edit"
          defaultValues={toFormValues(patient.data)}
          submitLabel="Save changes"
          pending={mutation.isPending}
          serverError={mutation.error}
          onSubmit={(values) => mutation.mutate(values)}
        />
      )}
    </>
  );
}
