import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import type { DiagnosticReport, DiagnosticValue } from '@hms/shared';
import { api } from '../lib/api';
import { formatDateTime, fullName } from '../lib/format';
import { ErrorNote, Loading } from '../components/QueryFeedback';

const HOSPITAL_NAME =
  import.meta.env.VITE_HOSPITAL_NAME ?? 'Hospital Management System';

/** A print-safe abnormal marker: letter code plus an asterisk, never colour alone. */
function abnormalMark(flag: DiagnosticValue['flag']): string {
  if (flag === 'high') return '(H) *';
  if (flag === 'low') return '(L) *';
  return '';
}

function refLabel(v: DiagnosticValue): string {
  if (v.refText != null) return v.refText;
  if (v.refLow == null && v.refHigh == null) return '—';
  const lo = v.refLow != null ? String(v.refLow) : '—';
  const hi = v.refHigh != null ? String(v.refHigh) : '—';
  return `${lo} – ${hi}`;
}

function valueText(v: DiagnosticValue): string {
  if (v.valueNumber != null) return String(v.valueNumber);
  return v.valueText ?? '—';
}

export function ReportViewPage() {
  const { id = '' } = useParams();

  const report = useQuery({
    queryKey: ['report', 'detail', id],
    queryFn: async () => {
      const { data } = await api.get<DiagnosticReport>(`/reports/${id}`);
      return data;
    },
    enabled: Boolean(id),
  });

  if (report.isPending) return <Loading label="Loading report…" />;
  if (report.isError)
    return <ErrorNote error={report.error} fallback="Could not load this report" />;
  if (!report.data) return null;

  const r = report.data;
  const values = [...r.values].sort((a, b) => a.sortOrder - b.sortOrder);
  const anyAbnormal = values.some((v) => v.flag === 'low' || v.flag === 'high');

  return (
    <>
      <div className="page-head no-print">
        <h1>Diagnostic report</h1>
        <div className="row">
          <Link to="/reports">Back to reports</Link>
          <button type="button" className="secondary" onClick={() => window.print()}>
            Print
          </button>
        </div>
      </div>

      <div className="card report-doc">
        <div className="section">
          <div className="report-hospital">{HOSPITAL_NAME}</div>
          <div className="muted">Diagnostic report</div>
          {!r.isFinal && (
            <p style={{ border: '2px solid #000', padding: '4px 8px', display: 'inline-block' }}>
              DRAFT — not yet finalised
            </p>
          )}
        </div>

        <div className="section">
          <dl className="kv">
            <dt>Patient</dt>
            <dd>{fullName(r.patient)}</dd>
            <dt>MRN</dt>
            <dd>{r.patient.mrn}</dd>
            <dt>Case</dt>
            <dd>{r.caseNo}</dd>
            <dt>Test</dt>
            <dd>{r.serviceName}</dd>
            <dt>Sample type</dt>
            <dd>{r.sampleType ?? '—'}</dd>
            {r.method && (
              <>
                <dt>Method</dt>
                <dd>{r.method}</dd>
              </>
            )}
            <dt>Sample collected</dt>
            <dd>{r.sampleCollectedAt ? formatDateTime(r.sampleCollectedAt) : '—'}</dd>
            <dt>Reported</dt>
            <dd>{r.reportedAt ? formatDateTime(r.reportedAt) : 'Not finalised'}</dd>
            <dt>Reported by</dt>
            <dd>{r.reportedBy ?? '—'}</dd>
          </dl>
        </div>

        {values.length > 0 && (
          <div className="section">
            <h2>Results</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Parameter</th>
                    <th className="num">Result</th>
                    <th>Unit</th>
                    <th>Reference</th>
                    <th>Flag</th>
                  </tr>
                </thead>
                <tbody>
                  {values.map((v) => {
                    const abnormal = v.flag === 'low' || v.flag === 'high';
                    return (
                      <tr key={v.id} className={abnormal ? 'diag-abnormal' : undefined}>
                        <td>{v.name}</td>
                        <td className="num">
                          {valueText(v)}
                          {abnormal ? ` ${abnormalMark(v.flag)}` : ''}
                        </td>
                        <td>{v.unit ?? '—'}</td>
                        <td>{refLabel(v)}</td>
                        <td>
                          {v.flag ? (
                            <span className={`diag-flag diag-flag-${v.flag}`}>
                              {v.flag === 'low'
                                ? 'Low'
                                : v.flag === 'high'
                                  ? 'High'
                                  : 'Normal'}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {anyAbnormal && (
              <p className="report-abn-key">
                * Result outside the reference range. (H) above range, (L) below
                range.
              </p>
            )}
          </div>
        )}

        {r.findings && (
          <div className="section">
            <h2>Findings</h2>
            <p style={{ whiteSpace: 'pre-wrap' }}>{r.findings}</p>
          </div>
        )}
        {r.impression && (
          <div className="section">
            <h2>Impression</h2>
            <p style={{ whiteSpace: 'pre-wrap' }}>{r.impression}</p>
          </div>
        )}
        {r.comments && (
          <div className="section">
            <h2>Comments</h2>
            <p style={{ whiteSpace: 'pre-wrap' }}>{r.comments}</p>
          </div>
        )}
      </div>
    </>
  );
}
