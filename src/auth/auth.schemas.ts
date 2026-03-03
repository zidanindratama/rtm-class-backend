import { UserRole } from '@prisma/client';
import { z } from 'zod';

export const signUpSchema = z.object({
  fullName: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(8),
  role: z.nativeEnum(UserRole),
});

export const signInSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(16),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email(),
});

export const resetPasswordSchema = z.object({
  email: z.string().trim().email(),
  otpCode: z.string().length(6),
  newPassword: z.string().min(8),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8),
});

export const updateProfileSchema = z
  .object({
    fullName: z.string().trim().min(1).optional(),
    address: z.string().trim().optional(),
    phoneNumber: z.string().trim().optional(),
    pictureUrl: z.string().trim().url().optional(),
  })
  .refine(
    (value) =>
      value.fullName !== undefined ||
      value.address !== undefined ||
      value.phoneNumber !== undefined ||
      value.pictureUrl !== undefined,
    {
      message: 'At least one profile field must be provided',
      path: ['fullName'],
    },
  );

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
