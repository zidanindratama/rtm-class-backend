import { UserRole } from '@prisma/client';
import { z } from 'zod';
import { paginationQuerySchema } from '../common/schemas/pagination.schema';

export const userSortFields = ['createdAt', 'fullName', 'email', 'role'] as const;

export const queryUsersSchema = paginationQuerySchema.extend({
  role: z.nativeEnum(UserRole).optional(),
  isSuspended: z
    .preprocess(
      (value) => (value === '' || value === undefined ? undefined : value),
      z.coerce.boolean().optional(),
    )
    .optional(),
  sort_by: z.enum(userSortFields).default('createdAt'),
});

export const createUserAdminSchema = z.object({
  fullName: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(8),
  role: z.nativeEnum(UserRole),
  isSuspended: z.boolean().optional(),
  address: z.string().trim().optional(),
  phoneNumber: z.string().trim().optional(),
  pictureUrl: z.string().trim().url().optional(),
});

export const updateUserAdminSchema = createUserAdminSchema.partial();

export const suspendUserSchema = z.object({
  suspended: z.boolean(),
});

export type QueryUsersInput = z.infer<typeof queryUsersSchema>;
export type CreateUserAdminInput = z.infer<typeof createUserAdminSchema>;
export type UpdateUserAdminInput = z.infer<typeof updateUserAdminSchema>;
export type SuspendUserInput = z.infer<typeof suspendUserSchema>;
