import { describe, expect, it } from 'vitest';
import { computeLocation, type LocationInput, type TimetableSlot } from '../src/domain/location';
import { DEFAULT_SCHEDULE, describePeriod, lessonEndMinutes } from '../src/domain/schedule';
import { parseHM, toLocal, localToUtc } from '../src/lib/time';

const rooms = { canteenRoomId: 'canteen', teachersRoomId: 'teachers', directorOfficeId: 'director', headTeacherOfficeId: 'zavuch' };
const timetable: TimetableSlot[] = [
  { dayOfWeek: 1, lessonNumber: 3, className: '10A', roomId: 'r404', roomLabel: '404' },
  { dayOfWeek: 1, lessonNumber: 4, className: '6B', roomId: 'r405', roomLabel: '405' },
  { dayOfWeek: 1, lessonNumber: 5, className: '1B', roomId: 'r404', roomLabel: '404' },
  { dayOfWeek: 1, lessonNumber: 8, className: '9A', roomId: 'r301', roomLabel: '301' },
  { dayOfWeek: 1, lessonNumber: 9, className: '1C', roomId: 'r502', roomLabel: '502' },
  { dayOfWeek: 6, lessonNumber: 2, className: '10A', roomId: 'r601', roomLabel: '601' },
  { dayOfWeek: 2, lessonNumber: 1, className: '0A', roomId: null, roomLabel: '999' },
];

const at = (time: string, over: Partial<LocationInput> = {}) =>
  computeLocation({
    kind: 'TEACHER',
    present: true,
    dayOfWeek: 1,
    minutes: parseHM(time),
    now: new Date('2026-10-12T05:00:00Z'),
    schedule: DEFAULT_SCHEDULE,
    timetable,
    assignments: [],
    rooms,
    ...over,
  });

describe('Определение местоположения: приоритеты', () => {
  it('отсутствующий учитель не показывается', () => {
    expect(at('10:00', { present: false })).toMatchObject({ present: false, roomId: null, reason: 'ABSENT' });
  });

  it('10:00 — обычный урок: кабинет из расписания', () => {
    // 10:00 — 2-й урок, у учителя его нет → учительская; 11:00 — 3-й урок → 404
    expect(at('10:00')).toMatchObject({ roomId: 'teachers', reason: 'FREE' });
    expect(at('11:00')).toMatchObject({ roomId: 'r404', reason: 'LESSON', className: '10A', lessonNumber: 3 });
  });

  it('ручное назначение важнее расписания, но не важнее обеда', () => {
    const assignments = [{ id: 'a1', roomId: 'r405', startsAt: new Date('2026-10-12T04:00:00Z'), endsAt: null, cancelledAt: null }];
    expect(at('11:00', { assignments })).toMatchObject({ roomId: 'r405', reason: 'MANUAL', className: '10A' });
    expect(at('12:30', { assignments })).toMatchObject({ roomId: 'canteen', reason: 'MEAL' });
  });

  it('истёкшее или отменённое назначение не действует', () => {
    const now = new Date('2026-10-12T06:00:00Z');
    const expired = [{ id: 'a1', roomId: 'r405', startsAt: new Date('2026-10-12T04:00:00Z'), endsAt: new Date('2026-10-12T05:59:00Z'), cancelledAt: null }];
    const cancelled = [{ id: 'a2', roomId: 'r405', startsAt: new Date('2026-10-12T04:00:00Z'), endsAt: null, cancelledAt: new Date('2026-10-12T05:00:00Z') }];
    expect(at('11:00', { assignments: expired, now }).reason).toBe('LESSON');
    expect(at('11:00', { assignments: cancelled, now }).reason).toBe('LESSON');
  });

  it('директор — в кабинете директора, завуч — в кабинете завуча, в обед — столовая', () => {
    expect(at('11:00', { kind: 'DIRECTOR' })).toMatchObject({ roomId: 'director', reason: 'DIRECTOR_OFFICE' });
    expect(at('11:00', { kind: 'HEAD_TEACHER' })).toMatchObject({ roomId: 'zavuch', reason: 'HEAD_TEACHER_OFFICE' });
    expect(at('12:45', { kind: 'DIRECTOR' })).toMatchObject({ roomId: 'canteen', reason: 'MEAL' });
    expect(at('15:50', { kind: 'HEAD_TEACHER' })).toMatchObject({ roomId: 'canteen', reason: 'MEAL', mealKey: 'snack' });
    expect(at('13:15', { kind: 'DIRECTOR' })).toMatchObject({ roomId: 'director' });
  });

  it('свободное время — учительская', () => {
    expect(at('10:40')).toMatchObject({ roomId: 'teachers', reason: 'FREE' });
    expect(at('08:30')).toMatchObject({ roomId: 'teachers', reason: 'FREE' });
  });

  it('субботний урок', () => {
    expect(at('10:00', { dayOfWeek: 6 })).toMatchObject({ roomId: 'r601', reason: 'LESSON', className: '10A' });
  });

  it('не подставляет кабинет, если номер не сопоставлен с базой', () => {
    expect(at('09:10', { dayOfWeek: 2 })).toMatchObject({ roomId: null, reason: 'UNKNOWN_ROOM', roomLabel: '999' });
  });

  it('воскресенье — нет уроков и питания', () => {
    expect(at('12:40', { dayOfWeek: 7 })).toMatchObject({ roomId: 'teachers', reason: 'FREE' });
  });

  it('следующий урок по расписанию учителя', () => {
    expect(at('10:00').nextLesson).toMatchObject({ number: 3, className: '10A', roomLabel: '404' });
  });
});

