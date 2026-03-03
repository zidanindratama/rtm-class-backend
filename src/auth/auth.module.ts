import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MailModule } from '../mail/mail.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

function toSeconds(input: string): number {
  const normalized = input.trim();
  const match = normalized.match(/^(\d+)([smhd])$/i);
  if (!match) {
    return 15 * 60;
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };

  return value * multipliers[unit];
}

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      global: false,
      secret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
      signOptions: {
        expiresIn: toSeconds(process.env.JWT_ACCESS_EXPIRES_IN ?? '15m'),
      },
    }),
    MailModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
