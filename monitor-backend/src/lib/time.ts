/** Работа со временем школы. Все расчёты ведутся по часовому поясу Asia/Tashkent. */
export const SCHOOL_TZ = 'Asia/Tashkent';

export interface LocalTime {
  /** YYYY-MM-DD */
  date: string;
  /** 1 = понедельник … 7 = воскресенье */
  dayOfWeek: number;
  /** Минуты от полуночи */
  minutes: number;
  seconds: number;
}

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: SCHOOL_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
});

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function toLocal(d: Date): LocalTime {
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    dayOfWeek: WEEKDAYS[parts.weekday as string] ?? 1,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    seconds: Number(parts.second),
  };
}

/** "HH:MM" → минуты */
export function parseHM(hm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) throw new Error(`Неверное время: ${hm}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`Неверное время: ${hm}`);
  return h * 60 + min;
}

export function formatHM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Возвращает UTC-момент, соответствующий указанной локальной дате и минутам в Ташкенте.
 * Asia/Tashkent не использует летнее время (UTC+5), но вычисляем через Intl для надёжности.
 */
export function localToUtc(date: string, minutes: number): Date {
  const [y, mo, d] = date.split('-').map(Number);
  const guess = Date.UTC(y!, mo! - 1, d!, Math.floor(minutes / 60), minutes % 60);
  const local = toLocal(new Date(guess));
  const [ly, lmo, ld] = local.date.split('-').map(Number);
  const localAsUtc = Date.UTC(ly!, lmo! - 1, ld!, Math.floor(local.minutes / 60), local.minutes % 60);
  const offset = localAsUtc - guess;
  return new Date(guess - offset);
}

export const DAY_NAMES_RU = ['', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
