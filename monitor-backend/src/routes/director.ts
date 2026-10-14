import { IMAGE_MIME, TIMETABLE_MIME } from '../ocr/formats';
import { Router, type Request } from 'express';
import { z } from 'zod';
import type { AssignmentMode, Prisma } from '@prisma/client';
import type { AppContext } from '../context';
import { requireRole, revokeUserSessions } from '../auth/sessions';
import { ah, badRequest, conflict, forbidden, notFound, parse } from '../lib/errors';
import { hashPassword, passwordProblems, verifyPassword } from '../lib/passwords';
import { generatePassword, generateUniqueLogin } from '../lib/credentials';
import { openPassword, sealPassword } from '../lib/vault';
import { audit } from '../lib/audit';
import { assertFileType, processAvatar, processLogo, uploader } from '../lib/upload';
import { localToUtc, parseHM, toLocal, formatHM, DAY_NAMES_RU } from '../lib/time';
import { detectStaffKind, normalizeClassList, teacherListItem, TeacherInputSchema, upsertClasses, upsertSubject } from '../domain/teachers';
import { getTimetable, roomOptions, roomRefs, saveTimetable, SaveTimetableSchema } from '../domain/timetables';
import { checkOut } from '../domain/attendance';
import { describePeriod, lessonEndMinutes, ScheduleSettingsSchema } from '../domain/schedule';
import { MonitorSettingsSchema } from '../domain/settings';
import { PasswordChangeSchema } from './teacher';

const ROOM_TYPES = [
  'CLASSROOM', 'RECEPTION', 'TEACHERS_ROOM', 'DIRECTOR_OFFICE', 'HEAD_TEACHER_OFFICE', 'ACCOUNTING', 'STAIRS', 'ELEVATOR',
  'CORRIDOR', 'GYM', 'LAB', 'CANTEEN', 'KITCHEN', 'STADIUM', 'OTHER',
] as const;

const fullName = (u: { lastName: string; firstName: string }) => `${u.lastName} ${u.firstName}`.trim();

