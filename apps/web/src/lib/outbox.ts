import {
  IDEMPOTENCY_HEADER,
  isRetryable,
  outboxRetryDelayMs,
  type OfflineOperation,
  type OutboxEntry,
  type OutboxSummary,
} from '@hms/shared';
import { api } from './api';

const DB_NAME = 'hms-outbox';
const STORE = 'entries';
const DB_VERSION = 1;

/**
 * The front desk's outbox.
 *
 * A reception does not stop when the link does. Work queued here is held in
 * IndexedDB — which survives a reload, a crash and a flat battery, unlike
 * anything in memory — and sent when the connection comes back.
 *
 * The thing that makes this safe rather than merely convenient is the
 * idempotency key. It is generated once, when the operator presses the button,
 * and never regenerated. A request that timed out may or may not have been
 * applied; replaying it with the same key means the server either does the work
 * or replays what it already answered, and either way there is one patient
 * rather than two.
 */

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function allEntries(): Promise<OutboxEntry[]> {
  const rows = await tx<OutboxEntry[]>('readonly', (s) => s.getAll());
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function put(entry: OutboxEntry): Promise<void> {
  await tx('readwrite', (s) => s.put(entry));
  notify();
}

export async function remove(key: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(key));
  notify();
}

// --- subscription -------------------------------------------------------------

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const l of listeners) l();
}

// --- queueing -----------------------------------------------------------------

/**
 * Queue a write.
 *
 * Always queues first and sends second, even when online. That ordering is the
 * point: if the tab is closed mid-request, the work is already durable, and the
 * next load picks it up. Sending first and recording afterwards loses exactly
 * the requests that matter.
 */
export async function enqueue(input: {
  operation: OfflineOperation;
  path: string;
  body: Record<string, unknown>;
  summary: string;
}): Promise<OutboxEntry> {
  const entry: OutboxEntry = {
    key: crypto.randomUUID(),
    operation: input.operation,
    method: 'POST',
    path: input.path,
    body: input.body,
    summary: input.summary,
    status: 'queued',
    attempts: 0,
    createdAt: new Date().toISOString(),
    lastAttemptAt: null,
    error: null,
  };
  await put(entry);
  void flush();
  return entry;
}

// --- sending -------------------------------------------------------------------

let flushing = false;

/**
 * Try to send everything that is due, oldest first.
 *
 * Strictly in order, and it stops at the first network failure rather than
 * hammering a dead connection with the rest of the queue. Order matters: an
 * OPD visit queued after the patient it belongs to must not be sent first.
 */
export async function flush(): Promise<void> {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    const now = Date.now();
    for (const entry of await allEntries()) {
      if (entry.status === 'sent' || entry.status === 'rejected') continue;
      if (entry.status === 'failed' && entry.lastAttemptAt) {
        const due =
          new Date(entry.lastAttemptAt).getTime() +
          outboxRetryDelayMs(entry.attempts);
        if (now < due) continue;
      }

      const stop = await send(entry);
      if (stop) break;
    }
  } finally {
    flushing = false;
  }
}

/** Returns true when the caller should stop — the network is plainly down. */
async function send(entry: OutboxEntry): Promise<boolean> {
  await put({ ...entry, status: 'sending' });

  try {
    await api.post(entry.path, entry.body, {
      headers: { [IDEMPOTENCY_HEADER]: entry.key },
    });
    // Kept briefly as 'sent' so the operator sees it land, then swept.
    await put({
      ...entry,
      status: 'sent',
      attempts: entry.attempts + 1,
      lastAttemptAt: new Date().toISOString(),
      error: null,
    });
    setTimeout(() => void remove(entry.key), 5_000);
    return false;
  } catch (e) {
    const status =
      (e as { response?: { status?: number } }).response?.status ?? null;
    const message =
      (e as { response?: { data?: { message?: string } } }).response?.data
        ?.message ?? (e as Error).message;

    const retryable = isRetryable(status);
    await put({
      ...entry,
      // A 4xx will never succeed by being sent again — it needs a person.
      status: retryable ? 'failed' : 'rejected',
      attempts: entry.attempts + 1,
      lastAttemptAt: new Date().toISOString(),
      error: typeof message === 'string' ? message.slice(0, 300) : 'Failed',
    });
    return status === null;
  }
}

export async function summary(): Promise<OutboxSummary> {
  const entries = await allEntries();
  const waiting = entries.filter(
    (e) => e.status === 'queued' || e.status === 'sending' || e.status === 'failed',
  );
  return {
    queued: entries.filter((e) => e.status === 'queued' || e.status === 'sending')
      .length,
    failed: entries.filter((e) => e.status === 'failed').length,
    rejected: entries.filter((e) => e.status === 'rejected').length,
    oldestQueuedAt: waiting[0]?.createdAt ?? null,
  };
}

/** Start the background loop. Safe to call more than once. */
let started = false;
export function startOutbox(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('online', () => void flush());
  // A periodic sweep as well as the event: `online` fires when the interface
  // comes up, which is not the same as the server being reachable again.
  setInterval(() => void flush(), 15_000);
  void flush();
}
