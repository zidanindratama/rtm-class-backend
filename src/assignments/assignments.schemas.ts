import {
  AssignmentQuestionType,
  AssignmentStatus,
  AssignmentType,
  SubmissionStatus,
  UserRole,
} from '@prisma/client';
import { z } from 'zod';
import { paginationQuerySchema } from '../common/schemas/pagination.schema';

const optionLabelSchema = z.enum(['A', 'B', 'C', 'D']);

const assignmentMcqQuestionSchema = z.object({
  id: z.string().trim().min(1),
  type: z.literal('MCQ').optional(),
  question: z.string().trim().min(1),
  options: z.array(z.string().trim().min(1)).length(4),
  correctOption: optionLabelSchema,
  points: z.coerce.number().int().min(0).max(1000).optional(),
});

const assignmentEssayQuestionSchema = z.object({
  id: z.string().trim().min(1),
  type: z.literal('ESSAY').optional(),
  question: z.string().trim().min(1),
  answerGuide: z.string().trim().optional(),
  points: z.coerce.number().int().min(0).max(1000).optional(),
});

export const assignmentContentSchema = z.object({
  richTextHtml: z.string().trim().optional(),
  questionSet: z
    .object({
      mcq: z.array(assignmentMcqQuestionSchema).default([]),
      essay: z.array(assignmentEssayQuestionSchema).default([]),
    })
    .optional(),
});

const mcqAnswerSchema = z.object({
  questionId: z.string().trim().min(1),
  answer: optionLabelSchema,
});

const essayAnswerSchema = z.object({
  questionId: z.string().trim().min(1),
  answer: z.string().trim().min(1),
});

const submitAnswersMcqSchema = z.object({
  format: z.literal('MCQ').default('MCQ'),
  responses: z.array(mcqAnswerSchema).min(1),
});

const submitAnswersEssaySchema = z.object({
  format: z.literal('ESSAY').default('ESSAY'),
  responses: z.array(essayAnswerSchema).min(1),
});

const submitAnswersTaskSchema = z.object({
  format: z.literal('TEXT').default('TEXT'),
  text: z.string().trim().min(1),
  attachments: z.array(z.string().trim().url()).optional(),
});

const submitAnswersGenericObjectSchema = z.object({
  format: z.literal('GENERIC').default('GENERIC'),
  payload: z.record(z.string(), z.unknown()),
});

const submissionAttachmentSchema = z.object({
  fileUrl: z.string().trim().url(),
  fileName: z.string().trim().max(255).optional(),
  fileMimeType: z.string().trim().max(255).optional(),
});

export const queryAssignmentsSchema = paginationQuerySchema.extend({
  classId: z.string().uuid().optional(),
  type: z.nativeEnum(AssignmentType).optional(),
  status: z.nativeEnum(AssignmentStatus).optional(),
  sort_by: z
    .enum(['createdAt', 'publishedAt', 'dueAt', 'title'])
    .default('createdAt'),
});

export const createAssignmentSchema = z.object({
  classId: z.string().uuid(),
  materialId: z.string().uuid().optional(),
  title: z.string().trim().min(3),
  description: z.string().trim().optional(),
  type: z.nativeEnum(AssignmentType),
  content: assignmentContentSchema.optional(),
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
  answers: z.union([
    submitAnswersMcqSchema,
    submitAnswersEssaySchema,
    submitAnswersTaskSchema,
    submitAnswersGenericObjectSchema,
  ]),
  attachments: z.array(submissionAttachmentSchema).max(20).optional(),
});

export const gradeSubmissionSchema = z.object({
  score: z.coerce.number().min(0).max(1000),
  feedback: z.string().trim().max(2000).optional(),
  status: z.nativeEnum(SubmissionStatus).default(SubmissionStatus.GRADED),
  attemptId: z.string().uuid().optional(),
  questionGrades: z
    .array(
      z.object({
        questionId: z.string().trim().min(1),
        questionType: z.nativeEnum(AssignmentQuestionType),
        score: z.coerce.number().min(0).max(1000),
        maxScore: z.coerce.number().min(0).max(1000),
        isCorrect: z.boolean().optional(),
        feedback: z.string().trim().max(2000).optional(),
      }),
    )
    .max(500)
    .optional(),
});

export const querySubmissionsSchema = paginationQuerySchema.extend({
  status: z.nativeEnum(SubmissionStatus).optional(),
  sort_by: z.enum(['submittedAt', 'gradedAt', 'score']).default('submittedAt'),
  studentId: z.string().uuid().optional(),
});

export const queryGradebookSchema = paginationQuerySchema.extend({
  sort_by: z
    .enum(['fullName', 'email', 'avgScore', 'submissionRate'])
    .default('fullName'),
  role: z.nativeEnum(UserRole).optional(),
});

export const querySubmissionAttemptsSchema = paginationQuerySchema.extend({
  sort_by: z
    .enum(['attemptNumber', 'submittedAt', 'createdAt'])
    .default('attemptNumber'),
});

export type QueryAssignmentsInput = z.infer<typeof queryAssignmentsSchema>;
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
export type PublishAssignmentInput = z.infer<typeof publishAssignmentSchema>;
export type SubmitAssignmentInput = z.infer<typeof submitAssignmentSchema>;
export type GradeSubmissionInput = z.infer<typeof gradeSubmissionSchema>;
export type QuerySubmissionsInput = z.infer<typeof querySubmissionsSchema>;
export type QueryGradebookInput = z.infer<typeof queryGradebookSchema>;
export type AssignmentContentInput = z.infer<typeof assignmentContentSchema>;
export type QuerySubmissionAttemptsInput = z.infer<
  typeof querySubmissionAttemptsSchema
>;
