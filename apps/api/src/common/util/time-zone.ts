/**
 * "Today" at a hospital means today in the hospital's timezone, not UTC. The OPD
 * queue is the one screen where getting that wrong is immediately visible, so the
 * day boundaries are derived from the tenant's IANA timezone.
 *
 * Implemented with `Intl` rather than a date library — the API has no date
 * dependency and this is the only place that needs zone maths.
 */

/** Offset of `timeZone` from UTC, in milliseconds, at the given instant. */
function zoneOffsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);

  const field = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((p) => p.type === type);
    return found ? Number(found.value) : 0;
  };

  const asIfUtc = Date.UTC(
    field('year'),
    field('month') - 1,
    field('day'),
    field('hour'),
    field('minute'),
    field('second'),
  );
  // Drop sub-second precision on both sides so the difference is a clean offset.
  return asIfUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** `YYYY-MM-DD` for the given instant as seen in `timeZone`. */
export function zonedDateString(timeZone: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

export interface DayRange {
  /** Inclusive lower bound, as a UTC instant. */
  start: Date;
  /** Exclusive upper bound, as a UTC instant. */
  end: Date;
}

/** The UTC instants bounding the calendar day that `at` falls on in `timeZone`. */
export function zonedDayRange(
  timeZone: string,
  at: Date = new Date(),
): DayRange {
  const ymd = zonedDateString(timeZone, at);
  const offset = zoneOffsetMs(timeZone, at);
  const start = new Date(Date.parse(`${ymd}T00:00:00.000Z`) - offset);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}
