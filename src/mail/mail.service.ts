import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as handlebars from 'handlebars';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  async sendOtpEmail(
    email: string,
    fullName: string,
    otpCode: string,
    expiresInMinutes: number,
  ): Promise<void> {
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_APP_PASSWORD;

    if (!user || !pass) {
      this.logger.warn('EMAIL_USER or EMAIL_APP_PASSWORD is not set. Skip sending email.');
      return;
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user,
        pass,
      },
    });

    const templatePath = this.resolveTemplatePath('forgot-password.hbs');
    const templateSource = fs.readFileSync(templatePath, 'utf8');
    const html = handlebars.compile(templateSource)({
      fullName,
      otpCode,
      expiresInMinutes,
    });

    await transporter.sendMail({
      from: `RTM Class <${user}>`,
      to: email,
      subject: 'Kode OTP Reset Password RTM Class',
      html,
    });
  }

  private resolveTemplatePath(templateFileName: string): string {
    const candidatePaths = [
      path.join(process.cwd(), 'dist', 'mail', 'templates', templateFileName),
      path.join(process.cwd(), 'dist', 'src', 'mail', 'templates', templateFileName),
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
}
