import { z } from 'zod';
import { paginationQuerySchema } from '../common/schemas/pagination.schema';

export const classesSortFields = ['createdAt', 'name', 'classCode'] as const;

export const queryClassesSchema = paginationQuerySchema.extend({
  sort_by: z.enum(classesSortFields).default('createdAt'),
});

export const createClassSchema = z.object({
  name: z.string().trim().min(3),
  institutionName: z.string().trim().optional(),
  classLevel: z.string().trim().optional(),
  academicYear: z.string().trim().optional(),
  description: z.string().trim().optional(),
});

export const updateClassSchema = createClassSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const joinClassSchema = z.object({
  classCode: z.string().trim().min(4).max(32),
});

export const queryClassMembersSchema = paginationQuerySchema.extend({
  sort_by: z.enum(['createdAt', 'fullName', 'email']).default('createdAt'),
});

export type QueryClassesInput = z.infer<typeof queryClassesSchema>;
export type CreateClassInput = z.infer<typeof createClassSchema>;
export type UpdateClassInput = z.infer<typeof updateClassSchema>;
export type JoinClassInput = z.infer<typeof joinClassSchema>;
export type QueryClassMembersInput = z.infer<typeof queryClassMembersSchema>;
