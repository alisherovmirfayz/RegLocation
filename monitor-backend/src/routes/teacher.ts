import { IMAGE_MIME, TIMETABLE_MIME } from '../ocr/formats';
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context';
import { requireRole } from '../auth/sessions';
import { ah, forbidden, notFound, parse } from '../lib/errors';
import { assertFileType, processAvatar, uploader } from '../lib/upload';
import { checkIn, checkOut } from '../domain/attendance';
import { getTimetable, roomOptions, roomRefs, saveTimetable, SaveTimetableSchema } from '../domain/timetables';

export const PasswordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Введите текущий пароль').max(256),
  newPassword: z.string().max(128),
});

export function teacherRouter(ctx: AppContext): Router {
  const r = Router();
  r.use(requireRole(ctx, 'TEACHER'));
  const upload = uploader(ctx.config);

  const teacherId = async (userId: string) => {
    const t = await ctx.prisma.teacher.findUnique({ where: { userId }, select: { id: true, avatarFileId: true } });
    if (!t) throw notFound('Профиль учителя не найден');
    return t;
  };

  r.get(
    '/state',
    ah(async (req, res) => {
      const t = await teacherId(req.auth!.user.id);
      res.set('Cache-Control', 'no-store').json(await ctx.live.teacherState(t.id));
    }),
  );

  r.post(
    '/check-in',
    ah(async (req, res) => {
      const t = await teacherId(req.auth!.user.id);
      await checkIn(ctx, t.id);
      res.json(await ctx.live.teacherState(t.id));
    }),
  );

  r.post(
    '/check-out',
    ah(async (req, res) => {
      const t = await teacherId(req.auth!.user.id);
      await checkOut(ctx, t.id, 'MANUAL');
      res.json(await ctx.live.teacherState(t.id));
    }),
  );

  // Учитель не может менять пароль сам — только директор (сброс в разделе «Учителя»).
  r.patch('/password', () => {
    throw forbidden('Пароль учителя может изменить только директор');
  });

  r.post(
    '/avatar',
    upload.single('file'),
    ah(async (req, res) => {
      const t = await teacherId(req.auth!.user.id);
      assertFileType(req.file?.buffer, IMAGE_MIME);
      const data = await processAvatar(req.file!.buffer);
      const file = await ctx.storage.save({ purpose: 'avatar', mimeType: 'image/webp', data, ownerUserId: req.auth!.user.id });
      await ctx.prisma.teacher.update({ where: { id: t.id }, data: { avatarFileId: file.id } });
      if (t.avatarFileId) await ctx.storage.remove(t.avatarFileId);
      await ctx.live.changed({ staticData: true });
      res.json(await ctx.live.teacherState(t.id));
    }),
  );

  r.delete(
    '/avatar',
    ah(async (req, res) => {
      const t = await teacherId(req.auth!.user.id);
      if (t.avatarFileId) {
        await ctx.prisma.teacher.update({ where: { id: t.id }, data: { avatarFileId: null } });
        await ctx.storage.remove(t.avatarFileId);
        await ctx.live.changed({ staticData: true });
      }
      res.json(await ctx.live.teacherState(t.id));
    }),
  );

  r.get(
    '/timetable',
    ah(async (req, res) => {
      const t = await teacherId(req.auth!.user.id);
      const schedule = await ctx.settings.schedule();
      res.json({ timetable: await getTimetable(ctx, t.id), lessons: schedule.lessons, schoolDays: schedule.schoolDays, rooms: await roomOptions(ctx) });
    }),
  );

  r.post(
    '/timetable/recognize',
    upload.single('file'),
    ah(async (req, res) => {
      await teacherId(req.auth!.user.id);
      const mime = assertFileType(req.file?.buffer, TIMETABLE_MIME);
      const file = await ctx.storage.save({ purpose: 'timetable-source', mimeType: mime, data: req.file!.buffer, ownerUserId: req.auth!.user.id });
      const result = await ctx.ocr.recognize(req.file!.buffer, await roomRefs(ctx));
      res.json({ sourceFileId: file.id, result });
    }),
  );

  r.put(
    '/timetable',
    ah(async (req, res) => {
      const t = await teacherId(req.auth!.user.id);
      const body = parse(SaveTimetableSchema, req.body);
      if (body.sourceFileId) {
        const f = await ctx.prisma.storedFile.findUnique({ where: { id: body.sourceFileId }, select: { ownerUserId: true } });
        if (!f || f.ownerUserId !== req.auth!.user.id) body.sourceFileId = null;
      }
      await saveTimetable(ctx, t.id, body);
      res.json({ timetable: await getTimetable(ctx, t.id), state: await ctx.live.teacherState(t.id) });
    }),
  );

  return r;
}
