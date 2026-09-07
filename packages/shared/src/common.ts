import { z } from 'zod';

export const uuidSchema = z.string().uuid();

/** ISO calendar date, YYYY-MM-DD. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected date as YYYY-MM-DD');

/** ISO datetime with offset, e.g. 2026-09-06T09:00:00.000Z */
export const isoDateTimeSchema = z.string().datetime({ offset: true });

/**
 * A boolean carried in a query string.
 *
 * NOT `z.coerce.boolean()` — that is `Boolean(value)`, so the string "false"
 * coerces to true and `?includeInactive=false` would switch the flag ON. This
 * reads the words people actually send.
 */
export const booleanQuery = z
  .union([z.boolean(), z.string()])
  .transform((v) => {
    if (typeof v === 'boolean') return v;
    const t = v.trim().toLowerCase();
    return t === 'true' || t === '1' || t === 'yes' || t === 'on';
  });

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function paginatedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    data: z.array(item),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  });
}

export type Paginated<T> = {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

/** E.164, biased to Pakistan (+92) but accepts any valid international number. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{6,14}$/, 'Phone must be in E.164 format, e.g. +923001234567');

export const addressSchema = z.object({
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(100),
  country: z.string().trim().length(2).default('PK'),
});
export type Address = z.infer<typeof addressSchema>;
