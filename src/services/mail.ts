import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';

declare global {
  // eslint-disable-next-line no-var
  var __mailer: Transporter | undefined;
}

export const mailer =
  global.__mailer ??
  nodemailer.createTransport({
    host: env.mail.host,
    port: env.mail.port,
    secure: false,
    ignoreTLS: true,
  });

if (env.nodeEnv !== 'production') {
  global.__mailer = mailer;
}

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendMail({ to, subject, text, html }: SendMailInput): Promise<void> {
  await mailer.sendMail({ from: env.mail.from, to, subject, text, html });
}
