import type { Prisma, StaffKind } from '@prisma/client';
import { splitClasses } from '../ocr/normalize';
import { z } from 'zod';
import type { AppContext } from '../context';
import { normalizeClass } from '../ocr/normalize';
import { badRequest } from '../lib/errors';
import { avatarUrl, compareClasses } from './live';
import { toLocal } from '../lib/time';

/** Определяет тип сотрудника по должности: «Директор» → кабинет директора, «Завуч» → кабинет завуча. */
export function detectStaffKind(positionTitle: string): StaffKind {
  const t = positionTitle.toLowerCase();
  if (/завуч|zavuch|заместитель директора|замдиректора|o[ʻ']?quv ishlari/.test(t)) return 'HEAD_TEACHER';
  return 'TEACHER';
}

export const TeacherInputSchema = z.object({
  firstName: z.string().trim().min(1, 'Введите имя').max(60),
  lastName: z.string().trim().min(1, 'Введите фамилию').max(60),
  positionTitle: z.string().trim().min(1, 'Укажите предмет или должность').max(80),
  // Роль «директор» учителям не назначается: директор — отдельный аккаунт
  kind: z.enum(['TEACHER', 'HEAD_TEACHER']).optional(),
  subject: z.string().trim().max(80).optional().nullable(),
  classes: z.array(z.string().trim().max(10)).max(60).default([]),
});

export function normalizeClassList(list: string[]): string[] {
  const out = new Set<string>();
  for (const raw of list.flatMap((s) => s.split(/[,;\s]+/)).filter(Boolean)) {
    const n = normalizeClass(raw);
    if (!n.valid) throw badRequest(`Некорректный класс: «${raw}». Пример: 1B, 10A, 0A`);
    out.add(n.value);
  }
  return [...out].sort(compareClasses);
}

export async function upsertClasses(tx: Prisma.TransactionClient, names: string[]) {
  const ids: string[] = [];
  for (const name of names) {
    const c = await tx.schoolClass.upsert({ where: { name }, create: { name }, update: {} });
    ids.push(c.id);
  }
  return ids;
}

export async function upsertSubject(tx: Prisma.TransactionClient, name: string | null | undefined) {
  if (!name) return null;
  const s = await tx.subject.upsert({ where: { name }, create: { name }, update: {} });
  return s.id;
}

export async function teacherListItem(ctx: AppContext, teacherIds?: string[]) {
  const today = toLocal(ctx.clock.now()).date;
  const teachers = await ctx.prisma.teacher.findMany({
    where: teacherIds ? { id: { in: teacherIds } } : undefined,
    include: {
      user: true,
      subject: true,
      classes: { include: { class: true } },
      timetables: { where: { status: 'ACTIVE' }, select: { id: true, confirmedAt: true, entries: { select: { className: true } }, _count: { select: { entries: true } } } },
      attendance: { where: { date: today, checkOutAt: null }, select: { id: true } },
    },
    orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
  });
  return teachers.map((t) => ({
    id: t.id,
    userId: t.userId,
    firstName: t.user.firstName,
    lastName: t.user.lastName,
    login: t.user.login,
    status: t.user.status,
    positionTitle: t.positionTitle,
    subject: t.subject?.name ?? null,
    kind: t.kind,
    classes: [...new Set([...t.classes.map((c) => c.class.name), ...(t.timetables[0]?.entries ?? []).flatMap((e) => splitClasses(e.className))])].sort(compareClasses),
    avatarUrl: avatarUrl(t.avatarFileId),
    present: t.attendance.length > 0,
    lastLoginAt: t.user.lastLoginAt,
    createdAt: t.createdAt,
    timetable: t.timetables[0] ? { lessons: t.timetables[0]._count.entries, confirmedAt: t.timetables[0].confirmedAt } : null,
  }));
}
