import { Router } from 'express';
import type { AppContext, Role } from '../context';
import { readToken, requireRole, resolveAnyRole, resolveSession } from '../auth/sessions';
import { ah, badRequest, forbidden, notFound, unauthorized } from '../lib/errors';
import { sha256, safeEqual } from '../lib/credentials';
import { publicStatus } from './auth';

const POLL_ROLE: Record<string, Role> = { monitor: 'RECEPTION', director: 'DIRECTOR', teacher: 'TEACHER' };

/**
 * Обновления опросом — для хостинга без постоянных соединений (Vercel).
 * Каждая роль получает ровно то же, что и через Socket.IO: монитор и директор — полный снимок,
 * директор — ещё новые записи журнала и версию данных, учитель — только своё состояние.
 * Если состояние не изменилось (тот же hash), тело снимка не передаётся.
 */
export function realtimeRouter(ctx: AppContext): Router {
  const r = Router();
  r.get(
    '/poll',
    ah(async (req, res) => {
      const role = POLL_ROLE[String(req.query.role ?? '')];
      if (!role) throw badRequest('Неизвестная роль');
      const auth = await resolveSession(ctx, readToken(ctx, req.headers.cookie, role), role);
      if (!auth) throw unauthorized();
      const known = String(req.query.hash ?? '');
      res.set('Cache-Control', 'no-store');

      if (role === 'TEACHER') {
        const t = await ctx.prisma.teacher.findUnique({ where: { userId: auth.user.id }, select: { id: true } });
        if (!t) throw unauthorized();
        const state = await ctx.live.teacherState(t.id);
        const hash = sha256(JSON.stringify({ ...state, clock: state ? { ...state.clock, serverTime: '' } : null })).slice(0, 16);
        return void res.json({ hash, state: hash === known ? null : state });
      }

      const snap = await ctx.live.snapshot();
      const out: Record<string, unknown> = { hash: snap.hash, state: snap.hash === known ? null : snap };
      if (role === 'DIRECTOR') {
        const sys = await ctx.prisma.systemState.findUnique({ where: { id: 1 }, select: { dataVersion: true } });
        out.version = sys?.dataVersion ?? 0;
        const after = typeof req.query.after === 'string' && !Number.isNaN(Date.parse(req.query.after)) ? new Date(req.query.after) : null;
        if (after) {
          out.audits = await ctx.prisma.auditLog.findMany({ where: { createdAt: { gt: after } }, orderBy: { createdAt: 'asc' }, take: 20 });
        }
        const last = await ctx.prisma.auditLog.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
        out.auditCursor = (last?.createdAt ?? new Date(0)).toISOString();
      }
      res.json(out);
    }),
  );
  return r;
}

/**
 * Ежедневная задача для Vercel Cron (на бесплатном тарифе — раз в сутки):
 * страховка автоматического выхода в конце дня. Защищена секретом CRON_SECRET.
 */
export function cronRouter(ctx: AppContext): Router {
  const r = Router();
  r.get(
    '/daily',
    ah(async (req, res) => {
      const secret = ctx.config.CRON_SECRET;
      const header = req.get('authorization') ?? '';
      if (!secret || !safeEqual(header, `Bearer ${secret}`)) throw unauthorized('Нет доступа');
      await ctx.live.maintain(true);
      res.json({ ok: true });
    }),
  );
  return r;
}

export function monitorRouter(ctx: AppContext): Router {
  const r = Router();
  r.use(requireRole(ctx, 'RECEPTION'));
  r.get('/snapshot', ah(async (_req, res) => void res.set('Cache-Control', 'no-store').json(await ctx.live.snapshot())));
  return r;
}

export function publicRouter(ctx: AppContext): Router {
  const r = Router();
  r.get('/status', ah(async (_req, res) => void res.set('Cache-Control', 'no-store').json(await publicStatus(ctx))));
  // Как страницам получать обновления: Socket.IO или опрос (Vercel), и допустимый размер загрузки
  r.get('/runtime', (_req, res) =>
    void res.set('Cache-Control', 'no-store').json({ realtime: ctx.config.REALTIME, maxUploadMb: ctx.config.MAX_UPLOAD_MB, teacherUrl: `${ctx.config.PUBLIC_APP_URL.replace(/\/+$/, '')}/teacher` }),
  );
  // Логотип школы публичен (нужен на страницах входа). Личных данных не содержит.
  r.get(
    '/logo',
    ah(async (_req, res) => {
      const id = await ctx.settings.logoFileId();
      const f = id ? await ctx.storage.read(id) : null;
      // Свой логотип не загружен — стандартный из сборки (без ошибки 404 в консоли браузера)
      if (!f) return void res.set('Cache-Control', 'public, max-age=60').redirect(302, '/brand/logo.jpg');
      res.set({ 'Content-Type': f.file.mimeType, 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' }).send(f.data);
    }),
  );
  return r;
}

/** Выдача файлов только авторизованным пользователям с проверкой прав. */
export function filesRouter(ctx: AppContext): Router {
  const r = Router();
  r.get(
    '/:id',
    ah(async (req, res) => {
      const auth = await resolveAnyRole(ctx, req, ['DIRECTOR', 'RECEPTION', 'TEACHER']);
      if (!auth) throw unauthorized();
      const id = String(req.params.id);
      if (!/^[0-9a-f-]{36}$/.test(id)) throw notFound();
      const meta = await ctx.prisma.storedFile.findUnique({ where: { id }, select: { purpose: true, ownerUserId: true } });
      if (!meta) throw notFound();
      if (auth.role === 'RECEPTION' && meta.purpose !== 'avatar') throw forbidden();
      if (auth.role === 'TEACHER' && meta.ownerUserId !== auth.user.id) throw forbidden();
      const f = await ctx.storage.read(id);
      if (!f) throw notFound();
      res.set({
        'Content-Type': f.file.mimeType,
        'Cache-Control': 'private, max-age=86400, immutable',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': f.file.mimeType === 'application/pdf' ? 'attachment; filename="timetable.pdf"' : 'inline',
      });
      res.send(f.data);
    }),
  );
  return r;
}
