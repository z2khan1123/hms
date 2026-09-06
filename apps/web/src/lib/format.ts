/** Presentation helpers shared across the OPD screens. */

export function fullName(p: { firstName: string; lastName: string }): string {
  return `${p.lastName}, ${p.firstName}`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { timeStyle: 'short' });
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A Date -> the value an `<input type="datetime-local">` expects, in local time. */
export function toLocalInput(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** `<input type="datetime-local">` value -> ISO 8601 with offset (`Z`). */
export function localInputToIso(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

/** Today as YYYY-MM-DD in local time. */
export function todayIsoDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Turn '' into undefined so optional zod fields validate. */
export function blankToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Compact "how long ago" label for queue waiting times. */
export function timeAgo(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.round((now - then) / 60_000);
  if (mins <= 0) return 'just now';
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs < 24) return rem ? `${hrs} h ${rem} min` : `${hrs} h`;
  return `${Math.floor(hrs / 24)} d`;
}
