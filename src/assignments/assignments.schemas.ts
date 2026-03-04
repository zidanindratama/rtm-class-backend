import { AssignmentStatus, AssignmentType, SubmissionStatus, UserRole } from '@prisma/client';
import { z } from 'zod';
import { paginationQuerySchema } from '../common/schemas/pagination.schema';

export const queryAssignmentsSchema = paginationQuerySchema.extend({
  classId: z.string().uuid().optional(),
  type: z.nativeEnum(AssignmentType).optional(),
  status: z.nativeEnum(AssignmentStatus).optional(),
  sort_by: z.enum(['createdAt', 'publishedAt', 'dueAt', 'title']).default('createdAt'),
});

export const createAssignmentSchema = z.object({
  classId: z.string().uuid(),
  materialId: z.string().uuid().optional(),
  title: z.string().trim().min(3),
  description: z.string().trim().optional(),
  type: z.nativeEnum(AssignmentType),
  content: z.unknown().optional(),
  passingScore: z.coerce.number().int().min(0).max(100).default(70),
  maxScore: z.coerce.number().int().min(1).max(1000).default(100),
  dueAt: z.coerce.date().optional(),
  status: z.nativeEnum(AssignmentStatus).optional(),
});

export const updateAssignmentSchema = createAssignmentSchema
  .omit({ classId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const publishAssignmentSchema = z.object({
  published: z.boolean().default(true),
  publishedAt: z.coerce.date().optional(),
});

export const submitAssignmentSchema = z.object({
  answers: z.unknown(),
});

export const gradeSubmissionSchema = z.object({
  score: z.coerce.number().min(0).max(1000),
  feedback: z.string().trim().max(2000).optional(),
  status: z.nativeEnum(SubmissionStatus).default(SubmissionStatus.GRADED),
});

export const querySubmissionsSchema = paginationQuerySchema.extend({
  status: z.nativeEnum(SubmissionStatus).optional(),
  sort_by: z.enum(['submittedAt', 'gradedAt', 'score']).default('submittedAt'),
  studentId: z.string().uuid().optional(),
});

export const queryGradebookSchema = paginationQuerySchema.extend({
  sort_by: z.enum(['fullName', 'email', 'avgScore', 'submissionRate']).default('fullName'),
  role: z.nativeEnum(UserRole).optional(),
});

export type QueryAssignmentsInput = z.infer<typeof queryAssignmentsSchema>;
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
export type PublishAssignmentInput = z.infer<typeof publishAssignmentSchema>;
export type SubmitAssignmentInput = z.infer<typeof submitAssignmentSchema>;
export type GradeSubmissionInput = z.infer<typeof gradeSubmissionSchema>;
export type QuerySubmissionsInput = z.infer<typeof querySubmissionsSchema>;
export type QueryGradebookInput = z.infer<typeof queryGradebookSchema>;
