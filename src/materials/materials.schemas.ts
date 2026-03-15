import { AssignmentStatus, UserRole } from '@prisma/client';
import { z } from 'zod';
import { paginationQuerySchema } from '../common/schemas/pagination.schema';

export const materialsSortFields = ['createdAt', 'title'] as const;

export const queryMaterialsSchema = paginationQuerySchema.extend({
  classId: z.string().uuid().optional(),
  sort_by: z.enum(materialsSortFields).default('createdAt'),
});

export const createMaterialSchema = z.object({
  classId: z.string().uuid(),
  title: z.string().trim().min(3),
  description: z.string().trim().optional(),
  fileUrl: z.string().trim().url(),
  fileMimeType: z.string().trim().optional(),
});

export const updateMaterialSchema = createMaterialSchema
  .omit({ classId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const publishAiOutputSchema = z.object({
  outputId: z.string().uuid(),
  publish: z.boolean(),
});

export const materialJobsQuerySchema = z.object({
  includeOverview: z
    .preprocess(
      (value) => (value === '' || value === undefined ? undefined : value),
      z.coerce.boolean().optional(),
    )
    .optional(),
});

export const editAiOutputSchema = z.object({
  editedContent: z.record(z.string(), z.unknown()),
});

export const setAiOutputPublishSchema = z.object({
  publish: z.boolean(),
});

export const createAssignmentFromOutputSchema = z.object({
  title: z.string().trim().min(3).optional(),
  description: z.string().trim().optional(),
  dueAt: z.coerce.date().optional(),
  status: z
    .nativeEnum(AssignmentStatus)
    .optional()
    .default(AssignmentStatus.DRAFT),
});

export const allowedMaterialCreatorRoles: UserRole[] = [
  UserRole.ADMIN,
  UserRole.TEACHER,
];

export type QueryMaterialsInput = z.infer<typeof queryMaterialsSchema>;
export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;
export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>;
export type MaterialJobsQueryInput = z.infer<typeof materialJobsQuerySchema>;
export type EditAiOutputInput = z.infer<typeof editAiOutputSchema>;
export type SetAiOutputPublishInput = z.infer<typeof setAiOutputPublishSchema>;
export type CreateAssignmentFromOutputInput = z.infer<
  typeof createAssignmentFromOutputSchema
>;
