import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { AppContext } from '../context';
import { badRequest, notFound } from '../lib/errors';
import { normalizeClass, normalizeRoom, splitClasses, type RoomRef } from '../ocr/normalize';
import { upsertClasses } from './teachers';

export const EntryInputSchema = z.object({
  dayOfWeek: z.number().int().min(1).max(6),
  lessonNumber: z.number().int().min(1).max(15),
  className: z.string().trim().min(1, 'Укажите класс').max(40),
  roomLabel: z.string().trim().min(1, 'Укажите кабинет').max(40),
  roomId: z.string().uuid().optional().nullable(),
});

export const SaveTimetableSchema = z.object({
  entries: z.array(EntryInputSchema).max(15 * 6),
  sourceFileId: z.string().uuid().optional().nullable(),
  ocrReport: z.record(z.unknown()).optional().nullable(),
});


/** Один класс («10A») или несколько через запятую («3A, 3B»); каждый проверяется отдельно. */
export function normalizeClassList(raw: string): { value: string; valid: boolean } {
  const parts = splitClasses(raw).map((p) => normalizeClass(p));
  if (!parts.length || parts.some((p) => !p.valid)) return { value: raw.trim(), valid: false };
  return { value: [...new Set(parts.map((p) => p.value))].join(', '), valid: true };
}

export async function roomRefs(ctx: AppContext): Promise<RoomRef[]> {
  return ctx.prisma.room.findMany({ select: { id: true, code: true, name: true } });
}

/** Список помещений для выбора в расписании и при назначениях. */
export async function roomOptions(ctx: AppContext) {
  const rooms = await ctx.prisma.room.findMany({
    where: { type: { notIn: ['STAIRS', 'ELEVATOR', 'CORRIDOR'] } },
    include: { floor: { include: { building: true } } },
  });
  return rooms
    .map((r) => ({ id: r.id, code: r.code, name: r.name, type: r.type, floor: r.floor.name, building: r.floor.building.kind, sortOrder: r.floor.sortOrder }))
    .sort((a, b) => (a.building === b.building ? a.sortOrder - b.sortOrder || a.code.localeCompare(b.code, 'ru', { numeric: true }) : a.building === 'SCHOOL' ? -1 : 1));
}

export async function getTimetable(ctx: AppContext, teacherId: string) {
  const tt = await ctx.prisma.timetable.findFirst({
    where: { teacherId, status: 'ACTIVE' },
    include: { entries: { orderBy: [{ dayOfWeek: 'asc' }, { lessonNumber: 'asc' }] } },
  });
  return tt
    ? {
        id: tt.id,
        confirmedAt: tt.confirmedAt,
        sourceFileId: tt.sourceFileId,
        entries: tt.entries.map((e) => ({ dayOfWeek: e.dayOfWeek, lessonNumber: e.lessonNumber, className: e.className, roomLabel: e.roomLabel, roomId: e.roomId })),
      }
    : null;
}

/**
 * Сохраняет подтверждённое расписание: проверяет классы и кабинеты по базе помещений,
 * архивирует прежнее расписание (история сохраняется) и активирует новое.
 */
export async function saveTimetable(ctx: AppContext, teacherId: string, input: z.infer<typeof SaveTimetableSchema>) {
  const teacher = await ctx.prisma.teacher.findUnique({ where: { id: teacherId } });
  if (!teacher) throw notFound('Учитель не найден');
  const schedule = await ctx.settings.schedule();
  const lessonNumbers = new Set(schedule.lessons.map((l) => l.number));
  const rooms = await roomRefs(ctx);
  const errors: string[] = [];
  const seen = new Set<string>();
  const prepared = input.entries.map((e, i) => {
    const key = `${e.dayOfWeek}:${e.lessonNumber}`;
    if (seen.has(key)) errors.push(`Строка ${i + 1}: урок ${e.lessonNumber} в этот день указан дважды`);
    seen.add(key);
    if (!lessonNumbers.has(e.lessonNumber)) errors.push(`Строка ${i + 1}: урока №${e.lessonNumber} нет в расписании звонков`);
    if (!schedule.schoolDays.includes(e.dayOfWeek)) errors.push(`Строка ${i + 1}: день ${e.dayOfWeek} не является учебным`);
    const cls = normalizeClassList(e.className);
    if (!cls.valid) errors.push(`Строка ${i + 1}: некорректный класс «${e.className}»`);
    let roomId: string | null = null;
    let roomLabel = e.roomLabel;
    if (e.roomId) {
      const r = rooms.find((x) => x.id === e.roomId);
      if (r) {
        roomId = r.id;
        roomLabel = r.code;
      }
    }
    if (!roomId) {
      const rn = normalizeRoom(e.roomLabel, rooms);
      if (rn.roomId) {
        roomId = rn.roomId;
        roomLabel = rn.value;
      } else errors.push(`Строка ${i + 1}: кабинет «${e.roomLabel}» не найден в базе помещений`);
    }
    return { dayOfWeek: e.dayOfWeek, lessonNumber: e.lessonNumber, className: cls.value, roomId, roomLabel };
  });
  if (errors.length) throw badRequest(errors[0]!, errors);

  const result = await ctx.prisma.$transaction(async (tx) => {
    const classIds = await upsertClasses(tx, [...new Set(prepared.flatMap((p) => splitClasses(p.className)))]);
    const classByName = new Map<string, string>();
    const classes = await tx.schoolClass.findMany({ where: { id: { in: classIds } } });
    for (const c of classes) classByName.set(c.name, c.id);
    await tx.timetable.updateMany({ where: { teacherId, status: { in: ['ACTIVE', 'DRAFT'] } }, data: { status: 'ARCHIVED' } });
    return tx.timetable.create({
      data: {
        teacherId,
        status: 'ACTIVE',
        sourceFileId: input.sourceFileId ?? null,
        ocrReport: (input.ocrReport ?? undefined) as Prisma.InputJsonValue | undefined,
        confirmedAt: new Date(),
        entries: { create: prepared.map((p) => ({ ...p, classId: classByName.get(splitClasses(p.className)[0]!) ?? null })) },
      },
      include: { entries: true },
    });
  });
  await ctx.live.changed({ staticData: true });
  return result;
}
