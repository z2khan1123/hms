import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import {
  flagValue,
  saveDiagnosticReportSchema,
  type DiagnosticReport,
  type LabTest,
} from '@hms/shared';
import { api } from '../lib/api';
import { useCan } from '../lib/permissions';
import { blankToUndefined, formatDateTime } from '../lib/format';
import { ErrorNote, Loading } from '../components/QueryFeedback';
import { PatientHeader } from '../components/PatientHeader';

/** A single value row in the save payload (matches `diagnosticValueInputSchema`). */
interface ValueInput {
  parameterId?: string;
  name?: string;
  unit?: string;
  valueNumber?: number;
  valueText?: string;
}

/** One editable line on the value table. */
interface Line {
  key: string;
  parameterId?: string;
  name: string;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  refText: string | null;
}

function FlagTag({ flag }: { flag: 'low' | 'normal' | 'high' | null }) {
  if (!flag) return null;
  const label = flag === 'low' ? 'Low' : flag === 'high' ? 'High' : 'Normal';
  return <span className={`diag-flag diag-flag-${flag}`}>{label}</span>;
}

function refLabel(line: Pick<Line, 'refLow' | 'refHigh' | 'refText' | 'unit'>): string {
  if (line.refText != null) return line.refText;
  if (line.refLow == null && line.refHigh == null) return 'No reference range';
  const lo = line.refLow != null ? String(line.refLow) : '—';
  const hi = line.refHigh != null ? String(line.refHigh) : '—';
  return `${lo} – ${hi}${line.unit ? ` ${line.unit}` : ''}`;
}

