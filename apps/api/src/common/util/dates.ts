/** Date helpers shared by the DTO mappers. */

/** `Date` -> `YYYY-MM-DD` (the shape `isoDateSchema` expects). */
export function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function toIsoDateOrNull(value: Date | null | undefined): string | null {
  return value ? toIsoDate(value) : null;
}

export function toIsoDateTimeOrNull(
  value: Date | null | undefined,
): string | null {
  return value ? value.toISOString() : null;
}

/** `YYYY-MM-DD` -> a UTC-midnight `Date`, which is how Prisma stores `@db.Date`. */
export function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function parseIsoDateOrNull(
  value: string | null | undefined,
): Date | null {
  return value ? parseIsoDate(value) : null;
}
