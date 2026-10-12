// RegLocation Teacher + Director — веб-сервер.
// Раздаёт собранный сайт и проксирует /api и /socket.io на backend (проект №1).
// Благодаря прокси сайт и API работают на одном домене: cookie сессий и Socket.IO
// не зависят от сторонних cookie и CORS-настроек браузера.
import { createServer } from 'node:http';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import compression from 'compression';
import helmet from 'helmet';
import { createProxyMiddleware } from 'http-proxy-middleware';

export function createApp({ upstream = process.env.API_UPSTREAM ?? 'http://localhost:8080', distDir } = {}) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dist = distDir ?? path.resolve(here, '../dist');
  const target = /^https?:\/\//.test(upstream) ? upstream : `http://${upstream}`;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  const proxy = createProxyMiddleware({
    target,
    changeOrigin: true,
    ws: true,
    pathFilter: ['/api', '/socket.io'],
    proxyTimeout: 120_000,
    on: {
      proxyReq: (proxyReq, req) => {
        // Сообщаем backend исходный домен (для проверки Origin) и реальный IP клиента
        // (по нему считается ограничение попыток входа). req.ip учитывает прокси хостинга (trust proxy = 1).
        if (req.headers.host) proxyReq.setHeader('X-Forwarded-Host', req.headers.host);
        proxyReq.setHeader('X-Forwarded-Proto', req.protocol ?? 'https');
        const ip = req.ip ?? req.socket?.remoteAddress;
        if (ip) proxyReq.setHeader('X-Forwarded-For', ip);
      },
      error: (err, _req, res) => {
        console.error(JSON.stringify({ level: 'error', msg: 'Ошибка прокси к backend', err: String(err) }));
        if (res && 'writeHead' in res && !res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Сервер RegLocation временно недоступен. Повторите попытку.', code: 'UPSTREAM' }));
        }
      },
    },
  });

  app.get('/healthz', async (_req, res) => {
    let api = 'unknown';
    try {
      const r = await fetch(new URL('/api/health', target), { signal: AbortSignal.timeout(4000) });
      api = r.ok ? 'ok' : `status ${r.status}`;
    } catch {
      api = 'unreachable';
    }
    res.set('Cache-Control', 'no-store').json({ status: 'ok', api });
  });

  // Прокси до любых других обработчиков (тело запроса не должно быть прочитано заранее)
  app.use(proxy);

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
        },
      },
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
    }),
  );
  app.use(compression());

  // Красивые адреса: без .html; старые пути перенаправляются
  const redirects = {
    '/index.html': '/teacher',
    '/teacher.html': '/teacher',
    '/login.html': '/teacher',
    '/teacher/index.html': '/teacher',
    '/director.html': '/director',
    '/director/index.html': '/director',
    '/director-login.html': '/director/login',
    '/director/login.html': '/director/login',
    '/director-register.html': '/director/register',
    '/director/register.html': '/director/register',
    '/register.html': '/director/register',
  };
  app.use((req, res, next) => {
    const to = redirects[req.path];
    if (to) return res.redirect(301, to);
    if (req.path.endsWith('.html')) return res.redirect(301, req.path.replace(/(\/index)?\.html$/, '') || '/');
    next();
  });
  app.get('/', (_req, res) => res.redirect(302, '/teacher'));

  if (existsSync(path.join(dist, 'index.html'))) {
    app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y', index: false }));
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(['/teacher', '/teacher/*rest', '/director', '/director/*rest'], (_req, res) => {
      res.set('Cache-Control', 'no-cache').sendFile(path.join(dist, 'index.html'));
    });
  }
  app.use((_req, res) => res.status(404).type('text/plain; charset=utf-8').send('Страница не найдена'));
  return { app, proxy };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { app, proxy } = createApp();
  const server = createServer(app);
  server.on('upgrade', proxy.upgrade);
  const port = Number(process.env.PORT ?? 5174);
  server.listen(port, () => console.log(JSON.stringify({ level: 'info', msg: 'RegLocation Teacher+Director запущен', port, upstream: process.env.API_UPSTREAM ?? 'http://localhost:8080' })));
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