describe('Граничные моменты времени', () => {
  const cases: [string, string, string | null][] = [
    ['12:29', 'FREE', 'teachers'], // перемена после 4-го урока
    ['12:30', 'MEAL', 'canteen'], // начало обеда
    ['13:14', 'MEAL', 'canteen'],
    ['13:15', 'FREE', 'teachers'], // обед закончился, 6-й урок с 13:20
    ['15:44', 'LESSON', 'r301'], // 8-й урок
    ['15:45', 'MEAL', 'canteen'], // полдник
    ['16:04', 'MEAL', 'canteen'],
    ['16:05', 'LESSON', 'r502'], // 9-й урок
    ['17:00', 'ABSENT', null], // завершение дня
  ];
  for (const [time, reason, room] of cases) {
    it(`${time} → ${reason}`, () => {
      const loc = at(time);
      expect(loc.reason).toBe(reason);
      expect(loc.roomId).toBe(room);
    });
  }

  it('periods: 12:29 перемена, 12:30 обед, 13:15 перемена, 15:45 полдник, 16:05 урок 9, 17:00 конец дня', () => {
    const p = (t: string) => describePeriod(DEFAULT_SCHEDULE, 1, parseHM(t));
    expect(p('12:29').kind).toBe('BREAK');
    expect(p('12:30')).toMatchObject({ kind: 'MEAL', mealKey: 'lunch' });
    expect(p('13:15').kind).toBe('BREAK');
    expect(p('15:45')).toMatchObject({ kind: 'MEAL', mealKey: 'snack' });
    expect(p('16:05')).toMatchObject({ kind: 'LESSON', lessonNumber: 9 });
    expect(p('17:00').kind).toBe('DAY_ENDED');
    expect(describePeriod(DEFAULT_SCHEDULE, 7, parseHM('10:00')).kind).toBe('DAY_OFF');
  });

  it('«до окончания урока»: конец текущего или ближайшего урока', () => {
    expect(lessonEndMinutes(DEFAULT_SCHEDULE, 1, parseHM('10:00'))).toBe(parseHM('10:35'));
    expect(lessonEndMinutes(DEFAULT_SCHEDULE, 1, parseHM('10:40'))).toBe(parseHM('11:35'));
  });
});

describe('Часовой пояс Asia/Tashkent', () => {
  it('UTC → Ташкент (UTC+5)', () => {
    expect(toLocal(new Date('2026-10-12T07:30:00Z'))).toMatchObject({ date: '2026-10-12', dayOfWeek: 1, minutes: parseHM('12:30') });
    expect(toLocal(new Date('2026-10-17T20:00:00Z'))).toMatchObject({ date: '2026-10-18', dayOfWeek: 7 });
  });
  it('Ташкент → UTC', () => {
    expect(localToUtc('2026-10-12', parseHM('17:00')).toISOString()).toBe('2026-10-12T12:00:00.000Z');
  });
});
