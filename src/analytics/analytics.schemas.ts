import { z } from 'zod';

export const classAnalyticsQuerySchema = z.object({
  passingScore: z.coerce.number().min(0).max(100).default(70),
});

export type ClassAnalyticsQueryInput = z.infer<typeof classAnalyticsQuerySchema>;