export function directorRouter(ctx: AppContext): Router {
  const r = Router();
  r.use(requireRole(ctx, 'DIRECTOR'));
  const upload = uploader(ctx.config);
  const loginExists = async (login: string) => !!(await ctx.prisma.user.findUnique({ where: { login }, select: { id: true } }));

  const loadTeacher = async (id: string) => {
    const t = await ctx.prisma.teacher.findUnique({ where: { id }, include: { user: true } });
    if (!t) throw notFound('Учитель не найден');
    return t;
  };

  // ───────────────────────── Главная ─────────────────────────

  r.get(
    '/dashboard',
    ah(async (_req, res) => {
      const snap = await ctx.live.snapshot();
      const now = ctx.clock.now();
      const from = new Date(now.getTime() - 13 * 86400_000);
      const fromDate = toLocal(from).date;
      const [records, statusCounts, recentAudit] = await Promise.all([
        ctx.prisma.attendance.findMany({ where: { date: { gte: fromDate } }, select: { date: true, teacherId: true } }),
        ctx.prisma.user.groupBy({ by: ['status'], where: { role: 'TEACHER' }, _count: true }),
        ctx.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8 }),
      ]);
      const perDay = new Map<string, Set<string>>();
      for (const rec of records) {
        const s = perDay.get(rec.date) ?? new Set();
        s.add(rec.teacherId);
        perDay.set(rec.date, s);
      }
      const chart = Array.from({ length: 14 }, (_, i) => {
        const d = toLocal(new Date(from.getTime() + i * 86400_000));
        return { date: d.date, dayOfWeek: d.dayOfWeek, count: perDay.get(d.date)?.size ?? 0 };
      });
      const count = (s: string) => statusCounts.find((c) => c.status === s)?._count ?? 0;
      const occupancy = snap.buildings.map((b) => ({
        kind: b.kind,
        name: b.name,
        floors: b.floors.map((f) => ({ id: f.id, name: f.name, occupants: snap.teachers.filter((t) => t.present && t.location.floorId === f.id).length })),
        occupants: snap.teachers.filter((t) => t.present && t.location.buildingKind === b.kind).length,
      }));
      res.json({
        clock: snap.clock,
        period: snap.period,
        totals: { teachers: count('ACTIVE'), blocked: count('BLOCKED'), archived: count('ARCHIVED'), present: snap.presentCount, absent: snap.totalCount - snap.presentCount },
        currentLessons: snap.teachers
          .filter((t) => t.present && t.location.lessonNumber && t.location.className)
          .map((t) => ({ teacherId: t.id, name: `${t.lastName} ${t.firstName}`, subject: t.subject ?? t.positionTitle, className: t.location.className, room: t.location.roomName, reason: t.location.reason })),
        occupancy,
        chart,
        recentAudit,
        simulation: snap.simulation,
      });
    }),
  );

  r.get('/snapshot', ah(async (_req, res) => void res.set('Cache-Control', 'no-store').json(await ctx.live.snapshot())));

  // ───────────────────────── Учителя ─────────────────────────

  r.get('/subjects', ah(async (_req, res) => void res.json(await ctx.prisma.subject.findMany({ orderBy: { name: 'asc' } }))));
  r.get('/classes', ah(async (_req, res) => void res.json(await ctx.prisma.schoolClass.findMany({ orderBy: { name: 'asc' } }))));
  r.get('/rooms', ah(async (_req, res) => void res.json(await roomOptions(ctx))));

  r.get('/teachers', ah(async (_req, res) => void res.json(await teacherListItem(ctx))));

  r.get(
    '/teachers/:id',
    ah(async (req, res) => {
      const [item] = await teacherListItem(ctx, [String(req.params.id)]);
      if (!item) throw notFound('Учитель не найден');
      res.json({ ...item, timetableEntries: (await getTimetable(ctx, item.id))?.entries ?? [] });
    }),
  );

  r.post(
    '/teachers',
    ah(async (req, res) => {
      const data = parse(TeacherInputSchema, req.body);
      const classes = normalizeClassList(data.classes);
      const kind = data.kind ?? detectStaffKind(data.positionTitle);
      const login = await generateUniqueLogin(data.firstName, data.lastName, loginExists);
      const password = generatePassword();
      const passwordHash = await hashPassword(password);
      const teacher = await ctx.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({ data: { role: 'TEACHER', login, passwordHash, passwordEnc: sealPassword(ctx.config, password), firstName: data.firstName, lastName: data.lastName } });
        const subjectId = await upsertSubject(tx, data.subject ?? (kind === 'TEACHER' ? data.positionTitle : null));
        const classIds = await upsertClasses(tx, classes);
        return tx.teacher.create({
          data: { userId: user.id, kind, positionTitle: data.positionTitle, subjectId, classes: { create: classIds.map((classId) => ({ classId })) } },
        });
      });
      await audit(ctx, req, {
        action: 'teacher.created',
        summary: `Создан аккаунт: ${data.lastName} ${data.firstName} (${data.positionTitle}), логин ${login}`,
        targetType: 'teacher',
        targetId: teacher.id,
      });
      await ctx.live.changed({ staticData: true });
      ctx.live.emitToDirectors('directory:changed', { type: 'teacher' });
      const [item] = await teacherListItem(ctx, [teacher.id]);
      // Пароль возвращается только один раз — при создании.
      res.status(201).json({ teacher: item, credentials: { login, password } });
    }),
  );

  r.patch(
    '/teachers/:id',
    ah(async (req, res) => {
      const t = await loadTeacher(String(req.params.id));
      const data = parse(TeacherInputSchema.partial(), req.body);
      const classes = data.classes ? normalizeClassList(data.classes) : null;
      await ctx.prisma.$transaction(async (tx) => {
        if (data.firstName || data.lastName) {
          await tx.user.update({ where: { id: t.userId }, data: { firstName: data.firstName ?? undefined, lastName: data.lastName ?? undefined } });
        }
        const update: Prisma.TeacherUncheckedUpdateInput = {};
        if (data.positionTitle) update.positionTitle = data.positionTitle;
        if (data.kind) update.kind = data.kind;
        else if (data.positionTitle) update.kind = detectStaffKind(data.positionTitle);
        if (data.subject !== undefined) update.subjectId = await upsertSubject(tx, data.subject);
        await tx.teacher.update({ where: { id: t.id }, data: update });
        if (classes) {
          const ids = await upsertClasses(tx, classes);
          await tx.teacherClass.deleteMany({ where: { teacherId: t.id } });
          await tx.teacherClass.createMany({ data: ids.map((classId) => ({ teacherId: t.id, classId })) });
        }
      });
      await audit(ctx, req, { action: 'teacher.updated', summary: `Изменены данные учителя ${fullName(t.user)}`, targetType: 'teacher', targetId: t.id, details: data as Prisma.InputJsonValue });
      await ctx.live.changed({ staticData: true });
      const [item] = await teacherListItem(ctx, [t.id]);
      res.json(item);
    }),
  );

  const setStatus = (status: 'ACTIVE' | 'BLOCKED' | 'ARCHIVED', action: string, verb: string) =>
    ah(async (req: Request, res) => {
      const t = await loadTeacher(String(req.params.id));
      await ctx.prisma.user.update({ where: { id: t.userId }, data: { status, failedLogins: 0, lockedUntil: null } });
      if (status !== 'ACTIVE') {
        await revokeUserSessions(ctx, t.userId);
        await ctx.prisma.attendance.updateMany({ where: { teacherId: t.id, checkOutAt: null }, data: { checkOutAt: new Date(), checkOutReason: 'ADMIN' } });
      }
      await audit(ctx, req, { action, summary: `${verb}: ${fullName(t.user)}`, targetType: 'teacher', targetId: t.id });
      await ctx.live.changed({ staticData: true });
      const [item] = await teacherListItem(ctx, [t.id]);
      res.json(item);
    });

  r.post('/teachers/:id/block', setStatus('BLOCKED', 'teacher.blocked', 'Аккаунт заблокирован'));
  r.post('/teachers/:id/unblock', setStatus('ACTIVE', 'teacher.unblocked', 'Аккаунт разблокирован'));
  r.post('/teachers/:id/archive', setStatus('ARCHIVED', 'teacher.archived', 'Учитель перемещён в архив'));
  r.post('/teachers/:id/restore', setStatus('ACTIVE', 'teacher.restored', 'Учитель восстановлен из архива'));

  r.post(
    '/teachers/:id/reset-password',
    ah(async (req, res) => {
      const t = await loadTeacher(String(req.params.id));
      const password = generatePassword();
      await ctx.prisma.user.update({
        where: { id: t.userId },
        data: { passwordHash: await hashPassword(password), passwordEnc: sealPassword(ctx.config, password), failedLogins: 0, lockedUntil: null },
      });
      await revokeUserSessions(ctx, t.userId);
      await audit(ctx, req, { action: 'teacher.password_reset', summary: `Сброшен пароль: ${fullName(t.user)}`, targetType: 'teacher', targetId: t.id });
      res.json({ credentials: { login: t.user.login, password } });
    }),
  );

  // Логин и пароль учителя (пароль хранится зашифрованным; каждый просмотр — в журнале)
  r.get(
    '/teachers/:id/credentials',
    ah(async (req, res) => {
      const t = await loadTeacher(String(req.params.id));
      const password = openPassword(ctx.config, t.user.passwordEnc);
      await audit(ctx, req, { action: 'teacher.credentials_viewed', summary: `Просмотр логина и пароля: ${fullName(t.user)}`, targetType: 'teacher', targetId: t.id });
      res.set('Cache-Control', 'no-store').json({ login: t.user.login, password });
    }),
  );

  r.delete(
    '/teachers/:id',
    ah(async (req, res) => {
      const t = await loadTeacher(String(req.params.id));
      await revokeUserSessions(ctx, t.userId);
      const avatar = t.avatarFileId;
      await ctx.prisma.user.delete({ where: { id: t.userId } });
      if (avatar) await ctx.storage.remove(avatar);
      await audit(ctx, req, { action: 'teacher.deleted', summary: `Удалён учитель: ${fullName(t.user)} (${t.user.login})`, targetType: 'teacher', targetId: t.id });
      await ctx.live.changed({ staticData: true });
      res.json({ ok: true });
    }),
  );

  r.post(
    '/teachers/:id/avatar',
    upload.single('file'),
    ah(async (req, res) => {
      const t = await loadTeacher(String(req.params.id));
      assertFileType(req.file?.buffer, IMAGE_MIME);
      const file = await ctx.storage.save({ purpose: 'avatar', mimeType: 'image/webp', data: await processAvatar(req.file!.buffer), ownerUserId: t.userId });
      await ctx.prisma.teacher.update({ where: { id: t.id }, data: { avatarFileId: file.id } });
      if (t.avatarFileId) await ctx.storage.remove(t.avatarFileId);
      await audit(ctx, req, { action: 'teacher.avatar', summary: `Обновлена фотография: ${fullName(t.user)}`, targetType: 'teacher', targetId: t.id });
      await ctx.live.changed({ staticData: true });
      const [item] = await teacherListItem(ctx, [t.id]);
      res.json(item);
    }),
  );

  r.get(
    '/teachers/:id/attendance',
    ah(async (req, res) => {
      const t = await loadTeacher(String(req.params.id));
      const days = Math.min(365, Math.max(1, Number(req.query.days) || 60));
      const fromDate = toLocal(new Date(ctx.clock.now().getTime() - days * 86400_000)).date;
      const records = await ctx.prisma.attendance.findMany({ where: { teacherId: t.id, date: { gte: fromDate } }, orderBy: { checkInAt: 'desc' } });
      res.json({ teacher: { id: t.id, name: fullName(t.user) }, records });
    }),
  );

  // ───────────────────────── Расписания ─────────────────────────

  r.get(
    '/teachers/:id/timetable',
    ah(async (req, res) => {
      const t = await loadTeacher(String(req.params.id));
      const schedule = await ctx.settings.schedule();
      res.json({ timetable: await getTimetable(ctx, t.id), lessons: schedule.lessons, schoolDays: schedule.schoolDays, rooms: await roomOptions(ctx) });
    }),
  );

  r.put(
    '/teachers/:id/timetable',
    ah(async (req, res) => {
      const t = await loadTeacher(String(req.params.id));
      const body = parse(SaveTimetableSchema, req.body);
      await saveTimetable(ctx, t.id, body);
      await audit(ctx, req, { action: 'timetable.saved', summary: `Сохранено расписание: ${fullName(t.user)} (${body.entries.length} уроков)`, targetType: 'teacher', targetId: t.id });
      res.json({ timetable: await getTimetable(ctx, t.id) });
    }),
  );

  r.post(
    '/teachers/:id/timetable/recognize',
    upload.single('file'),
    ah(async (req, res) => {
      const t = await loadTeacher(String(req.params.id));
      const mime = assertFileType(req.file?.buffer, TIMETABLE_MIME);
      const file = await ctx.storage.save({ purpose: 'timetable-source', mimeType: mime, data: req.file!.buffer, ownerUserId: t.userId });
      const result = await ctx.ocr.recognize(req.file!.buffer, await roomRefs(ctx));
      res.json({ sourceFileId: file.id, result });
    }),
  );

  r.get(
    '/timetables',
    ah(async (_req, res) => {
      const list = await teacherListItem(ctx);
      res.json(list.filter((t) => t.status !== 'ARCHIVED'));
    }),
  );

  // ───────────────────────── Посещаемость ─────────────────────────

  r.get(
    '/attendance',
    ah(async (req, res) => {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date ?? '')) ? String(req.query.date) : toLocal(ctx.clock.now()).date;
      const [teachers, records] = await Promise.all([
        ctx.prisma.teacher.findMany({ where: { user: { status: { not: 'ARCHIVED' } } }, include: { user: true } }),
        ctx.prisma.attendance.findMany({ where: { date }, orderBy: { checkInAt: 'asc' } }),
      ]);
      const rows = teachers
        .map((t) => {
          const recs = records.filter((x) => x.teacherId === t.id);
          const minutes = recs.reduce((s, x) => s + ((x.checkOutAt ?? ctx.clock.now()).getTime() - x.checkInAt.getTime()) / 60000, 0);
          return {
            teacherId: t.id,
            name: fullName(t.user),
            positionTitle: t.positionTitle,
            avatarUrl: t.avatarFileId ? `/api/files/${t.avatarFileId}` : null,
            present: recs.some((x) => !x.checkOutAt),
            firstIn: recs[0]?.checkInAt ?? null,
            lastOut: recs.length && recs.every((x) => x.checkOutAt) ? recs[recs.length - 1]!.checkOutAt : null,
            lastReason: recs[recs.length - 1]?.checkOutReason ?? null,
            minutes: Math.round(minutes),
            records: recs,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
      res.json({ date, rows });
    }),
  );

  r.post(
    '/attendance/:teacherId/check-out',
    ah(async (req, res) => {
      const t = await loadTeacher(String(req.params.teacherId));
      await checkOut(ctx, t.id, 'ADMIN');
      await audit(ctx, req, { action: 'attendance.admin_checkout', summary: `Директор отметил «Не в школе»: ${fullName(t.user)}`, targetType: 'teacher', targetId: t.id });
      res.json({ ok: true });
    }),
  );

  // ───────────────────────── Ручные назначения (перемещение учителей) ─────────────────────────

  const AssignmentSchema = z.object({
    teacherId: z.string().uuid(),
    roomId: z.string().uuid(),
    mode: z.enum(['UNTIL_LESSON_END', 'UNTIL_TIME', 'UNTIL_CANCELLED']),
    /** Для UNTIL_TIME: «ЧЧ:ММ» сегодня или «ГГГГ-ММ-ДДTЧЧ:ММ» */
    until: z.string().optional(),
    note: z.string().trim().max(200).optional(),
  });

  const assignmentView = (a: Prisma.ManualAssignmentGetPayload<{ include: { teacher: { include: { user: true } }; room: true; createdBy: true; cancelledBy: true } }>) => ({
    id: a.id,
    teacherId: a.teacherId,
    teacherName: fullName(a.teacher.user),
    roomId: a.roomId,
    roomCode: a.room.code,
    roomName: a.room.name,
    mode: a.mode,
    startsAt: a.startsAt,
    endsAt: a.endsAt,
    note: a.note,
    createdBy: a.createdBy ? fullName(a.createdBy) : null,
    cancelledAt: a.cancelledAt,
    cancelledBy: a.cancelledBy ? fullName(a.cancelledBy) : null,
    active: !a.cancelledAt && (!a.endsAt || a.endsAt > ctx.clock.now()),
  });

  r.get(
    '/assignments',
    ah(async (req, res) => {
      const onlyActive = req.query.active === '1';
      const now = ctx.clock.now();
      const list = await ctx.prisma.manualAssignment.findMany({
        where: onlyActive ? { cancelledAt: null, OR: [{ endsAt: null }, { endsAt: { gt: now } }] } : undefined,
        include: { teacher: { include: { user: true } }, room: true, createdBy: true, cancelledBy: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      res.json(list.map(assignmentView));
    }),
  );

  r.post(
    '/assignments',
    ah(async (req, res) => {
      const body = parse(AssignmentSchema, req.body);
      const t = await loadTeacher(body.teacherId);
      if (t.user.status !== 'ACTIVE') throw badRequest('Аккаунт учителя неактивен');
      const room = await ctx.prisma.room.findUnique({ where: { id: body.roomId } });
      if (!room) throw notFound('Помещение не найдено');
      const now = ctx.clock.now();
      let endsAt: Date | null = null;
      if (body.mode === 'UNTIL_LESSON_END') {
        const eff = await ctx.settings.effectiveTime(now);
        const schedule = await ctx.settings.schedule();
        const delta = lessonEndMinutes(schedule, eff.dayOfWeek, eff.minutes) - eff.minutes;
        endsAt = new Date(now.getTime() + (delta > 0 ? delta * 60_000 - eff.seconds * 1000 : 45 * 60_000));
      } else if (body.mode === 'UNTIL_TIME') {
        if (!body.until) throw badRequest('Укажите время окончания');
        const local = toLocal(now);
        const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(body.until);
        endsAt = m ? localToUtc(m[1]!, parseHM(m[2]!)) : localToUtc(local.date, parseHM(body.until));
        if (endsAt <= now) throw badRequest('Время окончания должно быть в будущем');
      }
      const before = (await ctx.live.snapshot()).teachers.find((x) => x.id === t.id);
      const created = await ctx.prisma.$transaction(async (tx) => {
        await tx.manualAssignment.updateMany({
          where: { teacherId: t.id, cancelledAt: null, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
          data: { cancelledAt: now, cancelledById: req.auth!.user.id },
        });
        return tx.manualAssignment.create({
          data: { teacherId: t.id, roomId: room.id, mode: body.mode as AssignmentMode, startsAt: now, endsAt, note: body.note, createdById: req.auth!.user.id },
          include: { teacher: { include: { user: true } }, room: true, createdBy: true, cancelledBy: true },
        });
      });
      const durationText =
        body.mode === 'UNTIL_CANCELLED' ? 'до отмены' : `до ${formatHM(toLocal(endsAt!).minutes)}${body.mode === 'UNTIL_LESSON_END' ? ' (окончание урока)' : ''}`;
      await audit(ctx, req, {
        action: 'assignment.created',
        summary: `${fullName(t.user)}: ${before?.location.roomName ?? 'не на карте'} → ${room.name}, ${durationText}`,
        targetType: 'teacher',
        targetId: t.id,
        details: { from: before?.location.roomName ?? null, to: room.name, roomId: room.id, mode: body.mode, endsAt: endsAt?.toISOString() ?? null },
      });
      await ctx.live.changed();
      res.status(201).json(assignmentView(created));
    }),
  );

  r.post(
    '/assignments/:id/cancel',
    ah(async (req, res) => {
      const a = await ctx.prisma.manualAssignment.findUnique({ where: { id: String(req.params.id) }, include: { teacher: { include: { user: true } }, room: true } });
      if (!a) throw notFound();
      if (!a.cancelledAt) {
        await ctx.prisma.manualAssignment.update({ where: { id: a.id }, data: { cancelledAt: ctx.clock.now(), cancelledById: req.auth!.user.id } });
        await audit(ctx, req, { action: 'assignment.cancelled', summary: `${fullName(a.teacher.user)}: отменено назначение в «${a.room.name}», возврат к расписанию`, targetType: 'teacher', targetId: a.teacherId });
        await ctx.live.changed();
      }
      res.json({ ok: true });
    }),
  );

  r.post(
    '/teachers/:id/auto-location',
    ah(async (req, res) => {
      const t = await loadTeacher(String(req.params.id));
      const now = ctx.clock.now();
      const r2 = await ctx.prisma.manualAssignment.updateMany({
        where: { teacherId: t.id, cancelledAt: null, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        data: { cancelledAt: now, cancelledById: req.auth!.user.id },
      });
      if (r2.count) {
        await audit(ctx, req, { action: 'assignment.cancelled', summary: `${fullName(t.user)}: возврат к автоматическому определению по расписанию`, targetType: 'teacher', targetId: t.id });
        await ctx.live.changed();
      }
      res.json({ ok: true, cancelled: r2.count });
    }),
  );

  // ───────────────────────── Этажи и кабинеты ─────────────────────────

  r.get(
    '/buildings',
    ah(async (_req, res) => {
      const buildings = await ctx.prisma.building.findMany({
        orderBy: { kind: 'asc' },
        include: { floors: { orderBy: { sortOrder: 'asc' }, include: { rooms: { include: { layout: true, _count: { select: { entries: true } } }, orderBy: { code: 'asc' } } } } },
      });
      res.json(
        buildings.map((b) => ({
          id: b.id,
          kind: b.kind,
          name: b.name,
          floors: b.floors.map((f) => ({
            id: f.id,
            name: f.name,
            level: f.level,
            sortOrder: f.sortOrder,
            width: f.width,
            height: f.height,
            rooms: f.rooms.map((rm) => ({
              id: rm.id,
              code: rm.code,
              name: rm.name,
              type: rm.type,
              x: rm.layout?.x ?? 0,
              y: rm.layout?.y ?? 0,
              width: rm.layout?.width ?? 120,
              height: rm.layout?.height ?? 80,
              timetableUses: rm._count.entries,
            })),
          })),
        })),
      );
    }),
  );

  const structureChanged = async () => {
    await ctx.live.changed({ staticData: true });
    ctx.live.emitToDirectors('structure:changed', {});
  };

  r.post(
    '/floors',
    ah(async (req, res) => {
      const body = parse(
        z.object({
          buildingKind: z.enum(['SCHOOL', 'CANTEEN', 'STADIUM']).default('SCHOOL'),
          name: z.string().trim().min(1, 'Введите название этажа').max(40),
          level: z.number().int().min(-5).max(50),
          position: z.enum(['top', 'bottom']).default('top'),
        }),
        req.body,
      );
      const building = await ctx.prisma.building.findUnique({ where: { kind: body.buildingKind } });
      if (!building) throw notFound('Здание не найдено');
      const floor = await ctx.prisma.$transaction(async (tx) => {
        if (body.position === 'top') await tx.floor.updateMany({ where: { buildingId: building.id }, data: { sortOrder: { increment: 1 } } });
        const agg = await tx.floor.aggregate({ where: { buildingId: building.id }, _max: { sortOrder: true } });
        return tx.floor.create({ data: { buildingId: building.id, name: body.name, level: body.level, sortOrder: body.position === 'top' ? 0 : (agg._max.sortOrder ?? -1) + 1 } });
      });
      await audit(ctx, req, { action: 'floor.created', summary: `Добавлен этаж «${floor.name}» (${building.name})`, targetType: 'floor', targetId: floor.id });
      await structureChanged();
      res.status(201).json(floor);
    }),
  );

  r.patch(
    '/floors/:id',
    ah(async (req, res) => {
      const body = parse(
        z.object({
          name: z.string().trim().min(1).max(40).optional(),
          level: z.number().int().min(-5).max(50).optional(),
          width: z.number().int().min(300).max(4000).optional(),
          height: z.number().int().min(150).max(3000).optional(),
        }),
        req.body,
      );
      const before = await ctx.prisma.floor.findUnique({ where: { id: String(req.params.id) } });
      if (!before) throw notFound('Этаж не найден');
      const floor = await ctx.prisma.floor.update({ where: { id: before.id }, data: body });
      await audit(ctx, req, {
        action: 'floor.updated',
        summary: before.name !== floor.name ? `Этаж «${before.name}» переименован в «${floor.name}»` : `Изменены параметры этажа «${floor.name}»`,
        targetType: 'floor',
        targetId: floor.id,
      });
      await structureChanged();
      res.json(floor);
    }),
  );

  r.post(
    '/floors/reorder',
    ah(async (req, res) => {
      const { floorIds } = parse(z.object({ floorIds: z.array(z.string().uuid()).min(1).max(60) }), req.body);
      const floors = await ctx.prisma.floor.findMany({ where: { id: { in: floorIds } } });
      if (floors.length !== floorIds.length || new Set(floors.map((f) => f.buildingId)).size !== 1) throw badRequest('Некорректный список этажей');
      await ctx.prisma.$transaction(floorIds.map((id, i) => ctx.prisma.floor.update({ where: { id }, data: { sortOrder: i } })));
      await audit(ctx, req, { action: 'floor.reordered', summary: `Изменён порядок этажей: ${floorIds.map((id) => floors.find((f) => f.id === id)!.name).join(' → ')}` });
      await structureChanged();
      res.json({ ok: true });
    }),
  );

  r.delete(
    '/floors/:id',
    ah(async (req, res) => {
      const floor = await ctx.prisma.floor.findUnique({ where: { id: String(req.params.id) }, include: { rooms: { include: { _count: { select: { entries: true } } } } } });
      if (!floor) throw notFound('Этаж не найден');
      const uses = floor.rooms.reduce((s, rm) => s + rm._count.entries, 0);
      if (uses > 0 && req.query.force !== '1') throw conflict(`Кабинеты этажа используются в расписаниях (${uses} уроков). Подтвердите удаление.`);
      if (floor.rooms.some((rm) => ['CANTEEN', 'TEACHERS_ROOM', 'DIRECTOR_OFFICE', 'HEAD_TEACHER_OFFICE'].includes(rm.type)) && req.query.force !== '1') {
        throw conflict('На этаже есть служебные помещения (столовая, учительская, кабинет директора или завуча). Подтвердите удаление.');
      }
      await ctx.prisma.floor.delete({ where: { id: floor.id } });
      await audit(ctx, req, { action: 'floor.deleted', summary: `Удалён этаж «${floor.name}» (${floor.rooms.length} помещений)`, targetType: 'floor', targetId: floor.id });
      await structureChanged();
      res.json({ ok: true });
    }),
  );

  const RoomSchema = z.object({
    floorId: z.string().uuid(),
    code: z.string().trim().min(1, 'Укажите номер/код').max(24).regex(/^[\p{L}\d._-]+$/u, 'Код: буквы, цифры, точка, дефис'),
    name: z.string().trim().min(1, 'Введите название').max(60),
    type: z.enum(ROOM_TYPES).default('CLASSROOM'),
    x: z.number().int().min(0).max(4000).default(40),
    y: z.number().int().min(0).max(3000).default(40),
    width: z.number().int().min(30).max(4000).default(180),
    height: z.number().int().min(30).max(3000).default(120),
  });

  /** Новые/переименованные кабинеты автоматически привязываются к урокам с этим номером. */
  const relinkEntries = async (roomId: string, code: string) => {
    await ctx.prisma.timetableEntry.updateMany({ where: { roomId: null, roomLabel: code }, data: { roomId } });
  };

  r.post(
    '/rooms',
    ah(async (req, res) => {
      const body = parse(RoomSchema, req.body);
      if (await ctx.prisma.room.findUnique({ where: { code: body.code } })) throw conflict(`Помещение с кодом «${body.code}» уже существует`);
      const room = await ctx.prisma.room.create({
        data: { floorId: body.floorId, code: body.code, name: body.name, type: body.type, layout: { create: { x: body.x, y: body.y, width: body.width, height: body.height } } },
        include: { floor: true },
      });
      await relinkEntries(room.id, room.code);
      await audit(ctx, req, { action: 'room.created', summary: `Добавлено помещение «${room.name}» (${room.code}) — ${room.floor.name}`, targetType: 'room', targetId: room.id });
      await structureChanged();
      res.status(201).json(room);
    }),
  );

  r.patch(
    '/rooms/:id',
    ah(async (req, res) => {
      const body = parse(RoomSchema.partial(), req.body);
      const before = await ctx.prisma.room.findUnique({ where: { id: String(req.params.id) }, include: { layout: true } });
      if (!before) throw notFound('Помещение не найдено');
      if (body.code && body.code !== before.code && (await ctx.prisma.room.findUnique({ where: { code: body.code } }))) {
        throw conflict(`Помещение с кодом «${body.code}» уже существует`);
      }
      const { x, y, width, height, ...rest } = body;
      const room = await ctx.prisma.room.update({
        where: { id: before.id },
        data: {
          ...rest,
          ...(x !== undefined || y !== undefined || width !== undefined || height !== undefined
            ? {
                layout: {
                  upsert: {
                    create: { x: x ?? 0, y: y ?? 0, width: width ?? 180, height: height ?? 120 },
                    update: { x, y, width, height },
                  },
                },
              }
            : {}),
        },
      });
      if (body.code && body.code !== before.code) {
        await ctx.prisma.timetableEntry.updateMany({ where: { roomId: room.id }, data: { roomLabel: room.code } });
        await relinkEntries(room.id, room.code);
      }
      const changes: string[] = [];
      if (body.name && body.name !== before.name) changes.push(`название «${before.name}» → «${room.name}»`);
      if (body.code && body.code !== before.code) changes.push(`код ${before.code} → ${room.code}`);
      if (body.type && body.type !== before.type) changes.push(`тип ${before.type} → ${room.type}`);
      if (body.floorId && body.floorId !== before.floorId) changes.push('перенесено на другой этаж');
      if (x !== undefined || width !== undefined) changes.push('положение/размер');
      await audit(ctx, req, { action: 'room.updated', summary: `Помещение «${room.name}»: ${changes.join(', ') || 'изменено'}`, targetType: 'room', targetId: room.id });
      await structureChanged();
      res.json(room);
    }),
  );

  r.delete(
    '/rooms/:id',
    ah(async (req, res) => {
      const room = await ctx.prisma.room.findUnique({ where: { id: String(req.params.id) }, include: { _count: { select: { entries: true } } } });
      if (!room) throw notFound('Помещение не найдено');
      if (room._count.entries > 0 && req.query.force !== '1') {
        throw conflict(`Кабинет ${room.code} указан в расписаниях (${room._count.entries} уроков). Подтвердите удаление.`);
      }
      await ctx.prisma.room.delete({ where: { id: room.id } });
      await audit(ctx, req, { action: 'room.deleted', summary: `Удалено помещение «${room.name}» (${room.code})`, targetType: 'room', targetId: room.id });
      await structureChanged();
      res.json({ ok: true });
    }),
  );

  r.put(
    '/floors/:id/layout',
    ah(async (req, res) => {
      const body = parse(
        z.object({
          width: z.number().int().min(300).max(4000).optional(),
          height: z.number().int().min(150).max(3000).optional(),
          rooms: z
            .array(
              z.object({
                id: z.string().uuid(),
                x: z.number().int().min(0).max(4000),
                y: z.number().int().min(0).max(3000),
                width: z.number().int().min(20).max(4000),
                height: z.number().int().min(20).max(3000),
                name: z.string().trim().min(1).max(60).optional(),
              }),
            )
            .max(200),
        }),
        req.body,
      );
      const floor = await ctx.prisma.floor.findUnique({ where: { id: String(req.params.id) }, include: { rooms: { select: { id: true } } } });
      if (!floor) throw notFound('Этаж не найден');
      const own = new Set(floor.rooms.map((x) => x.id));
      if (body.rooms.some((rm) => !own.has(rm.id))) throw forbidden('Помещение не принадлежит этому этажу');
      await ctx.prisma.$transaction([
        ...(body.width || body.height ? [ctx.prisma.floor.update({ where: { id: floor.id }, data: { width: body.width, height: body.height } })] : []),
        ...body.rooms.map((rm) =>
          ctx.prisma.room.update({
            where: { id: rm.id },
            data: {
              name: rm.name,
              layout: { upsert: { create: { x: rm.x, y: rm.y, width: rm.width, height: rm.height }, update: { x: rm.x, y: rm.y, width: rm.width, height: rm.height } } },
            },
          }),
        ),
      ]);
      await audit(ctx, req, { action: 'floor.layout_saved', summary: `Сохранена планировка: ${floor.name} (${body.rooms.length} помещений)`, targetType: 'floor', targetId: floor.id });
      await structureChanged();
      res.json({ ok: true });
    }),
  );

  // ───────────────────────── Доступ к монитору (ресепшен) ─────────────────────────

  const receptionView = async () => {
    const list = await ctx.prisma.receptionAccount.findMany({ include: { user: { include: { _count: { select: { sessions: true } } } } }, orderBy: { createdAt: 'asc' } });
    return list.map((a) => ({
      id: a.id,
      userId: a.userId,
      label: a.label,
      login: a.user.login,
      status: a.user.status,
      lastLoginAt: a.user.lastLoginAt,
      activeSessions: a.user._count.sessions,
      createdAt: a.createdAt,
    }));
  };
  const loadReception = async (id: string) => {
    const a = await ctx.prisma.receptionAccount.findUnique({ where: { id }, include: { user: true } });
    if (!a) throw notFound('Аккаунт монитора не найден');
    return a;
  };

  r.get('/reception', ah(async (_req, res) => void res.json(await receptionView())));

  r.post(
    '/reception',
    ah(async (req, res) => {
      const { label } = parse(z.object({ label: z.string().trim().min(1, 'Укажите название (например, «Ресепшен 1 этаж»)').max(60) }), req.body);
      const login = await generateUniqueLogin('', label, loginExists, 'mon.');
      const password = generatePassword();
      const user = await ctx.prisma.user.create({
        data: { role: 'RECEPTION', login, passwordHash: await hashPassword(password), passwordEnc: sealPassword(ctx.config, password), firstName: label, lastName: 'Монитор', receptionAccount: { create: { label } } },
      });
      await audit(ctx, req, { action: 'reception.created', summary: `Создан доступ к монитору «${label}», логин ${login}`, targetType: 'user', targetId: user.id });
      res.status(201).json({ account: (await receptionView()).find((a) => a.userId === user.id), credentials: { login, password } });
    }),
  );

  r.post(
    '/reception/:id/reset-password',
    ah(async (req, res) => {
      const a = await loadReception(String(req.params.id));
      const password = generatePassword();
      await ctx.prisma.user.update({
        where: { id: a.userId },
        data: { passwordHash: await hashPassword(password), passwordEnc: sealPassword(ctx.config, password), failedLogins: 0, lockedUntil: null },
      });
      await revokeUserSessions(ctx, a.userId);
      await audit(ctx, req, { action: 'reception.password_reset', summary: `Сброшен пароль монитора «${a.label}»`, targetType: 'user', targetId: a.userId });
      res.json({ credentials: { login: a.user.login, password } });
    }),
  );

  r.get(
    '/reception/:id/credentials',
    ah(async (req, res) => {
      const a = await loadReception(String(req.params.id));
      const password = openPassword(ctx.config, a.user.passwordEnc);
      await audit(ctx, req, { action: 'reception.credentials_viewed', summary: `Просмотр логина и пароля монитора «${a.label}»`, targetType: 'user', targetId: a.userId });
      res.set('Cache-Control', 'no-store').json({ login: a.user.login, password });
    }),
  );

  for (const [path, status, verb] of [
    ['block', 'BLOCKED', 'заблокирован'],
    ['unblock', 'ACTIVE', 'разблокирован'],
  ] as const) {
    r.post(
      `/reception/:id/${path}`,
      ah(async (req, res) => {
        const a = await loadReception(String(req.params.id));
        await ctx.prisma.user.update({ where: { id: a.userId }, data: { status } });
        if (status === 'BLOCKED') await revokeUserSessions(ctx, a.userId);
        await audit(ctx, req, { action: `reception.${path}`, summary: `Доступ к монитору «${a.label}» ${verb}`, targetType: 'user', targetId: a.userId });
        res.json(await receptionView());
      }),
    );
  }

  r.post(
    '/reception/:id/revoke-sessions',
    ah(async (req, res) => {
      const a = await loadReception(String(req.params.id));
      const n = await revokeUserSessions(ctx, a.userId);
      await audit(ctx, req, { action: 'reception.sessions_revoked', summary: `Завершены сеансы монитора «${a.label}»: ${n}`, targetType: 'user', targetId: a.userId });
      res.json({ revoked: n });
    }),
  );

  r.delete(
    '/reception/:id',
    ah(async (req, res) => {
      const a = await loadReception(String(req.params.id));
      await revokeUserSessions(ctx, a.userId);
      await ctx.prisma.user.delete({ where: { id: a.userId } });
      await audit(ctx, req, { action: 'reception.deleted', summary: `Удалён доступ к монитору «${a.label}»`, targetType: 'user', targetId: a.userId });
      res.json({ ok: true });
    }),
  );

  // ───────────────────────── Журнал изменений ─────────────────────────

  r.get(
    '/audit',
    ah(async (req, res) => {
      const q = String(req.query.q ?? '').trim();
      const action = String(req.query.action ?? '').trim();
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
      const cursor = req.query.cursor ? String(req.query.cursor) : undefined;
      const where: Prisma.AuditLogWhereInput = {
        ...(action ? { action: { startsWith: action } } : {}),
        ...(q ? { OR: [{ summary: { contains: q, mode: 'insensitive' } }, { actorName: { contains: q, mode: 'insensitive' } }] } : {}),
      };
      const rows = await ctx.prisma.auditLog.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
      res.json({ rows: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1]!.id : null });
    }),
  );

  // ───────────────────────── Настройки ─────────────────────────

  r.get(
    '/settings',
    ah(async (req, res) => {
      const logo = await ctx.settings.logoFileId();
      const director = await ctx.prisma.director.findUnique({ where: { userId: req.auth!.user.id } });
      res.json({
        schedule: await ctx.settings.schedule(),
        monitor: await ctx.settings.monitor(),
        logoUrl: logo ? `/api/public/logo?v=${logo.slice(0, 8)}` : null,
        me: { login: req.auth!.user.login, email: req.auth!.user.email, firstName: req.auth!.user.firstName, lastName: req.auth!.user.lastName, isOwner: director?.isOwner ?? false },
        system: { mailConfigured: ctx.mailer.configured, storage: ctx.config.STORAGE_DRIVER, timezone: 'Asia/Tashkent', ocrLangs: ctx.config.OCR_LANGS },
      });
    }),
  );

  r.put(
    '/settings/schedule',
    ah(async (req, res) => {
      const s = parse(ScheduleSettingsSchema, req.body);
      s.lessons.sort((a, b) => a.number - b.number);
      await ctx.settings.setSchedule(s);
      await audit(ctx, req, {
        action: 'settings.schedule',
        summary: `Изменено расписание звонков: ${s.lessons.map((l) => `${l.number}) ${l.start}–${l.end}`).join(', ')}; учебный день ${s.startOfDay}–${s.endOfDay}`,
        details: s as unknown as Prisma.InputJsonValue,
      });
      await ctx.live.changed({ staticData: true });
      res.json(s);
    }),
  );

  r.put(
    '/settings/monitor',
    ah(async (req, res) => {
      const s = parse(MonitorSettingsSchema, req.body);
      await ctx.settings.setMonitor(s);
      await audit(ctx, req, { action: 'settings.monitor', summary: 'Изменены настройки отображения монитора', details: s as Prisma.InputJsonValue });
      await ctx.live.changed();
      res.json(s);
    }),
  );

  r.post(
    '/settings/logo',
    upload.single('file'),
    ah(async (req, res) => {
      assertFileType(req.file?.buffer, IMAGE_MIME);
      const file = await ctx.storage.save({ purpose: 'logo', mimeType: 'image/png', data: await processLogo(req.file!.buffer), ownerUserId: req.auth!.user.id });
      const old = await ctx.settings.logoFileId();
      await ctx.settings.setLogoFileId(file.id);
      if (old) await ctx.storage.remove(old);
      await audit(ctx, req, { action: 'settings.logo', summary: 'Загружен логотип школы' });
      await ctx.live.changed();
      ctx.io?.emit('branding:changed', { logoUrl: `/api/public/logo?v=${file.id.slice(0, 8)}` });
      res.json({ logoUrl: `/api/public/logo?v=${file.id.slice(0, 8)}` });
    }),
  );

  r.delete(
    '/settings/logo',
    ah(async (req, res) => {
      const old = await ctx.settings.logoFileId();
      await ctx.settings.setLogoFileId(null);
      if (old) await ctx.storage.remove(old);
      await audit(ctx, req, { action: 'settings.logo', summary: 'Логотип школы удалён (используется стандартный)' });
      ctx.io?.emit('branding:changed', { logoUrl: null });
      res.json({ logoUrl: null });
    }),
  );

  r.patch(
    '/password',
    ah(async (req, res) => {
      const body = parse(PasswordChangeSchema, req.body);
      const user = req.auth!.user;
      if (!(await verifyPassword(user.passwordHash, body.currentPassword))) throw badRequest('Текущий пароль указан неверно');
      const problem = passwordProblems(body.newPassword);
      if (problem) throw badRequest(problem);
      await ctx.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.newPassword) } });
      const n = await revokeUserSessions(ctx, user.id, req.auth!.session.id);
      await audit(ctx, req, { action: 'director.password_changed', summary: `Директор сменил пароль (завершено других сеансов: ${n})`, targetType: 'user', targetId: user.id });
      res.json({ ok: true });
    }),
  );

  // ───────────────────────── Тестовый режим ─────────────────────────

  r.get(
    '/simulation',
    ah(async (_req, res) => {
      const sim = await ctx.settings.simulation();
      const eff = await ctx.settings.effectiveTime(ctx.clock.now());
      const schedule = await ctx.settings.schedule();
      res.json({ simulation: sim, clock: eff, period: describePeriod(schedule, eff.dayOfWeek, eff.minutes) });
    }),
  );

  r.post(
    '/simulation',
    ah(async (req, res) => {
      const body = parse(
        z.object({
          dayOfWeek: z.number().int().min(1).max(7),
          hours: z.number().int().min(0).max(23),
          minutes: z.number().int().min(0).max(59),
          assumeAllPresent: z.boolean().default(true),
        }),
        req.body,
      );
      await ctx.settings.setSimulation({
        enabled: true,
        dayOfWeek: body.dayOfWeek,
        minutes: body.hours * 60 + body.minutes,
        startedAt: ctx.clock.now().toISOString(),
        assumeAllPresent: body.assumeAllPresent,
        startedBy: req.auth!.user.id,
      });
      await audit(ctx, req, {
        action: 'simulation.started',
        summary: `Тестовый режим: ${DAY_NAMES_RU[body.dayOfWeek]}, ${formatHM(body.hours * 60 + body.minutes)}${body.assumeAllPresent ? ', все учителя считаются присутствующими' : ''}`,
      });
      await ctx.live.changed();
      res.json({ ok: true });
    }),
  );

  r.delete(
    '/simulation',
    ah(async (req, res) => {
      await ctx.settings.setSimulation(null);
      await audit(ctx, req, { action: 'simulation.stopped', summary: 'Возврат к реальному времени' });
      await ctx.live.changed();
      res.json({ ok: true });
    }),
  );

  return r;
}
