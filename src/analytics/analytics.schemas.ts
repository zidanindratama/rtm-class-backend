import { z } from 'zod';

export const classAnalyticsQuerySchema = z.object({
  passingScore: z.coerce.number().min(0).max(100).default(70),
});

export const dashboardAnalyticsQuerySchema = z.object({
  weeks: z.coerce.number().int().min(2).max(12).default(6),
});

export type ClassAnalyticsQueryInput = z.infer<
  typeof classAnalyticsQuerySchema
>;
export type DashboardAnalyticsQueryInput = z.infer<
  typeof dashboardAnalyticsQuerySchema
>;
