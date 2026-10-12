import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Express } from 'express';
import { loadConfig } from './config';
import { createApp, createContext } from './app';
import { seedDefaults } from './domain/seed';
import { logger, setLogLevel } from './lib/logger';

/**
 * Точка входа для Vercel: Express-приложение как одна функция Vercel.
 * Постоянных соединений и фонового планировщика нет — обновления идут опросом (REALTIME=poll),
 * автоуход в 17:00 выполняется при запросах и ежедневной задачей Vercel Cron.
 */
export function applyVercelEnv(env: NodeJS.ProcessEnv = process.env) {
  env.REALTIME ??= 'poll';
  // Vercel принимает запросы до 4,5 МБ; фото больше 4 МБ браузер уменьшает перед загрузкой
  env.MAX_UPLOAD_MB ??= '4';
  // Монитор, сайт учителя и кабинет директора — на одном домене Vercel
  const site = env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined;
  if (site) {
    env.PUBLIC_APP_URL ??= site;
    env.PUBLIC_MONITOR_URL ??= site;
  }
  // Адрес конкретного развёртывания (предпросмотр) тоже допустим как источник запросов
  if (env.VERCEL_URL) env.CORS_ORIGINS = [env.CORS_ORIGINS, `https://${env.VERCEL_URL}`].filter(Boolean).join(',');
  // База Neon из интеграции Vercel: для Prisma — адрес через пул соединений (pgbouncer=true)
  env.DATABASE_URL = env.POSTGRES_PRISMA_URL || env.DATABASE_URL || env.POSTGRES_URL;
}

let ready: Promise<Express> | null = null;

async function init(): Promise<Express> {
  applyVercelEnv();
  const config = loadConfig();
  setLogLevel(config.LOG_LEVEL);
  const ctx = createContext(config);
  await seedDefaults(ctx.prisma);
  return createApp(ctx);
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  let app: Express;
  try {
    app = await (ready ??= init().catch((e) => {
      ready = null;
      throw e;
    }));
  } catch (e) {
    const message = String((e as Error)?.message ?? e);
    logger.error('Сервер не запущен', { err: message });
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    // Сообщение содержит только названия переменных окружения, без их значений
    res.end(JSON.stringify({ error: `Сервер RegLocation не настроен. ${message}`, code: 'NOT_CONFIGURED' }));
    return;
  }
  app(req as never, res as never);
}
