import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ALLERGY_SEVERITY_LABELS,
  createDispenseSchema,
  formatMoney,
  matchAllergy,
  toMajor,
  toMinor,
  type AllergyWarning,
  type Dispense,
  type Medicine,
  type MedicineBatch,
  type Patient,
  type PatientAllergy,
} from '@hms/shared';
import { api } from '../lib/api';
import { useCan } from '../lib/permissions';
import { num } from '../lib/bill-line';
import { formatDateTime } from '../lib/format';
import { ErrorNote, Loading } from '../components/QueryFeedback';
import { PatientHeader } from '../components/PatientHeader';
import { PatientPicker } from '../components/PatientPicker';
import { MedicinePicker } from '../components/MedicinePicker';
import { AllergyList } from '../components/AllergyList';

interface BasketLine {
  key: string;
  medicine: Pick<Medicine, 'id' | 'name' | 'genericName' | 'allergenKeywords'>;
  batchId: string;
  quantity: string;
  unitPriceMajor: string;
}

function lineUnitMinor(l: BasketLine): number {
  return Math.max(0, toMinor(num(l.unitPriceMajor)));
}
function lineQty(l: BasketLine): number {
  return Math.max(0, Math.trunc(num(l.quantity)));
}

export function DispensePage() {
  const can = useCan();
  const canDispense = can('dispense:create');
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const prePatientId = params.get('patientId') ?? '';
  const opdVisitId = params.get('opdVisitId') ?? '';

  const [patient, setPatient] = useState<Patient | null>(null);
  const [basket, setBasket] = useState<BasketLine[]>([]);
  const [pendingWarnings, setPendingWarnings] = useState<AllergyWarning[] | null>(
    null,
  );

  const preselected = useQuery({
    queryKey: ['patient', 'detail', prePatientId],
    queryFn: async () => {
      const { data } = await api.get<Patient>(`/patients/${prePatientId}`);
      return data;
    },
    enabled: Boolean(prePatientId),
  });

  useEffect(() => {
    if (preselected.data) setPatient(preselected.data);
  }, [preselected.data]);

  const patientId = patient?.id ?? '';

  const allergies = useQuery({
    // PatientAllergy[] — the structured list the safety check reads.
    queryKey: ['patient', 'allergies', patientId],
    queryFn: async () => {
      const { data } = await api.get<PatientAllergy[]>(
        `/patients/${patientId}/allergies`,
      );
      return data;
    },
    enabled: Boolean(patientId),
  });

  const dispenses = useQuery({
    // Dispense[] for this patient — its own shape.
    queryKey: ['pharmacy', 'dispenses', patientId, ''],
    queryFn: async () => {
      const { data } = await api.get<Dispense[]>('/pharmacy/dispenses', {
        params: { patientId },
      });
      return data;
    },
    enabled: Boolean(patientId),
  });

  const setLine = (key: string, patch: Partial<BasketLine>) =>
    setBasket((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const addMedicine = (m: Medicine) =>
    setBasket((prev) => [
      ...prev,
      {
        key: `${m.id}-${Date.now()}`,
        medicine: {
          id: m.id,
          name: m.name,
          genericName: m.genericName,
          allergenKeywords: m.allergenKeywords,
        },
        batchId: '',
        quantity: '1',
        unitPriceMajor: '',
      },
    ]);

  const totalMinor = useMemo(
    () => basket.reduce((sum, l) => sum + lineQty(l) * lineUnitMinor(l), 0),
    [basket],
  );

  const readyLines = basket.filter((l) => l.batchId && lineQty(l) >= 1);
  const canSubmit = canDispense && readyLines.length > 0 && !preselected.isFetching;

  const dispense = useMutation({
    mutationFn: async () => {
      const parsed = createDispenseSchema.safeParse({
        patientId,
        opdVisitId: opdVisitId || undefined,
        items: readyLines.map((l) => ({
          batchId: l.batchId,
          quantity: lineQty(l),
          unitPriceMinor: l.unitPriceMajor.trim()
            ? lineUnitMinor(l)
            : undefined,
        })),
      });
      if (!parsed.success) {
        throw new Error(
          parsed.error.issues[0]?.message ?? 'Check the basket lines.',
        );
      }
      const { data } = await api.post<Dispense>(
        '/pharmacy/dispenses',
        parsed.data,
      );
      return data;
    },
    onSuccess: async () => {
      setBasket([]);
      setPendingWarnings(null);
      await queryClient.invalidateQueries({
        queryKey: ['pharmacy', 'dispenses'],
      });
      await queryClient.invalidateQueries({ queryKey: ['pharmacy', 'batches'] });
      await queryClient.invalidateQueries({ queryKey: ['pharmacy', 'medicines'] });
    },
  });

  const allergyCheck = useMutation({
    mutationFn: async () => {
      const medicineIds = [...new Set(readyLines.map((l) => l.medicine.id))];
      const { data } = await api.post<AllergyWarning[]>(
        '/pharmacy/allergy-check',
        { patientId, medicineIds },
      );
      return data;
    },
    onSuccess: (warnings) => {
      if (warnings.length > 0) {
        setPendingWarnings(warnings);
      } else {
        dispense.mutate();
      }
    },
  });

  function onDispenseClick() {
    setPendingWarnings(null);
    allergyCheck.mutate();
  }

  return (
    <>
      <div className="page-head">
        <h1>Dispense</h1>
        <Link to="/pharmacy/stock">Stock &amp; batches</Link>
      </div>

      {!canDispense && (
        <div className="alert" role="alert">
          You do not have permission to dispense. Ask a pharmacist to complete
          this at the counter.
        </div>
      )}

      {!patient && (
        <div className="card">
          <div className="section">
            <h2>Patient</h2>
            <PatientPicker onSelect={setPatient} autoFocus />
            <ErrorNote
              error={preselected.error}
              fallback="Could not load the pre-selected patient"
            />
          </div>
        </div>
      )}

      {patient && (
        <>
          <PatientHeader
            patient={patient}
            actions={
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setPatient(null);
                  setBasket([]);
                  setPendingWarnings(null);
                }}
              >
                Change patient
              </button>
            }
          />

          <div className="card">
            <div className="section">
              <h2>Recorded allergies</h2>
              <ErrorNote
                error={allergies.error}
                fallback="Could not load the patient's allergies"
              />
              {allergies.isPending && <Loading label="Loading allergies…" />}
              {allergies.data && allergies.data.length === 0 && (
                <p className="muted">
                  No allergies recorded for this patient.
                </p>
              )}
              {allergies.data && allergies.data.length > 0 && (
                <AllergyList allergies={allergies.data} />
              )}
            </div>
          </div>

          <div className="card">
            <div className="section">
              <h2>Basket</h2>
              {canDispense && (
                <MedicinePicker
                  label="Add a medicine"
                  onSelect={addMedicine}
                />
              )}

              {basket.length > 0 && (
                <div className="table-wrap" style={{ marginTop: 12 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Medicine</th>
                        <th>Batch</th>
                        <th className="num">Qty</th>
                        <th className="num">Unit price</th>
                        <th className="num">Line total</th>
                        <th className="no-print" />
                      </tr>
                    </thead>
                    <tbody>
                      {basket.map((l) => (
                        <BasketLineRow
                          key={l.key}
                          line={l}
                          allergies={allergies.data ?? []}
                          onChange={(patch) => setLine(l.key, patch)}
                          onRemove={() =>
                            setBasket((prev) =>
                              prev.filter((x) => x.key !== l.key),
                            )
                          }
                        />
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={4} className="num">
                          <strong>Total</strong>
                        </td>
                        <td className="num">
                          <strong>{formatMoney(totalMinor)}</strong>
                        </td>
                        <td className="no-print" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {canDispense && (
                <>
                  <div className="row no-print" style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      disabled={!canSubmit || allergyCheck.isPending || dispense.isPending}
                      onClick={onDispenseClick}
                    >
                      {allergyCheck.isPending
                        ? 'Checking allergies…'
                        : dispense.isPending
                          ? 'Dispensing…'
                          : 'Check allergies & dispense'}
                    </button>
                    {dispense.isSuccess && (
                      <span className="muted">Dispensed.</span>
                    )}
                  </div>
                  <span className="hint">
                    The patient's recorded allergies are checked against every
                    medicine in the basket before anything leaves the counter.
                  </span>
                  <ErrorNote
                    error={allergyCheck.error}
                    fallback="Could not run the allergy check — nothing was dispensed"
                  />
                  <ErrorNote
                    error={dispense.error}
                    fallback="Could not dispense — the batch may have expired or run out of stock"
                  />
                </>
              )}
            </div>
          </div>

          <div className="card">
            <div className="section">
              <h2>Recent dispenses</h2>
              <ErrorNote
                error={dispenses.error}
                fallback="Could not load recent dispenses"
              />
              {dispenses.isPending && <Loading label="Loading dispenses…" />}
              {dispenses.data && dispenses.data.length === 0 && (
                <p className="muted">Nothing dispensed to this patient yet.</p>
              )}
              {dispenses.data && dispenses.data.length > 0 && (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Items</th>
                        <th className="num">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dispenses.data.map((d) => (
                        <tr key={d.id}>
                          <td>{formatDateTime(d.dispensedAt)}</td>
                          <td>
                            {d.items
                              .map(
                                (it) =>
                                  `${it.medicineName} ×${it.quantity} (${it.batchNo})`,
                              )
                              .join(', ')}
                          </td>
                          <td className="num">{formatMoney(d.totalMinor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {pendingWarnings && (
        <AllergyConfirmModal
          warnings={pendingWarnings}
          busy={dispense.isPending}
          onCancel={() => setPendingWarnings(null)}
          onConfirm={() => dispense.mutate()}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

function BasketLineRow({
  line,
  allergies,
  onChange,
  onRemove,
}: {
  line: BasketLine;
  allergies: readonly PatientAllergy[];
  onChange: (patch: Partial<BasketLine>) => void;
  onRemove: () => void;
}) {
  const batches = useQuery({
    // MedicineBatch[] for one medicine — distinct from the stock list key.
    queryKey: ['pharmacy', 'batches', 'forMedicine', line.medicine.id],
    queryFn: async () => {
      const { data } = await api.get<MedicineBatch[]>('/pharmacy/batches', {
        params: { medicineId: line.medicine.id },
      });
      return data;
    },
  });

  // Only non-expired batches that still hold stock can be dispensed.
  const usable = (batches.data ?? []).filter(
    (b) => !b.isExpired && b.quantity > 0,
  );

  const matched = allergies
    .map((a) => ({ a, hit: matchAllergy(line.medicine, a.substance) }))
    .filter((x) => x.hit);

  function pickBatch(batchId: string) {
    const batch = usable.find((b) => b.id === batchId);
    onChange({
      batchId,
      unitPriceMajor:
        batch && batch.salePriceMinor != null
          ? String(toMajor(batch.salePriceMinor))
          : line.unitPriceMajor,
    });
  }

  const lineTotal = lineQty(line) * lineUnitMinor(line);

  return (
    <tr>
      <td>
        {line.medicine.name}
        {matched.length > 0 && (
          <div className="rx-allergy-warn" role="alert">
            <strong>Allergy warning</strong> — patient reacts to{' '}
            {matched.map((m) => m.a.substance).join(', ')}
          </div>
        )}
      </td>
      <td>
        <select
          aria-label={`Batch for ${line.medicine.name}`}
          value={line.batchId}
          onChange={(e) => pickBatch(e.target.value)}
        >
          <option value="">Select a batch…</option>
          {usable.map((b) => (
            <option key={b.id} value={b.id}>
              {b.batchNo} · exp {b.expiryDate} · {b.quantity} in stock
              {b.salePriceMinor != null
                ? ` · ${formatMoney(b.salePriceMinor)}`
                : ''}
            </option>
          ))}
        </select>
        {batches.isFetchedAfterMount && usable.length === 0 && (
          <span className="hint">No non-expired batch with stock.</span>
        )}
        <ErrorNote error={batches.error} fallback="Could not load batches" />
      </td>
      <td className="num">
        <input
          type="number"
          min="1"
          step="1"
          aria-label={`Quantity for ${line.medicine.name}`}
          value={line.quantity}
          onChange={(e) => onChange({ quantity: e.target.value })}
        />
      </td>
      <td className="num">
        <input
          type="number"
          min="0"
          step="0.01"
          aria-label={`Unit price for ${line.medicine.name}`}
          value={line.unitPriceMajor}
          onChange={(e) => onChange({ unitPriceMajor: e.target.value })}
        />
      </td>
      <td className="num">{formatMoney(lineTotal)}</td>
      <td className="no-print">
        <button type="button" className="secondary" onClick={onRemove}>
          Remove
        </button>
      </td>
    </tr>
  );
}

function AllergyConfirmModal({
  warnings,
  busy,
  onCancel,
  onConfirm,
}: {
  warnings: readonly AllergyWarning[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="allergy-confirm-title"
      >
        <h2 id="allergy-confirm-title">Allergy warning</h2>
        <div className="modal-allergy" role="alert">
          <span className="modal-allergy-tag">Do not proceed lightly</span>
          <span>
            This basket collides with the patient's recorded allergies.
          </span>
        </div>
        <ul className="allergy-list">
          {warnings.map((w, i) => (
            <li key={`${w.medicineId}-${w.substance}-${i}`}>
              <span className="allergy-substance">{w.medicineName}</span>
              <span>
                matches allergy to <strong>{w.substance}</strong> (
                {ALLERGY_SEVERITY_LABELS[w.severity]})
                {w.reaction ? ` — ${w.reaction}` : ''}
              </span>
            </li>
          ))}
        </ul>
        <div className="row" style={{ marginTop: 16 }}>
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel — do not dispense
          </button>
          <button
            type="button"
            className="danger"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? 'Dispensing…' : 'I have checked with the prescriber — dispense anyway'}
          </button>
        </div>
      </div>
    </div>
  );
}
