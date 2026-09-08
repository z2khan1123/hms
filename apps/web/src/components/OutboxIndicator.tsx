import { useEffect, useState } from 'react';
import {
  OFFLINE_OPERATION_LABELS,
  OUTBOX_STATUS_LABELS,
  type OutboxEntry,
} from '@hms/shared';
import { allEntries, flush, remove, subscribe } from '../lib/outbox';
import { formatDateTime } from '../lib/format';

/**
 * What the desk is still holding.
 *
 * Shows nothing at all when the queue is empty and the connection is up — an
 * always-visible "online" badge is noise, and people stop seeing it long before
 * it matters. It appears exactly when there is something to know.
 */
export function OutboxIndicator() {
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void allEntries().then((e) => {
        if (alive) setEntries(e);
      });
    };
    refresh();
    const unsubscribe = subscribe(refresh);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    // The store also changes from a background flush, so poll gently as well.
    const timer = setInterval(refresh, 5_000);
    return () => {
      alive = false;
      unsubscribe();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(timer);
    };
  }, []);

  const pending = entries.filter((e) => e.status !== 'sent');
  const rejected = pending.filter((e) => e.status === 'rejected');

  if (online && pending.length === 0) return null;

  return (
    <div className={`outbox ${rejected.length > 0 ? 'outbox-attention' : ''}`}>
      <button type="button" onClick={() => setOpen((v) => !v)}>
        {!online && 'Offline · '}
        {pending.length > 0
          ? `${pending.length} waiting to send`
          : 'Offline — work will be saved'}
        {rejected.length > 0 && ` · ${rejected.length} need attention`}
      </button>

      {open && (
        <div className="outbox-panel">
          <p className="muted">
            {online
              ? 'Sending in the background. You can carry on.'
              : 'No connection. Everything you do is saved here and sent when the connection returns.'}
          </p>
          {pending.length === 0 && <p className="muted">Nothing waiting.</p>}
          <ul>
            {pending.map((e) => (
              <li key={e.key}>
                <strong>{OFFLINE_OPERATION_LABELS[e.operation]}</strong> —{' '}
                {e.summary}
                <div className="muted">
                  {OUTBOX_STATUS_LABELS[e.status]} · queued{' '}
                  {formatDateTime(e.createdAt)}
                  {e.attempts > 0 && ` · ${e.attempts} attempt(s)`}
                </div>
                {e.error && <div className="field-error">{e.error}</div>}
                {e.status === 'rejected' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          'Discard this? The work will not be sent, and you will have to enter it again.',
                        )
                      ) {
                        void remove(e.key);
                      }
                    }}
                  >
                    Discard
                  </button>
                )}
              </li>
            ))}
          </ul>
          {online && pending.length > 0 && (
            <button type="button" onClick={() => void flush()}>
              Try now
            </button>
          )}
        </div>
      )}
    </div>
  );
}
