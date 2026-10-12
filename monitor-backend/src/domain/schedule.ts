import { z } from 'zod';
import { formatHM, parseHM } from '../lib/time';

const HM = z.string().regex(/^\d{2}:\d{2}$/, 'Формат времени ЧЧ:ММ');

export const LessonSlotSchema = z.object({
  number: z.number().int().min(1).max(15),
  start: HM,
  end: HM,
});

export const MealSchema = z.object({
  key: z.enum(['lunch', 'snack']),
  title: z.string().min(1).max(40),
  start: HM,
  end: HM,
  enabled: z.boolean().default(true),
});

export const ScheduleSettingsSchema = z
  .object({
    lessons: z.array(LessonSlotSchema).min(1).max(15),
    meals: z.array(MealSchema).max(4),
    endOfDay: HM,
    /** Учебные дни: 1 = понедельник … 6 = суббота */
    schoolDays: z.array(z.number().int().min(1).max(7)).min(1),
  })
  .superRefine((s, ctx) => {
    const sorted = [...s.lessons].sort((a, b) => a.number - b.number);
    let prevEnd = -1;
    for (const l of sorted) {
      const st = parseHM(l.start);
      const en = parseHM(l.end);
      if (en <= st) ctx.addIssue({ code: 'custom', message: `Урок ${l.number}: конец раньше начала` });
      if (st < prevEnd) ctx.addIssue({ code: 'custom', message: `Урок ${l.number} пересекается с предыдущим` });
      prevEnd = en;
    }
    const nums = new Set(s.lessons.map((l) => l.number));
    if (nums.size !== s.lessons.length) ctx.addIssue({ code: 'custom', message: 'Номера уроков повторяются' });
    for (const m of s.meals) {
      if (parseHM(m.end) <= parseHM(m.start)) ctx.addIssue({ code: 'custom', message: `${m.title}: конец раньше начала` });
    }
  });

export type LessonSlot = z.infer<typeof LessonSlotSchema>;
export type Meal = z.infer<typeof MealSchema>;
export type ScheduleSettings = z.infer<typeof ScheduleSettingsSchema>;

export const DEFAULT_SCHEDULE: ScheduleSettings = {
  lessons: [
    { number: 1, start: '09:00', end: '09:45' },
    { number: 2, start: '09:50', end: '10:35' },
    { number: 3, start: '10:50', end: '11:35' },
    { number: 4, start: '11:40', end: '12:25' },
    { number: 5, start: '12:30', end: '13:15' },
    { number: 6, start: '13:20', end: '14:05' },
    { number: 7, start: '14:10', end: '14:55' },
    { number: 8, start: '15:00', end: '15:45' },
    { number: 9, start: '16:05', end: '16:50' },
  ],
  meals: [
    { key: 'lunch', title: 'Обед', start: '12:30', end: '13:15', enabled: true },
    { key: 'snack', title: 'Полдник', start: '15:45', end: '16:05', enabled: true },
  ],
  endOfDay: '17:00',
  schoolDays: [1, 2, 3, 4, 5, 6],
};

export type PeriodKind = 'BEFORE_SCHOOL' | 'LESSON' | 'BREAK' | 'MEAL' | 'AFTER_LESSONS' | 'DAY_ENDED' | 'DAY_OFF';

export interface Period {
  kind: PeriodKind;
  lessonNumber?: number;
  mealKey?: 'lunch' | 'snack';
  title: string;
  /** Минуты начала/конца текущего периода, если применимо */
  start?: number;
  end?: number;
  nextLesson?: { number: number; start: string; end: string };
}

/** Интервалы полуоткрытые: [start, end). В 12:30 обед уже идёт, в 13:15 — уже закончился. */
const within = (m: number, start: string, end: string) => m >= parseHM(start) && m < parseHM(end);

export function activeLesson(s: ScheduleSettings, dayOfWeek: number, minutes: number): LessonSlot | undefined {
  if (!s.schoolDays.includes(dayOfWeek)) return undefined;
  return s.lessons.find((l) => within(minutes, l.start, l.end));
}

export function activeMeal(s: ScheduleSettings, dayOfWeek: number, minutes: number): Meal | undefined {
  if (!s.schoolDays.includes(dayOfWeek)) return undefined;
  return s.meals.find((m) => m.enabled && within(minutes, m.start, m.end));
}

export function isDayEnded(s: ScheduleSettings, minutes: number): boolean {
  return minutes >= parseHM(s.endOfDay);
}

export function nextLesson(s: ScheduleSettings, dayOfWeek: number, minutes: number): LessonSlot | undefined {
  if (!s.schoolDays.includes(dayOfWeek)) return undefined;
  return [...s.lessons].sort((a, b) => a.number - b.number).find((l) => parseHM(l.start) > minutes);
}

export function describePeriod(s: ScheduleSettings, dayOfWeek: number, minutes: number): Period {
  const nl = nextLesson(s, dayOfWeek, minutes);
  const next = nl ? { number: nl.number, start: nl.start, end: nl.end } : undefined;
  if (!s.schoolDays.includes(dayOfWeek)) return { kind: 'DAY_OFF', title: 'Выходной день' };
  if (isDayEnded(s, minutes)) return { kind: 'DAY_ENDED', title: 'Учебный день завершён' };
  const meal = activeMeal(s, dayOfWeek, minutes);
  if (meal) {
    return { kind: 'MEAL', mealKey: meal.key, title: meal.title, start: parseHM(meal.start), end: parseHM(meal.end), nextLesson: next };
  }
  const lesson = activeLesson(s, dayOfWeek, minutes);
  if (lesson) {
    return {
      kind: 'LESSON',
      lessonNumber: lesson.number,
      title: `${lesson.number} урок`,
      start: parseHM(lesson.start),
      end: parseHM(lesson.end),
      nextLesson: next,
    };
  }
  const sorted = [...s.lessons].sort((a, b) => a.number - b.number);
  if (sorted.length && minutes < parseHM(sorted[0]!.start)) {
    return { kind: 'BEFORE_SCHOOL', title: 'До начала уроков', nextLesson: next };
  }
  if (!next) return { kind: 'AFTER_LESSONS', title: 'Уроки закончились' };
  return { kind: 'BREAK', title: 'Перемена', nextLesson: next };
}

/** Момент окончания урока, идущего сейчас, или ближайшего следующего (для режима «до окончания урока»). */
export function lessonEndMinutes(s: ScheduleSettings, dayOfWeek: number, minutes: number): number {
  const cur = activeLesson(s, dayOfWeek, minutes) ?? nextLesson(s, dayOfWeek, minutes);
  return cur ? parseHM(cur.end) : parseHM(s.endOfDay);
}

export { formatHM, parseHM };
