import { AIJobType } from '@prisma/client';
import { z } from 'zod';

export const enqueueAiTransformSchema = z.object({
  materialId: z.string().uuid(),
  outputs: z.array(z.nativeEnum(AIJobType)).min(1),
  options: z
    .object({
      mcqCount: z.coerce.number().int().min(1).max(100).optional(),
      essayCount: z.coerce.number().int().min(1).max(100).optional(),
      summaryMaxWords: z.coerce.number().int().min(30).max(3000).optional(),
      mcpEnabled: z.coerce.boolean().optional(),
      mcqEnabled: z.coerce.boolean().optional(),
      callbackUrl: z.string().url().optional(),
    })
    .optional(),
});

export const aiCallbackSchema = z.object({
  success: z.boolean().default(true),
  status: z
    .enum([
      'accepted',
      'processing',
      'succeeded',
      'failed_processing',
      'failed_delivery',
    ])
    .optional(),
  externalJobId: z.string().trim().optional(),
  error: z
    .object({
      code: z.string().trim().optional(),
      message: z.string().trim().optional(),
    })
    .optional(),
  errorMessage: z.string().trim().optional(),
  result: z.unknown().optional(),
});

export type EnqueueAiTransformInput = z.infer<typeof enqueueAiTransformSchema>;
export type AiCallbackInput = z.infer<typeof aiCallbackSchema>;
