import type { CheckOutReason } from '@prisma/client';
import type { AppContext } from '../context';
import { HttpError } from '../lib/errors';
import { toLocal } from '../lib/time';
import { isDayEnded } from './schedule';

/** «Я в школе». Всегда по реальному времени — тестовый режим не затрагивает посещаемость. */
export async function checkIn(ctx: AppContext, teacherId: string) {
  const now = ctx.clock.now();
  const local = toLocal(now);
  const schedule = await ctx.settings.schedule();
  if (isDayEnded(schedule, local.minutes)) {
    throw new HttpError(409, `Учебный день завершён в ${schedule.endOfDay}. Отметка будет доступна завтра.`, 'DAY_ENDED');
  }
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