export function ReportEntryPage() {
  const { orderId = '' } = useParams();
  const can = useCan();
  const canWrite = can('report:write');
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const report = useQuery({
    // DiagnosticReport keyed by the order it belongs to; 404 => empty draft.
    queryKey: ['report', 'by-order', orderId],
    queryFn: async () => {
      try {
        const { data } = await api.get<DiagnosticReport>(
          `/reports/by-order/${orderId}`,
        );
        return data;
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 404) return null;
        throw err;
      }
    },
    enabled: Boolean(orderId),
    retry: false,
  });

  const r = report.data ?? null;
  // A draft that has never been saved carries no value rows — fetch the linked
  // test to learn its parameters (and whether it is a narrative/imaging test).
  const mustLoadTest =
    !!r && !r.isFinal && r.values.length === 0 && Boolean(r.labTestId);

  const labTest = useQuery({
    queryKey: ['lab-test', r?.labTestId],
    queryFn: async () => {
      const { data } = await api.get<LabTest>(`/lab-tests/${r!.labTestId}`);
      return data;
    },
    enabled: mustLoadTest,
  });

  const testLoading = mustLoadTest && labTest.isPending;

  // The value lines come from the saved report when it has any, otherwise from
  // the linked test's parameter list (a draft that has never been saved).
  const lines = useMemo<Line[]>(() => {
    if (!r) return [];
    if (r.values.length > 0) {
      return [...r.values]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((v) => ({
          key: v.id,
          parameterId: v.parameterId ?? undefined,
          name: v.name,
          unit: v.unit,
          refLow: v.refLow,
          refHigh: v.refHigh,
          refText: v.refText,
        }));
    }
    const params = labTest.data?.parameters ?? [];
    return [...params]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((p) => ({
        key: p.id,
        parameterId: p.id,
        name: p.name,
        unit: p.unit,
        refLow: p.refLow,
        refHigh: p.refHigh,
        refText: p.refText,
      }));
  }, [r, labTest.data]);

  const isNarrative = !!r && !testLoading && lines.length === 0;

  // --- editor state -----------------------------------------------------
  const [values, setValues] = useState<Record<string, string>>({});
  const [findings, setFindings] = useState('');
  const [impression, setImpression] = useState('');
  const [comments, setComments] = useState('');

  useEffect(() => {
    if (!r) return;
    setFindings(r.findings ?? '');
    setImpression(r.impression ?? '');
    setComments(r.comments ?? '');
    const seed: Record<string, string> = {};
    for (const v of r.values) {
      seed[v.id] =
        v.valueNumber != null ? String(v.valueNumber) : v.valueText ?? '';
    }
    setValues(seed);
  }, [r]);

  const save = useMutation({
    mutationFn: async (finalise: boolean) => {
      const built: ValueInput[] = [];
      for (const line of lines) {
        const raw = (values[line.key] ?? '').trim();
        if (!raw) continue;
        const base: ValueInput = line.parameterId
          ? { parameterId: line.parameterId }
          : { name: line.name, unit: line.unit ?? undefined };
        if (line.refText != null) {
          built.push({ ...base, valueText: raw });
        } else {
          const n = Number(raw);
          if (Number.isFinite(n)) built.push({ ...base, valueNumber: n });
          else built.push({ ...base, valueText: raw });
        }
      }

      const payload = isNarrative
        ? {
            findings: blankToUndefined(findings),
            impression: blankToUndefined(impression),
            comments: blankToUndefined(comments),
            finalise,
          }
        : {
            values: built,
            comments: blankToUndefined(comments),
            finalise,
          };

      const parsed = saveDiagnosticReportSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(
          parsed.error.issues[0]?.message ?? 'Check the values you entered.',
        );
      }
      const { data } = await api.put<DiagnosticReport>(
        `/reports/by-order/${orderId}`,
        parsed.data,
      );
      return { data, finalise };
    },
    onSuccess: async ({ data, finalise }) => {
      await queryClient.invalidateQueries({ queryKey: ['report', 'by-order', orderId] });
      await queryClient.invalidateQueries({ queryKey: ['reports'] });
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      await queryClient.invalidateQueries({ queryKey: ['opd'] });
      if (finalise) navigate(`/reports/${data.id}`);
    },
  });

  if (report.isPending) return <Loading label="Loading report…" />;
  if (report.isError)
    return <ErrorNote error={report.error} fallback="Could not load this report" />;

  if (r === null) {
    return (
      <>
        <div className="page-head">
          <h1>Enter result</h1>
          <Link to="/worklist">Back to worklist</Link>
        </div>
        <div className="alert-info">
          No result has been started for this order yet. Open it from the
          department worklist once the order is released and the sample is
          collected.
        </div>
      </>
    );
  }

  const readOnly = r.isFinal || !canWrite;

  return (
    <>
      <div className="page-head">
        <h1>Enter result</h1>
        <Link to="/worklist">Back to worklist</Link>
      </div>

      <PatientHeader patient={r.patient} />

      <div className="card">
        <div className="section">
          <h2>{r.serviceName}</h2>
          <dl className="kv">
            <dt>Case</dt>
            <dd>{r.caseNo}</dd>
            <dt>Sample type</dt>
            <dd>{r.sampleType ?? '—'}</dd>
            <dt>Method</dt>
            <dd>{r.method ?? '—'}</dd>
            {r.sampleCollectedAt && (
              <>
                <dt>Sample collected</dt>
                <dd>{formatDateTime(r.sampleCollectedAt)}</dd>
              </>
            )}
            {r.isFinal && (
              <>
                <dt>Reported at</dt>
                <dd>{r.reportedAt ? formatDateTime(r.reportedAt) : '—'}</dd>
                <dt>Reported by</dt>
                <dd>{r.reportedBy ?? '—'}</dd>
              </>
            )}
          </dl>
        </div>

        {r.isFinal && (
          <div className="section">
            <div className="alert-info">
              This report is final. A finalised report cannot be edited — a
              correction is issued as a new report.
            </div>
            <Link to={`/reports/${r.id}`}>Open the printable report</Link>
          </div>
        )}

        {!r.isFinal && !canWrite && (
          <div className="section">
            <div className="alert-info">
              You do not have permission to enter results. This is a read-only
              view of the current draft.
            </div>
          </div>
        )}

        {testLoading && (
          <div className="section">
            <Loading label="Loading test parameters…" />
          </div>
        )}
        <ErrorNote error={labTest.error} fallback="Could not load the test definition" />

        {!isNarrative && lines.length > 0 && (
          <div className="section">
            <h2>Values</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Parameter</th>
                    <th>Value</th>
                    <th>Reference</th>
                    <th>Flag</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const raw = values[line.key] ?? '';
                    const numeric = line.refText == null;
                    const n = Number(raw);
                    const flag =
                      numeric && raw.trim() && Number.isFinite(n)
                        ? flagValue(n, line.refLow, line.refHigh)
                        : null;
                    const abnormal = flag === 'low' || flag === 'high';
                    return (
                      <tr key={line.key} className={abnormal ? 'diag-abnormal' : undefined}>
                        <td>
                          {line.name}
                          {line.unit ? <span className="muted"> ({line.unit})</span> : null}
                        </td>
                        <td>
                          {readOnly ? (
                            raw || <span className="muted">—</span>
                          ) : (
                            <input
                              aria-label={`${line.name} value`}
                              type={numeric ? 'number' : 'text'}
                              step={numeric ? 'any' : undefined}
                              value={raw}
                              onChange={(e) =>
                                setValues((prev) => ({
                                  ...prev,
                                  [line.key]: e.target.value,
                                }))
                              }
                            />
                          )}
                        </td>
                        <td className="diag-ref">{refLabel(line)}</td>
                        <td>
                          {flag ? <FlagTag flag={flag} /> : <span className="muted">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="diag-note">
              A low or high result is marked with a word and an arrow, so it stays
              obvious without relying on colour.
            </p>
          </div>
        )}

        {isNarrative && (
          <div className="section">
            <h2>Findings</h2>
            <div className="field">
              <label htmlFor="rep-findings">Findings</label>
              <textarea
                id="rep-findings"
                value={findings}
                disabled={readOnly}
                onChange={(e) => setFindings(e.target.value)}
                style={{ minHeight: 140 }}
              />
            </div>
            <div className="field">
              <label htmlFor="rep-impression">Impression</label>
              <textarea
                id="rep-impression"
                value={impression}
                disabled={readOnly}
                onChange={(e) => setImpression(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="section">
          <div className="field">
            <label htmlFor="rep-comments">Comments</label>
            <textarea
              id="rep-comments"
              value={comments}
              disabled={readOnly}
              onChange={(e) => setComments(e.target.value)}
            />
          </div>

          {!readOnly && (
            <>
              <ErrorNote error={save.error} fallback="Could not save the report" />
              <div className="row no-print" style={{ marginTop: 4 }}>
                <button
                  type="button"
                  className="secondary"
                  disabled={save.isPending}
                  onClick={() => save.mutate(false)}
                >
                  {save.isPending ? 'Saving…' : 'Save draft'}
                </button>
                <button
                  type="button"
                  disabled={save.isPending}
                  onClick={() => save.mutate(true)}
                >
                  Finalise report
                </button>
              </div>
              <p className="hint">
                Finalising hands the result to the ordering doctor and completes
                the order. A draft can be revisited; a finalised report cannot.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
