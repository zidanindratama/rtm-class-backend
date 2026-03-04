import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  refreshTokenSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  updateProfileSchema,
} from './auth.schemas';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtPayload } from './types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller({ path: 'auth', version: '1' })
@ApiTags('Auth')
@ApiHeader({
  name: 'x-client-domain',
  required: true,
  description: 'Frontend origin domain (example: https://my-domain.com)',
  schema: { type: 'string', default: 'http://localhost:3000' },
})
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('sign-up')
  @ApiOperation({
    summary: 'Sign up',
    description: 'Create new account. Role can be ADMIN, TEACHER, or STUDENT.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['fullName', 'email', 'password', 'role'],
      properties: {
        fullName: { type: 'string', example: 'Zidan Indratama' },
        email: { type: 'string', format: 'email', example: 'zidan@example.com' },
        password: { type: 'string', minLength: 8, example: 'P@ssw0rd123' },
        role: {
          type: 'string',
          enum: ['ADMIN', 'TEACHER', 'STUDENT'],
          example: 'STUDENT',
        },
      },
    },
  })
  signUp(@Body(new ZodValidationPipe(signUpSchema)) dto: unknown) {
    return this.authService.signUp(dto as any);
  }

  @Post('sign-in')
  @ApiOperation({ summary: 'Sign in (all roles)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email', example: 'admin.1@rtmclass.test' },
        password: { type: 'string', example: 'Password123!' },
      },
    },
  })
  signIn(@Body(new ZodValidationPipe(signInSchema)) dto: unknown) {
    return this.authService.signIn(dto as any, 'ANY');
  }

  @Post('sign-in/admin')
  @ApiOperation({ summary: 'Sign in (admin only)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email', example: 'admin.1@rtmclass.test' },
        password: { type: 'string', example: 'Password123!' },
      },
    },
  })
  signInAdmin(@Body(new ZodValidationPipe(signInSchema)) dto: unknown) {
    return this.authService.signIn(dto as any, 'ADMIN_ONLY');
  }

  @Post('sign-in/member')
  @ApiOperation({ summary: 'Sign in (teacher or student only)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email', example: 'teacher.1@rtmclass.test' },
        password: { type: 'string', example: 'Password123!' },
      },
    },
  })
  signInMember(@Body(new ZodValidationPipe(signInSchema)) dto: unknown) {
    return this.authService.signIn(dto as any, 'TEACHER_STUDENT_ONLY');
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh token pair' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['refreshToken'],
      properties: {
        refreshToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR...' },
      },
    },
  })
  refresh(@Body(new ZodValidationPipe(refreshTokenSchema)) dto: unknown) {
    return this.authService.refreshToken(dto as any);
  }

  @Post('sign-out')
  @ApiOperation({
    summary: 'Sign out',
    description:
      'Revoke refresh token. You can send refresh token in Authorization Bearer or request body.',
  })
  @ApiHeader({
    name: 'authorization',
    required: false,
    description: 'Optional Bearer refresh token. Alternative: send refreshToken in body.',
  })
  @ApiBody({
    required: false,
    schema: {
      type: 'object',
      properties: {
        refreshToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR...' },
      },
    },
  })
  signOut(
    @Headers('authorization') authorization?: string,
    @Body() body?: { refreshToken?: string },
  ) {
    const bearerToken =
      authorization?.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length).trim()
        : undefined;

    const refreshToken = bearerToken || body?.refreshToken;
    if (!refreshToken) {
      throw new BadRequestException(
        'Refresh token is required in Authorization Bearer token or request body',
      );
    }

    return this.authService.signOut({ refreshToken });
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Send OTP for password reset' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email'],
      properties: {
        email: { type: 'string', format: 'email', example: 'zidan@example.com' },
      },
    },
  })
  forgotPassword(@Body(new ZodValidationPipe(forgotPasswordSchema)) dto: unknown) {
    return this.authService.forgotPassword(dto as any);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password using OTP' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'otpCode', 'newPassword'],
      properties: {
        email: { type: 'string', format: 'email', example: 'zidan@example.com' },
        otpCode: { type: 'string', minLength: 6, maxLength: 6, example: '123456' },
        newPassword: { type: 'string', minLength: 8, example: 'NewP@ssw0rd123' },
      },
    },
  })
  resetPassword(@Body(new ZodValidationPipe(resetPasswordSchema)) dto: unknown) {
    return this.authService.resetPassword(dto as any);
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Change password (authenticated user)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['currentPassword', 'newPassword'],
      properties: {
        currentPassword: { type: 'string', example: 'OldP@ssw0rd123' },
        newPassword: { type: 'string', minLength: 8, example: 'NewP@ssw0rd123' },
      },
    },
  })
  changePassword(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(changePasswordSchema)) dto: unknown,
  ) {
    return this.authService.changePassword(user, dto as any);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update own profile' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fullName: { type: 'string', example: 'Updated Name' },
        address: { type: 'string', example: 'Jakarta' },
        phoneNumber: { type: 'string', example: '+62812345678' },
        pictureUrl: { type: 'string', example: 'https://cdn.site/avatar.png' },
      },
    },
  })
  updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(updateProfileSchema)) dto: unknown,
  ) {
    return this.authService.updateProfile(user, dto as any);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get current user profile' })
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.me(user);
  }
}
