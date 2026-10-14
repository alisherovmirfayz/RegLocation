import { activeLesson, activeMeal, isDayEnded, nextLesson, type ScheduleSettings } from './schedule';

export type StaffKind = 'TEACHER' | 'DIRECTOR' | 'HEAD_TEACHER';

export type LocationReason =
  | 'ABSENT'
  | 'MEAL'
  | 'MANUAL'
  | 'DIRECTOR_OFFICE'
  | 'HEAD_TEACHER_OFFICE'
  | 'LESSON'
  | 'FREE'
  | 'UNKNOWN_ROOM'
  | 'AWAY';

export type AwayPlace = 'ON_SITE' | 'OFF_SITE' | 'ROOM';

export interface TimetableSlot {
  dayOfWeek: number;
  lessonNumber: number;
  className: string;
  roomId: string | null;
  roomLabel: string;
}

export interface ActiveAssignment {
  id: string;
  roomId: string;
  startsAt: Date;
  endsAt: Date | null;
  cancelledAt: Date | null;
}

export interface SpecialRooms {
  canteenRoomId: string | null;
  teachersRoomId: string | null;
  directorOfficeId: string | null;
  headTeacherOfficeId: string | null;
}

export interface LocationInput {
  kind: StaffKind;
  present: boolean;
  dayOfWeek: number;
  minutes: number;
  /** Момент времени (реальный или смоделированный) для проверки сроков ручных назначений */
  now: Date;
  schedule: ScheduleSettings;
  timetable: TimetableSlot[];
  assignments: ActiveAssignment[];
  rooms: SpecialRooms;
  /** «Отошёл»: куда (на территории, за территорией или в кабинет) и до какого момента */
  away?: { place: AwayPlace; until: Date; roomId?: string | null } | null;
}

export interface ComputedLocation {
  present: boolean;
  roomId: string | null;
  reason: LocationReason;
  /** Подпись местоположения, если кабинета нет в базе (например, нераспознанный номер) */
  roomLabel?: string;
  className?: string;
  lessonNumber?: number;
  mealKey?: 'lunch' | 'snack';
  assignmentId?: string;
  awayPlace?: AwayPlace;
  /** ISO-время, до которого учитель отошёл */
  awayUntil?: string;
  nextLesson?: { number: number; start: string; className: string; roomLabel: string } | null;
}

export function isAssignmentActive(a: ActiveAssignment, now: Date): boolean {
  if (a.cancelledAt && a.cancelledAt <= now) return false;
  if (a.startsAt > now) return false;
  if (a.endsAt && a.endsAt <= now) return false;
  return true;
}

function findNext(input: LocationInput): ComputedLocation['nextLesson'] {
  const { schedule, dayOfWeek, minutes, timetable } = input;
  let m = minutes;
  // Ищем ближайший урок сегодня, который есть в расписании учителя.
  for (let guard = 0; guard < 20; guard++) {
    const nl = nextLesson(schedule, dayOfWeek, m);
    if (!nl) return null;
    const slot = timetable.find((t) => t.dayOfWeek === dayOfWeek && t.lessonNumber === nl.number);
    if (slot) return { number: nl.number, start: nl.start, className: slot.className, roomLabel: slot.roomLabel };
    const [h, mm] = nl.start.split(':').map(Number);
    m = h! * 60 + mm!;
  }
  return null;
}

/**
 * Единая функция определения расчётного местоположения сотрудника.
 * Приоритет:
 *  1) отсутствует → не показывается;
 *  1а) учитель отметил «Отошёл» (на территории / за территорией школы) — до указанного времени;
 *  2–3) обед / полдник → столовая;
 *  4) действующее ручное назначение директора;
 *  5) директор → кабинет директора;
 *  6) завуч → кабинет завуча;
 *  7) идёт урок → кабинет из расписания;
 *  8) свободное время → учительская.
 */
export function computeLocation(input: LocationInput): ComputedLocation {
  const { schedule, dayOfWeek, minutes, rooms } = input;
  const next = findNext(input);

  if (!input.present || isDayEnded(schedule, minutes)) {
    return { present: false, roomId: null, reason: 'ABSENT', nextLesson: next };
  }

  if (input.away && input.away.until > input.now) {
    return {
      present: true,
      roomId: input.away.place === 'ROOM' ? (input.away.roomId ?? null) : null,
      reason: 'AWAY',
      awayPlace: input.away.place,
      awayUntil: input.away.until.toISOString(),
      nextLesson: next,
    };
  }

  const meal = activeMeal(schedule, dayOfWeek, minutes);
  if (meal) {
    return { present: true, roomId: rooms.canteenRoomId, reason: 'MEAL', mealKey: meal.key, nextLesson: next };
  }

  const lesson = activeLesson(schedule, dayOfWeek, minutes);
  const slot = lesson ? input.timetable.find((t) => t.dayOfWeek === dayOfWeek && t.lessonNumber === lesson.number) : undefined;

  const manual = input.assignments
    .filter((a) => isAssignmentActive(a, input.now))
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())[0];
  if (manual) {
    return {
      present: true,
      roomId: manual.roomId,
      reason: 'MANUAL',
      assignmentId: manual.id,
      className: slot?.className,
      lessonNumber: lesson?.number,
      nextLesson: next,
    };
  }

  if (input.kind === 'DIRECTOR') {
    return { present: true, roomId: rooms.directorOfficeId, reason: 'DIRECTOR_OFFICE', nextLesson: next };
  }
  if (input.kind === 'HEAD_TEACHER') {
    return { present: true, roomId: rooms.headTeacherOfficeId, reason: 'HEAD_TEACHER_OFFICE', nextLesson: next };
  }

  if (lesson && slot) {
    if (!slot.roomId) {
      // Номер кабинета не сопоставлен с помещением — не подставляем произвольный кабинет.
      return {
        present: true,
        roomId: null,
        reason: 'UNKNOWN_ROOM',
        roomLabel: slot.roomLabel,
        className: slot.className,
        lessonNumber: lesson.number,
        nextLesson: next,
      };
    }
    return {
      present: true,
      roomId: slot.roomId,
      reason: 'LESSON',
      className: slot.className,
      lessonNumber: lesson.number,
      roomLabel: slot.roomLabel,
      nextLesson: next,
    };
  }

  return { present: true, roomId: rooms.teachersRoomId, reason: 'FREE', nextLesson: next };
}
