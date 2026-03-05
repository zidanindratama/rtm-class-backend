import { UserRole } from '@prisma/client';
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

export const publishAiOutputSchema = z.object({
  outputId: z.string().uuid(),
  publish: z.boolean(),
});

export const allowedMaterialCreatorRoles: UserRole[] = [
  UserRole.ADMIN,
  UserRole.TEACHER,
];

export type QueryMaterialsInput = z.infer<typeof queryMaterialsSchema>;
export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;
