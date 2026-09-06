import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { formatAge, type Paginated, type Patient } from '@hms/shared';
import { api } from '../lib/api';
import { useCan } from '../lib/permissions';
import { useDebounced } from '../lib/useDebounced';
import { ErrorNote, Loading } from '../components/QueryFeedback';
import { StatusBadge } from '../components/StatusBadge';

export function PatientsPage() {
  const can = useCan();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const debouncedQ = useDebounced(q);

  const query = useQuery({
    // Paginated shape — must not share a key with the flat lookup/picker queries.
    queryKey: ['patients', 'page', debouncedQ, page],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Patient>>('/patients', {
        params: { q: debouncedQ || undefined, page, pageSize: 20 },
      });
      return data;
    },
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <div className="page-head">
        <h1>Patients</h1>
        {can('patient:create') && (
          <Link to="/patients/new">
            <button type="button">Register patient</button>
          </Link>
        )}
      </div>

      <div className="toolbar">
        <input
          autoFocus
          placeholder="Search by name, MRN, phone or CNIC last 4"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
      </div>

      <ErrorNote error={query.error} fallback="Could not load patients" />
      {query.isPending && <Loading />}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>MRN</th>
              <th>Name</th>
              <th>Gender</th>
              <th>Age</th>
              <th>Phone</th>
              <th>Allergies</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {query.data?.data.map((p) => (
              <tr key={p.id}>
                <td>{p.mrn}</td>
                <td>
                  <Link to={`/patients/${p.id}`}>
                    {p.lastName}, {p.firstName}
                  </Link>
                </td>
                <td>{p.gender}</td>
                <td>{formatAge(p.birthDate)}</td>
                <td>{p.phone}</td>
                <td>
                  {p.knownAllergies ? (
                    <span className="badge badge-cancelled">Allergies</span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  <StatusBadge status={p.status} />
                </td>
                <td>
                  {can('opd:create') && (
                    <Link to={`/opd/new?patientId=${p.id}`}>Register visit</Link>
                  )}
                </td>
              </tr>
            ))}
            {query.data && query.data.data.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">
                  No patients found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {query.data && query.data.totalPages > 1 && (
        <div className="row-end" style={{ marginTop: 14 }}>
          <button
            type="button"
            className="secondary"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span className="muted">
            Page {query.data.page} of {query.data.totalPages} · {query.data.total} total
          </span>
          <button
            type="button"
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
