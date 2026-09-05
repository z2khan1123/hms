import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { Paginated, Patient } from '@hms/shared';
import { api, apiErrorMessage } from '../lib/api';

function ageFrom(birthDate: string): number {
  const d = new Date(birthDate);
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
}

export function PatientsPage() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['patients', q, page],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Patient>>('/patients', {
        params: { q: q || undefined, page, pageSize: 20 },
      });
      return data;
    },
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <div className="page-head">
        <h1>Patients</h1>
        <Link to="/patients/new">
          <button>Register patient</button>
        </Link>
      </div>

      <div className="toolbar">
        <input
          placeholder="Search by name, MRN or phone"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {query.isError && (
        <div className="alert">{apiErrorMessage(query.error)}</div>
      )}

      <table>
        <thead>
          <tr>
            <th>MRN</th>
            <th>Name</th>
            <th>Gender</th>
            <th>Age</th>
            <th>Phone</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {query.data?.data.map((p) => (
            <tr key={p.id}>
              <td>{p.mrn}</td>
              <td>
                {p.lastName}, {p.firstName}
              </td>
              <td>{p.gender}</td>
              <td>{ageFrom(p.birthDate)}</td>
              <td>{p.phone}</td>
              <td>
                <span className="badge">{p.status}</span>
              </td>
            </tr>
          ))}
          {query.data && query.data.data.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No patients found.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {query.data && query.data.totalPages > 1 && (
        <div className="toolbar" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
          <button
            className="secondary"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span className="muted" style={{ alignSelf: 'center' }}>
            Page {query.data.page} of {query.data.totalPages}
          </span>
          <button
            className="secondary"
            disabled={page >= query.data.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </>
  );
}
