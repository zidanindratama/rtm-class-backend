import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OtpPurpose, User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtPayload } from './types';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        email: dto.email.toLowerCase(),
        passwordHash,
        role: dto.role ?? UserRole.STUDENT,
        profile: {
          create: {},
        },
      },
      include: { profile: true },
    });

    const tokens = await this.issueTokens(user);

    return {
      message: 'Register successful',
      data: {
        user: this.serializeUser(user),
        ...tokens,
      },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { profile: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.isSuspended) {
      throw new UnauthorizedException('Account is suspended');
    }

    const isValidPassword = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.issueTokens(user);

    return {
      message: 'Login successful',
      data: {
        user: this.serializeUser(user),
        ...tokens,
      },
    };
  }

  async refreshToken(dto: RefreshTokenDto) {
    let payload: JwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(dto.refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (user.isSuspended) {
      throw new UnauthorizedException('Account is suspended');
    }

    const activeTokens = await this.prisma.refreshToken.findMany({
      where: {
        userId: user.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    let matchedTokenId: string | null = null;
    for (const tokenRow of activeTokens) {
      const isMatch = await bcrypt.compare(dto.refreshToken, tokenRow.tokenHash);
      if (isMatch) {
        matchedTokenId = tokenRow.id;
        break;
      }
    }

    if (!matchedTokenId) {
      throw new UnauthorizedException('Refresh token is revoked or invalid');
    }

    await this.prisma.refreshToken.update({
      where: { id: matchedTokenId },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.issueTokens(user);

    return {
      message: 'Token refreshed',
      data: {
        ...tokens,
      },
    };
  }

  async logout(dto: RefreshTokenDto) {
    const tokenRows = await this.prisma.refreshToken.findMany({
      where: {
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    for (const row of tokenRows) {
      const isMatch = await bcrypt.compare(dto.refreshToken, row.tokenHash);
      if (isMatch) {
        await this.prisma.refreshToken.update({
          where: { id: row.id },
          data: { revokedAt: new Date() },
        });
        break;
      }
    }

    return {
      message: 'Logout successful',
      data: null,
    };
  }

  async me(userPayload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: userPayload.sub },
      include: { profile: true },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      message: 'User profile fetched',
      data: {
        user: this.serializeUser(user),
      },
    };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) {
      return {
        message: 'If account exists, OTP has been sent to email',
        data: null,
      };
    }

    const otpCode = this.generateOtpCode();
    const otpHash = await bcrypt.hash(otpCode, SALT_ROUNDS);
    const otpExpiryMinutes = Number(process.env.OTP_EXPIRES_MINUTES ?? 15);
    const expiresAt = new Date(Date.now() + otpExpiryMinutes * 60 * 1000);

    await this.prisma.otp.create({
      data: {
        purpose: OtpPurpose.PASSWORD_RESET,
        codeHash: otpHash,
        expiresAt,
        userId: user.id,
      },
    });

    await this.mailService.sendOtpEmail(user.email, user.fullName, otpCode, otpExpiryMinutes);

    return {
      message: 'If account exists, OTP has been sent to email',
      data: null,
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) {
      throw new BadRequestException('Invalid OTP or user');
    }

    const otpRecord = await this.prisma.otp.findFirst({
      where: {
        userId: user.id,
        purpose: OtpPurpose.PASSWORD_RESET,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      throw new BadRequestException('OTP expired or not found');
    }

    const isValidOtp = await bcrypt.compare(dto.otpCode, otpRecord.codeHash);
    if (!isValidOtp) {
      throw new BadRequestException('Invalid OTP code');
    }

    const newPasswordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newPasswordHash },
      }),
      this.prisma.otp.update({
        where: { id: otpRecord.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return {
      message: 'Password reset successful',
      data: null,
    };
  }

  async changePassword(userPayload: JwtPayload, dto: ChangePasswordDto) {
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'New password must be different from current password',
      );
    }

    const user = await this.prisma.user.findUnique({ where: { id: userPayload.sub } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isValidCurrentPassword = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!isValidCurrentPassword) {
      throw new BadRequestException('Current password is invalid');
    }

    const newPasswordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newPasswordHash },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return {
      message: 'Password changed successfully. Please login again.',
      data: null,
    };
  }

  private async issueTokens(user: User) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
      expiresIn: this.secondsFromText(
        process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
        15 * 60,
      ),
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
      expiresIn: this.secondsFromText(
        process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
        7 * 24 * 60 * 60,
      ),
    });

    const refreshTokenHash = await bcrypt.hash(refreshToken, SALT_ROUNDS);
    const refreshTokenTtlMs =
      this.secondsFromText(
        process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
        7 * 24 * 60 * 60,
      ) * 1000;

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refreshTokenHash,
        expiresAt: new Date(Date.now() + refreshTokenTtlMs),
      },
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  }

  private serializeUser(
    user: User & {
      profile?: {
        id: string;
        address: string | null;
        phoneNumber: string | null;
        pictureUrl: string | null;
      } | null;
    },
  ) {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isSuspended: user.isSuspended,
      profile: user.profile
        ? {
            id: user.profile.id,
            address: user.profile.address,
            phoneNumber: user.profile.phoneNumber,
            pictureUrl: user.profile.pictureUrl,
          }
        : null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private generateOtpCode(): string {
    return String(crypto.randomInt(100000, 999999));
  }

  private secondsFromText(input: string, fallbackSeconds: number): number {
    const normalized = input.trim();
    const match = normalized.match(/^(\d+)([smhd])$/i);
    if (!match) {
      return fallbackSeconds;
    }

    const value = Number(match[1]);
    const unit = match[2].toLowerCase();

    const multipliers: Record<string, number> = {
      s: 1,
      m: 60,
      h: 60 * 60,
      d: 24 * 60 * 60,
    };

    return value * multipliers[unit];
  }
}
