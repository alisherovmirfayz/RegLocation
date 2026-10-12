import { createServer, type Server as HttpServer } from 'node:http';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { PrismaClient } from '@prisma/client';
import type { AppConfig } from './config';
import type { AppContext, Clock } from './context';
import { createMailer, type Mailer } from './lib/mail';
import { FileStorage } from './lib/storage';
import { SettingsService } from './domain/settings';
import { LiveService } from './domain/live';
import { OcrService } from './ocr/service';
import { errorHandler } from './lib/errors';
import { originGuard } from './auth/sessions';
import { authRouter } from './routes/auth';
import { directorRouter } from './routes/director';
import { teacherRouter } from './routes/teacher';
import { cronRouter, filesRouter, monitorRouter, publicRouter, realtimeRouter } from './routes/misc';
import { attachRealtime } from './realtime';
import { seedDefaults } from './domain/seed';
import { logger } from './lib/logger';

export const VERSION = process.env.APP_VERSION ?? process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? 'dev';

export function createContext(config: AppConfig, overrides: { prisma?: PrismaClient; mailer?: Mailer; clock?: Clock } = {}): AppContext {
  const prisma = overrides.prisma ?? new PrismaClient();
  const live = new LiveService();
  const ctx: AppContext = {
    config,
    prisma,
    mailer: overrides.mailer ?? createMailer(config),
    storage: new FileStorage(prisma, config),
    clock: overrides.clock ?? { now: () => new Date() },
    settings: new SettingsService(prisma),
    live,
    ocr: new OcrService(config),
    io: null,
  };
  live.attach(ctx);
  ctx.settings.onChange = () => live.bumpVersion();
  return ctx;
}

/** CORS только для разрешённых доменов (монитор и сайт учителя/директора). */
function cors(ctx: AppContext) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.get('origin');
    if (origin && ctx.config.allowedOrigins.includes(origin)) {
      res.set({
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Max-Age': '600',
        Vary: 'Origin',
      });
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  };
}

function monitorDist(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const candidate of [path.resolve(here, '../monitor'), path.resolve(here, '../../dist/monitor'), path.resolve(process.cwd(), 'dist/monitor')]) {
    if (existsSync(path.join(candidate, 'index.html'))) return candidate;
  }
  return null;
}

export function createApp(ctx: AppContext): Express {
  const app = express();
  app.disable('x-powered-by');
  const trust = ctx.config.TRUST_PROXY;
  app.set('trust proxy', /^\d+$/.test(trust) ? Number(trust) : trust === 'true' ? true : trust);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'img-src': ["'self'", 'data:', 'blob:'],
          'connect-src': ["'self'", 'ws:', 'wss:'],
          'style-src': ["'self'", "'unsafe-inline'"],
          'font-src': ["'self'", 'data:'],
          'script-src': ["'self'"],
          'frame-ancestors': ["'none'"],
          'upgrade-insecure-requests': ctx.config.isProd ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
      strictTransportSecurity: ctx.config.isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
    }),
  );
  app.use(compression());

  // Health-check для облачного хостинга
  const health = async (_req: Request, res: Response) => {
    try {
      await ctx.prisma.$queryRaw`SELECT 1`;
      res.set('Cache-Control', 'no-store').json({ status: 'ok', db: 'ok', version: VERSION, uptime: Math.round(process.uptime()), time: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'error', db: 'unavailable', version: VERSION });
    }
  };
  app.get('/api/health', health);
  app.get('/healthz', health);

  app.use('/api', cors(ctx), originGuard(ctx), express.json({ limit: '1mb' }));
  // Сверка кеша с версией данных в базе; без постоянного планировщика (Vercel) — заодно автоуход в 17:00
  app.use('/api', async (_req, _res, next) => {
    try {
      await ctx.live.syncVersion();
      if (ctx.config.REALTIME === 'poll') await ctx.live.maintain();
    } catch (e) {
      logger.warn('Не удалось сверить версию данных', { err: String(e) });
    }
    next();
  });
  app.use('/api/public', publicRouter(ctx));
  app.use('/api/realtime', realtimeRouter(ctx));
  app.use('/api/cron', cronRouter(ctx));
  app.use('/api/auth', authRouter(ctx));
  app.use('/api/director', directorRouter(ctx));
  app.use('/api/teacher', teacherRouter(ctx));
  app.use('/api/monitor', monitorRouter(ctx));
  app.use('/api/files', filesRouter(ctx));
  app.use('/api', (_req, res) => void res.status(404).json({ error: 'Не найдено', code: 'NOT_FOUND' }));

  // Красивые адреса: старые пути с .html перенаправляются на новые
  const htmlRedirects: Record<string, string> = {
    '/index.html': '/monitor',
    '/monitor.html': '/monitor',
    '/monitor/index.html': '/monitor',
    '/login.html': '/monitor/login',
    '/monitor-login.html': '/monitor/login',
    '/monitor/login.html': '/monitor/login',
  };
  app.use((req, res, next) => {
    const target = htmlRedirects[req.path];
    if (target) return res.redirect(301, target);
    if (req.path.endsWith('.html')) return res.redirect(301, req.path.replace(/(\/index)?\.html$/, '') || '/');
    next();
  });
  app.get('/', (_req, res) => res.redirect(302, '/monitor'));

  const dist = monitorDist();
  if (dist) {
    app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y', index: false }));
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(['/monitor', '/monitor/*rest'], (_req, res) => {
      res.set('Cache-Control', 'no-cache').sendFile(path.join(dist, 'index.html'));
    });
  } else {
    logger.warn('Сборка монитора не найдена (dist/monitor). В режиме разработки используйте Vite: npm run dev');
  }

  app.use((_req, res) => void res.status(404).type('text/plain; charset=utf-8').send('Страница не найдена'));
  app.use(errorHandler);
  return app;
}

export interface RunningServer {
  ctx: AppContext;
  app: Express;
  server: HttpServer;
  close(): Promise<void>;
}

export async function startServer(ctx: AppContext, opts: { port?: number; scheduler?: boolean } = {}): Promise<RunningServer> {
  await seedDefaults(ctx.prisma);
  const app = createApp(ctx);
  const server = createServer(app);
  const io = attachRealtime(ctx, server);
  await new Promise<void>((resolve) => server.listen(opts.port ?? ctx.config.PORT, resolve));
  if (opts.scheduler !== false) ctx.live.start();
  return {
    ctx,
    app,
    server,
    async close() {
      ctx.live.stop();
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await ctx.ocr.terminate();
    },
  };
}
