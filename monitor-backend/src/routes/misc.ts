import { Router } from 'express';
import type { AppContext } from '../context';
import { requireRole, resolveAnyRole } from '../auth/sessions';
import { ah, forbidden, notFound, unauthorized } from '../lib/errors';
import { publicStatus } from './auth';

export function monitorRouter(ctx: AppContext): Router {
  const r = Router();
  r.use(requireRole(ctx, 'RECEPTION'));
  r.get('/snapshot', ah(async (_req, res) => void res.set('Cache-Control', 'no-store').json(await ctx.live.snapshot())));
  return r;
}

export function publicRouter(ctx: AppContext): Router {
  const r = Router();
  r.get('/status', ah(async (_req, res) => void res.set('Cache-Control', 'no-store').json(await publicStatus(ctx))));
  // Логотип школы публичен (нужен на страницах входа). Личных данных не содержит.
  r.get(
    '/logo',
    ah(async (_req, res) => {
      const id = await ctx.settings.logoFileId();
      const f = id ? await ctx.storage.read(id) : null;
      if (!f) throw notFound('Логотип не загружен');
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
