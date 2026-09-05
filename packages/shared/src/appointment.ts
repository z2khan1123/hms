import { z } from 'zod';

/** Subset of FHIR appointment-status relevant to the MVP. */
export const appointmentStatusSchema = z.enum([
  'booked',
  'arrived',
  'fulfilled',
  'cancelled',
  'noshow',
]);
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;

export const createAppointmentSchema = z
  .object({
    patientId: z.string().uuid(),
    practitionerId: z.string().uuid(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    reason: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), {
    message: 'endsAt must be after startsAt',
    path: ['endsAt'],
  });
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const rescheduleAppointmentSchema = z
  .object({
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), {
    message: 'endsAt must be after startsAt',
    path: ['endsAt'],
  });

export const updateAppointmentStatusSchema = z.object({
  status: appointmentStatusSchema,
});

export const appointmentSchema = z.object({
  id: z.string().uuid(),
  patientId: z.string().uuid(),
  practitionerId: z.string().uuid(),
  startsAt: z.string(),
  endsAt: z.string(),
  status: appointmentStatusSchema,
  reason: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Appointment = z.infer<typeof appointmentSchema>;

export const appointmentListQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  practitionerId: z.string().uuid().optional(),
  patientId: z.string().uuid().optional(),
  status: appointmentStatusSchema.optional(),
});
