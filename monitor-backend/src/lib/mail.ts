import nodemailer, { type Transporter } from 'nodemailer';
import type { AppConfig } from '../config';
import { logger } from './logger';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  send(msg: MailMessage): Promise<void>;
  readonly configured: boolean;
  /** Только для MAIL_TRANSPORT=memory (тесты) */
  outbox?: MailMessage[];
}

export function createMailer(config: AppConfig): Mailer {
  if (config.MAIL_TRANSPORT === 'memory') {
    const outbox: MailMessage[] = [];
    return { configured: true, outbox, send: async (m) => void outbox.push(m) };
  }
  if (config.MAIL_TRANSPORT === 'console') {
    if (config.isProd) {
      logger.warn('MAIL_TRANSPORT=console в production: письма не отправляются. Настройте SMTP.');
      return {
        configured: false,
        send: async () => {
          throw new Error('Почтовый сервис не настроен');
        },
      };
    }
    return {
      configured: true,
      send: async (m) => logger.info('[ПИСЬМО — режим разработки]', { to: m.to, subject: m.subject, text: m.text }),
    };
  }
  const transport: Transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT ?? (config.SMTP_SECURE ? 465 : 587),
    secure: config.SMTP_SECURE,
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
  });
  return {
    configured: true,
    send: async (m) => {
      await transport.sendMail({ from: config.MAIL_FROM, ...m });
    },
  };
}

export function codeEmail(title: string, intro: string, code: string): { subject: string; text: string; html: string } {
  const text = `${intro}\n\nКод подтверждения: ${code}\n\nКод действует 15 минут. Если вы не запрашивали код, просто проигнорируйте это письмо.\n\n— RegLocation`;
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:480px;margin:auto;padding:24px;border-radius:16px;background:#f1f5ff">
  <h2 style="color:#1d4ed8;margin:0 0 12px">RegLocation</h2>
  <p style="color:#0f172a">${intro}</p>
  <p style="font-size:32px;letter-spacing:8px;font-weight:700;color:#1e3a8a;background:#fff;border-radius:12px;padding:16px;text-align:center">${code}</p>
  <p style="color:#475569;font-size:13px">Код действует 15 минут. Если вы не запрашивали код, просто проигнорируйте это письмо.</p></div>`;
  return { subject: `RegLocation — ${title}`, text, html };
}
