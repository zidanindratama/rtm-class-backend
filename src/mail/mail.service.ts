import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as handlebars from 'handlebars';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  async sendOtpEmail(
    email: string,
    fullName: string,
    otpCode: string,
    expiresInMinutes: number,
  ): Promise<void> {
    const user = process.env.EMAIL_USER?.trim();
    const pass = process.env.EMAIL_APP_PASSWORD?.trim();
    const fromAddress = process.env.EMAIL_FROM?.trim() || user;
    const strictMode = this.asBoolean(process.env.EMAIL_STRICT_MODE, false);
    const disableSend = this.asBoolean(process.env.EMAIL_DISABLE_SEND, false);

    if (disableSend) {
      this.logger.warn('EMAIL_DISABLE_SEND=true. Skip sending email.');
      return;
    }

    if (!user || !pass) {
      this.logger.warn(
        'EMAIL_USER or EMAIL_APP_PASSWORD is not set. Skip sending email.',
      );
      return;
    }

    const templatePath = this.resolveTemplatePath('forgot-password.hbs');
    const templateSource = fs.readFileSync(templatePath, 'utf8');
    const html = handlebars.compile(templateSource)({
      fullName,
      otpCode,
      expiresInMinutes,
    });

    try {
      const transporter = this.createTransport(user, pass);
      await transporter.sendMail({
        from: `RTM Class <${fromAddress}>`,
        to: email,
        subject: 'RTM Class Password Reset OTP',
        html,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown mail error';

      if (strictMode) {
        throw error;
      }

      this.logger.error(`Failed to send OTP email: ${message}`);
    }
  }

  private createTransport(user: string, pass: string): Transporter {
    const host = process.env.EMAIL_HOST?.trim();
    const port = this.asNumber(process.env.EMAIL_PORT, 587);
    const secure = this.asBoolean(process.env.EMAIL_SECURE, port === 465);
    const provider = process.env.EMAIL_PROVIDER?.trim().toLowerCase() || 'smtp';

    if (provider === 'gmail' && !host) {
      return nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass },
      });
    }

    return nodemailer.createTransport({
      host: host || 'smtp.gmail.com',
      port,
      secure,
      requireTLS: this.asBoolean(process.env.EMAIL_REQUIRE_TLS, false),
      auth: { user, pass },
      tls: {
        rejectUnauthorized: !this.asBoolean(
          process.env.EMAIL_TLS_REJECT_UNAUTHORIZED,
          false,
        ),
      },
    });
  }

  private resolveTemplatePath(templateFileName: string): string {
    const candidatePaths = [
      path.join(process.cwd(), 'dist', 'mail', 'templates', templateFileName),
      path.join(
        process.cwd(),
        'dist',
        'src',
        'mail',
        'templates',
        templateFileName,
      ),
      path.join(process.cwd(), 'src', 'mail', 'templates', templateFileName),
    ];

    const existingPath = candidatePaths.find((candidatePath) =>
      fs.existsSync(candidatePath),
    );

    if (!existingPath) {
      throw new Error(`Mail template not found: ${templateFileName}`);
    }

    return existingPath;
  }

  private asBoolean(
    rawValue: string | undefined,
    defaultValue: boolean,
  ): boolean {
    if (!rawValue) {
      return defaultValue;
    }

    return ['1', 'true', 'yes', 'on'].includes(rawValue.trim().toLowerCase());
  }

  private asNumber(rawValue: string | undefined, defaultValue: number): number {
    const value = Number(rawValue);
    return Number.isFinite(value) ? value : defaultValue;
  }
}
