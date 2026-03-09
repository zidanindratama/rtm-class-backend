import { z } from 'zod';
import { paginationQuerySchema } from '../common/schemas/pagination.schema';

export const forumsSortFields = ['createdAt', 'title'] as const;

export const listForumThreadsSchema = paginationQuerySchema.extend({
  classId: z.string().uuid(),
  sort_by: z.enum(forumsSortFields).default('createdAt'),
});

export const createForumThreadSchema = z.object({
  classId: z.string().uuid(),
  title: z.string().trim().min(3),
  content: z.string().trim().min(3),
});

export const createForumCommentSchema = z.object({
  content: z.string().trim().min(1),
});

export const updateForumThreadSchema = z
  .object({
    title: z.string().trim().min(3).optional(),
    content: z.string().trim().min(3).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const updateForumCommentSchema = z.object({
  content: z.string().trim().min(1),
});

export type ListForumThreadsInput = z.infer<typeof listForumThreadsSchema>;
export type CreateForumThreadInput = z.infer<typeof createForumThreadSchema>;
export type CreateForumCommentInput = z.infer<typeof createForumCommentSchema>;
export type UpdateForumThreadInput = z.infer<typeof updateForumThreadSchema>;
export type UpdateForumCommentInput = z.infer<typeof updateForumCommentSchema>;
