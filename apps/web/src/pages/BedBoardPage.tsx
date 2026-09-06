import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  BED_BLOCK_REASON_LABELS,
  bedBlockReasonSchema,
  blockBedSchema,
  type BedBoard,
  type BedBlockReason,
} from '@hms/shared';
import { api } from '../lib/api';
import { useCan } from '../lib/permissions';
import { blankToUndefined, timeAgo } from '../lib/format';
import { ErrorNote, Loading } from '../components/QueryFeedback';

const BLOCK_REASONS = bedBlockReasonSchema.options;

type BedTile = BedBoard['floors'][number]['wards'][number]['beds'][number];

export function BedBoardPage() {
  const can = useCan();
  const canManage = can('ward:manage');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const board = useQuery({
    // The whole nursing-station board in one response — its own shape, its own key.
    queryKey: ['wards', 'board'],
    queryFn: async () => {
      const { data } = await api.get<BedBoard>('/wards/board');
      return data;
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['wards'] });

  const unblock = useMutation({
    mutationFn: async (bedId: string) => {
      await api.post(`/wards/beds/${bedId}/unblock`);
    },
    onSuccess: invalidate,
  });

  const [blockingId, setBlockingId] = useState<string | null>(null);
  const [reason, setReason] = useState<BedBlockReason>('cleaning');
  const [note, setNote] = useState('');
  const [blockIssue, setBlockIssue] = useState<string | null>(null);

  const block = useMutation({
    mutationFn: async (bedId: string) => {
      const parsed = blockBedSchema.safeParse({
        reason,
        note: blankToUndefined(note),
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Pick a reason');
      }
      await api.post(`/wards/beds/${bedId}/block`, parsed.data);
    },
    onSuccess: async () => {
      setBlockingId(null);
      setNote('');
      setReason('cleaning');
      setBlockIssue(null);
      await invalidate();
    },
    onError: (err) =>
      setBlockIssue(err instanceof Error ? err.message : 'Could not block the bed'),
  });

  if (board.isPending) return <Loading label="Loading the bed board…" />;
  if (board.isError)
    return <ErrorNote error={board.error} fallback="Could not load the bed board" />;
  if (!board.data) return null;

  const { totals, floors } = board.data;

  function renderTile(bed: BedTile) {
    if (bed.status === 'occupied' && bed.occupant) {
      const o = bed.occupant;
      return (
        <button
          key={bed.id}
          type="button"
          className="bed-tile is-occupied"
          onClick={() => navigate(`/admissions/${o.admissionId}`)}
          title={`Open admission ${o.admissionNo}`}
        >
          <span className="bed-state">Occupied</span>
          <span className="bed-name">{bed.name}</span>
          <span>{o.patientName}</span>
          <span className="bed-sub">
            MRN {o.mrn} · in {timeAgo(o.admittedAt)}
          </span>
        </button>
      );
    }

    if (bed.status === 'blocked') {
      return (
        <div key={bed.id} className="bed-tile is-blocked">
          <span className="bed-state">Blocked</span>
          <span className="bed-name">{bed.name}</span>
          <span className="bed-sub">
            {bed.blockReason ? BED_BLOCK_REASON_LABELS[bed.blockReason] : 'Blocked'}
            {bed.blockNote ? ` — ${bed.blockNote}` : ''}
          </span>
          {canManage && (
            <div className="bed-actions">
              <button
                type="button"
                className="secondary"
                disabled={unblock.isPending}
                onClick={() => unblock.mutate(bed.id)}
              >
                Unblock
              </button>
            </div>
          )}
        </div>
      );
    }

    // available
    return (
      <div key={bed.id} className="bed-tile is-available">
        <span className="bed-state">Available</span>
        <span className="bed-name">{bed.name}</span>
        <span className="bed-sub">{bed.bedType.name}</span>

        {blockingId === bed.id ? (
          <div className="bed-actions" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            {blockIssue && (
              <div className="alert" role="alert">
                {blockIssue}
              </div>
            )}
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as BedBlockReason)}
              aria-label={`Reason to block ${bed.name}`}
            >
              {BLOCK_REASONS.map((r) => (
                <option key={r} value={r}>
                  {BED_BLOCK_REASON_LABELS[r]}
                </option>
              ))}
            </select>
            <input
              placeholder="Note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-label={`Note for blocking ${bed.name}`}
            />
            <div className="row">
              <button
                type="button"
                disabled={block.isPending}
                onClick={() => block.mutate(bed.id)}
              >
                Block bed
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setBlockingId(null);
                  setBlockIssue(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="bed-actions">
            <Link to={`/admissions/new?bedId=${bed.id}`}>
              <button type="button">Admit here</button>
            </Link>
            {canManage && (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setBlockingId(bed.id);
                  setReason('cleaning');
                  setNote('');
                  setBlockIssue(null);
                }}
              >
                Block
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <h1>Bed board</h1>
        {can('admission:create') && (
          <Link to="/admissions/new">
            <button type="button">Admit patient</button>
          </Link>
        )}
      </div>

      <div className="board-totals">
        <div className="board-total">
          <span className="n">{totals.total}</span>
          <span className="k">Total beds</span>
        </div>
        <div className="board-total">
          <span className="n">{totals.occupied}</span>
          <span className="k">Occupied</span>
        </div>
        <div className="board-total">
          <span className="n">{totals.available}</span>
          <span className="k">Available</span>
        </div>
        <div className="board-total">
          <span className="n">{totals.blocked}</span>
          <span className="k">Blocked</span>
        </div>
      </div>

      <ErrorNote error={unblock.error} fallback="Could not unblock the bed" />

      {floors.length === 0 && (
        <p className="muted">
          No wards set up yet. <Link to="/setup/wards">Set up wards and beds</Link>.
        </p>
      )}

      {floors.map((floor) => (
        <div className="board-floor" key={floor.id}>
          <h2>{floor.name}</h2>
          {floor.wards.map((ward) => (
            <div className="board-ward" key={ward.id}>
              <h3>{ward.name}</h3>
              {ward.beds.length === 0 ? (
                <p className="muted">No beds in this ward.</p>
              ) : (
                <div className="bed-grid">{ward.beds.map(renderTile)}</div>
              )}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
