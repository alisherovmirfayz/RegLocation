import { z } from 'zod';

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const list = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? '')
      .split(',')
      .map((s) => s.trim().replace(/\/$/, ''))
      .filter(Boolean),
  );

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL обязателен'),
  /** Публичный адрес монитора/бэкенда, например https://monitor.example.com */
  PUBLIC_MONITOR_URL: z.string().url().default('http://localhost:8080'),
  /** Публичный адрес сайта учителя и директора, например https://app.example.com */
  PUBLIC_APP_URL: z.string().url().default('http://localhost:5174'),
  /** Дополнительные разрешённые источники CORS через запятую. */
  CORS_ORIGINS: list,
  /** Email владельца — только он может создать первый аккаунт директора. */
  INITIAL_DIRECTOR_EMAIL: z.string().email().optional().or(z.literal('').transform(() => undefined)),
  /** Доверять заголовкам X-Forwarded-* (за прокси облачного хостинга). */
  TRUST_PROXY: z.string().default('1'),
  COOKIE_SECURE: z.string().optional(),
  /** Домен cookie, например ".example.com" — нужен только при прямых запросах между поддоменами. */
  COOKIE_DOMAIN: z.string().optional(),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(24 * 14),
  MONITOR_SESSION_TTL_HOURS: z.coerce.number().positive().default(24 * 90),

  MAIL_TRANSPORT: z.enum(['smtp', 'console', 'memory']).default('console'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_SECURE: bool(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('RegLocation <no-reply@reglocation.local>'),

  STORAGE_DRIVER: z.enum(['database', 's3']).default('database'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool(true),

  OCR_LANGS: z.string().default('eng+rus'),
  OCR_LANG_PATH: z.string().optional(),
  OCR_CACHE_PATH: z.string().optional(),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(15),
  MAX_PDF_PAGES: z.coerce.number().int().positive().default(6),

  SCHEDULER_INTERVAL_MS: z.coerce.number().int().positive().default(10_000),
  /** socket — постоянное соединение Socket.IO (Railway, Render, Docker); poll — опрос (Vercel и другие serverless). */
  REALTIME: z.enum(['socket', 'poll']).default('socket'),
  /** Ключ шифрования паролей, которые директор может посмотреть (учителя, монитор). */
  CREDENTIALS_KEY: z.string().min(16, 'CREDENTIALS_KEY — не короче 16 символов').optional(),
  /** Секрет для ежедневной задачи Vercel Cron (/api/cron/daily). */
  CRON_SECRET: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type AppConfig = z.infer<typeof EnvSchema> & {
  isProd: boolean;
  cookieSecure: boolean;
  allowedOrigins: string[];
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Некорректные переменные окружения: ${msg}`);
  }
  const c = parsed.data;
  const isProd = c.NODE_ENV === 'production';
  const cookieSecure = c.COOKIE_SECURE !== undefined ? c.COOKIE_SECURE === 'true' : isProd;
  const allowedOrigins = Array.from(
    new Set([c.PUBLIC_MONITOR_URL, c.PUBLIC_APP_URL, ...c.CORS_ORIGINS].map((o) => new URL(o).origin)),
  );
  if (isProd) {
    // Рабочий сайт не запускается в «тестовой» конфигурации: письма только по SMTP, только настоящие адреса
    const problems: string[] = [];
    if (c.MAIL_TRANSPORT !== 'smtp') problems.push('MAIL_TRANSPORT должен быть smtp (код подтверждения директора отправляется только на email)');
    else if (!c.SMTP_HOST) problems.push('MAIL_TRANSPORT=smtp требует SMTP_HOST');
    if (!c.INITIAL_DIRECTOR_EMAIL) problems.push('укажите INITIAL_DIRECTOR_EMAIL — email владельца, который создаст первого директора');
    for (const key of ['PUBLIC_MONITOR_URL', 'PUBLIC_APP_URL'] as const) {
      const u = new URL(c[key]);
      if (u.protocol !== 'https:' || ['localhost', '127.0.0.1'].includes(u.hostname)) problems.push(`${key} должен быть настоящим https-адресом сайта (сейчас ${c[key]})`);
    }
    if (problems.length) throw new Error(`Рабочий режим (NODE_ENV=production) не настроен: ${problems.join('; ')}`);
  }
  if (c.STORAGE_DRIVER === 's3' && (!c.S3_BUCKET || !c.S3_ACCESS_KEY_ID || !c.S3_SECRET_ACCESS_KEY)) {
    throw new Error('STORAGE_DRIVER=s3 требует S3_BUCKET, S3_ACCESS_KEY_ID и S3_SECRET_ACCESS_KEY');
  }
  return { ...c, isProd, cookieSecure, allowedOrigins };
}
