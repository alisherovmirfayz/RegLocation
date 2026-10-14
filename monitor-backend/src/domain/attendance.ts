import type { AwayPlace, CheckOutReason } from '@prisma/client';
import type { AppContext } from '../context';
import { HttpError } from '../lib/errors';
import { toLocal } from '../lib/time';
import { checkInBlock, parseHM } from './schedule';

/** «Я в школе». Всегда по реальному времени — тестовый режим не затрагивает посещаемость. */
export async function checkIn(ctx: AppContext, teacherId: string) {
  const now = ctx.clock.now();
  const local = toLocal(now);
  const schedule = await ctx.settings.schedule();
  // Отметка только в учебное время: с начала (08:00) до конца (17:00) учебного дня
  const blocked = checkInBlock(schedule, local.dayOfWeek, local.minutes);
  if (blocked) throw new HttpError(409, blocked.message, blocked.code);
  const open = await ctx.prisma.attendance.findFirst({ where: { teacherId, date: local.date, checkOutAt: null } });
  if (open) return open;
  const rec = await ctx.prisma.attendance.create({ data: { teacherId, date: local.date, checkInAt: now } });
  await ctx.live.changed();
  return rec;
}

/** «Выйти из школы». */
export async function checkOut(ctx: AppContext, teacherId: string, reason: CheckOutReason = 'MANUAL') {
  const now = ctx.clock.now();
  const r = await ctx.prisma.attendance.updateMany({
    where: { teacherId, checkOutAt: null },
    data: { checkOutAt: now, checkOutReason: reason },
  });
  await ctx.live.changed();
  return r.count;
}

/** Сколько можно отсутствовать по кнопке «Отошёл»: от 5 минут до 8 часов (но не дольше конца учебного дня). */
export const AWAY_MIN_MINUTES = 5;
export const AWAY_MAX_MINUTES = 8 * 60;

/** «Отошёл»: на территорию школы или за её пределы на указанное время. Только для отметившихся «Я в школе». */
export async function setAway(ctx: AppContext, teacherId: string, minutes: number, place: AwayPlace) {
  const now = ctx.clock.now();
  const local = toLocal(now);
  const open = await ctx.prisma.attendance.findFirst({ where: { teacherId, date: local.date, checkOutAt: null } });
  if (!open) throw new HttpError(409, 'Сначала отметьтесь «Я в школе».', 'NOT_PRESENT');
  const schedule = await ctx.settings.schedule();
  // Не дольше конца учебного дня: в 17:00 всё равно автоматический выход
  const leftToday = parseHM(schedule.endOfDay) - local.minutes;
  if (leftToday <= 0) throw new HttpError(409, `Учебный день завершён в ${schedule.endOfDay}.`, 'DAY_ENDED');
  const until = new Date(now.getTime() + Math.min(minutes, leftToday) * 60_000);
  const rec = await ctx.prisma.attendance.update({ where: { id: open.id }, data: { awayPlace: place, awayAt: now, awayUntil: until } });
  await ctx.live.changed();
  return rec;
}

/** «Я вернулся» — досрочно отменить «Отошёл». */
export async function clearAway(ctx: AppContext, teacherId: string) {
  await ctx.prisma.attendance.updateMany({ where: { teacherId, checkOutAt: null, awayUntil: { not: null } }, data: { awayPlace: null, awayAt: null, awayUntil: null } });
  await ctx.live.changed();
}
