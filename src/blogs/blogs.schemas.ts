import { z } from 'zod';
import { paginationQuerySchema } from '../common/schemas/pagination.schema';

export const blogsSortFields = ['createdAt', 'publishedAt', 'title'] as const;

export const queryBlogsSchema = paginationQuerySchema.extend({
  isPublished: z
    .preprocess(
      (value) => (value === '' || value === undefined ? undefined : value),
      z.coerce.boolean().optional(),
    )
    .optional(),
  sort_by: z.enum(blogsSortFields).default('createdAt'),
});

export const createBlogSchema = z.object({
  title: z.string().trim().min(3),
  slug: z.string().trim().min(3).optional(),
  excerpt: z.string().trim().optional(),
  content: z.string().trim().min(10),
  isPublished: z.boolean().optional(),
});

export const updateBlogSchema = createBlogSchema.partial();

export type QueryBlogsInput = z.infer<typeof queryBlogsSchema>;
export type CreateBlogInput = z.infer<typeof createBlogSchema>;
export type UpdateBlogInput = z.infer<typeof updateBlogSchema>;
