import { z } from 'zod';
import { booleanQuery } from './common.js';

/**
 * Optional grouping on a service — only for filtering long lists and grouping
 * revenue reports. Never required when adding a service.
 */
export const serviceDepartmentSchema = z.enum([
  'opd',
  'procedure',
  'laboratory',
  'radiology',
  'pharmacy',
  'inpatient',
  'ambulance',
  'other',
]);
export type ServiceDepartment = z.infer<typeof serviceDepartmentSchema>;

export const SERVICE_DEPARTMENT_LABELS: Record<ServiceDepartment, string> = {
  opd: 'OPD',
  procedure: 'Procedure',
  laboratory: 'Laboratory',
  radiology: 'Radiology',
  pharmacy: 'Pharmacy',
  inpatient: 'Inpatient',
  ambulance: 'Ambulance',
  other: 'Other',
};

export const createServiceSchema = z.object({
  name: z.string().trim().min(1).max(160),
  department: serviceDepartmentSchema.optional(),
  /**
   * Optional suggested price in minor units. It only pre-fills the field on the
   * patient's bill — the price charged is always whatever is typed there.
   */
  defaultPriceMinor: z.number().int().min(0).optional(),
  description: z.string().trim().max(500).optional(),
});
export type CreateServiceInput = z.infer<typeof createServiceSchema>;

/**
 * `null` clears a field, `undefined` leaves it alone. A hospital that set a
 * suggested price must be able to take it away again.
 */
export const updateServiceSchema = createServiceSchema.partial().extend({
  department: serviceDepartmentSchema.nullish(),
  defaultPriceMinor: z.number().int().min(0).nullish(),
  description: z.string().trim().max(500).nullish(),
  isActive: z.boolean().optional(),
});
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

export const serviceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  department: serviceDepartmentSchema.nullable(),
  defaultPriceMinor: z.number().int().nullable(),
  description: z.string().nullable(),
  isActive: z.boolean(),
});
export type Service = z.infer<typeof serviceSchema>;

export const serviceListQuerySchema = z.object({
  department: serviceDepartmentSchema.optional(),
  q: z.string().trim().max(120).optional(),
  includeInactive: booleanQuery.optional(),
});
