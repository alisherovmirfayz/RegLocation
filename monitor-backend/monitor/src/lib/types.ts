// Типы данных, приходящих от backend (см. src/domain/live.ts).
export type RoomType =
  | 'CLASSROOM' | 'RECEPTION' | 'TEACHERS_ROOM' | 'DIRECTOR_OFFICE' | 'HEAD_TEACHER_OFFICE' | 'ACCOUNTING' | 'CURATOR_OFFICE'
  | 'STAIRS' | 'ELEVATOR' | 'CORRIDOR' | 'GYM' | 'LAB' | 'CANTEEN' | 'KITCHEN' | 'STADIUM' | 'OTHER';

export interface Room {
  id: string;
  code: string;
  name: string;
  type: RoomType;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Floor {
  id: string;
  name: string;
  level: number;
  sortOrder: number;
  width: number;
  height: number;
  rooms: Room[];
}

export interface Building {
  id: string;
  kind: 'SCHOOL' | 'CANTEEN' | 'STADIUM' | 'KINDERGARTEN';
  name: string;
  floors: Floor[];
}

export type Reason = 'ABSENT' | 'MEAL' | 'MANUAL' | 'DIRECTOR_OFFICE' | 'HEAD_TEACHER_OFFICE' | 'LESSON' | 'FREE' | 'UNKNOWN_ROOM' | 'AWAY';
export type AwayPlace = 'ON_SITE' | 'OFF_SITE' | 'ROOM';

export interface Location {
  present: boolean;
  roomId: string | null;
  reason: Reason;
  awayPlace?: AwayPlace;
  /** ISO-время, до которого учитель отошёл */
  awayUntil?: string;
  roomLabel?: string;
  className?: string;
  lessonNumber?: number;
  mealKey?: 'lunch' | 'snack';
  buildingKind: 'SCHOOL' | 'CANTEEN' | 'STADIUM' | 'KINDERGARTEN' | null;
  floorId: string | null;
  roomName: string | null;
}

export interface Teacher {
  id: string;
  firstName: string;
  lastName: string;
  positionTitle: string;
  subject: string | null;
  kind: 'TEACHER' | 'DIRECTOR' | 'HEAD_TEACHER';
  avatarUrl: string | null;
  present: boolean;
  location: Location;
}

export interface Period {
  kind: 'BEFORE_SCHOOL' | 'LESSON' | 'BREAK' | 'MEAL' | 'AFTER_LESSONS' | 'DAY_ENDED' | 'DAY_OFF';
  lessonNumber?: number;
  mealKey?: 'lunch' | 'snack';
  title: string;
  start?: number;
  end?: number;
  nextLesson?: { number: number; start: string; end: string };
}

export interface MonitorSettings {
  schoolTitle: string;
  canteenTitle: string;
  idleAutoScroll: boolean;
  idleAfterSeconds: number;
  theme: 'dark' | 'light';
  showAbsentInList: boolean;
  highlightOccupied: boolean;
  ambientEffects: boolean;
}

export interface Snapshot {
  hash: string;
  clock: { simulated: boolean; date: string; dayOfWeek: number; minutes: number; seconds: number; serverTime: string };
  period: Period;
  buildings: Building[];
  teachers: Teacher[];
  presentCount: number;
  totalCount: number;
  monitor: MonitorSettings;
  simulation: { enabled: boolean; assumeAllPresent: boolean } | null;
  day?: { meals: { key: string; title: string; start: string; end: string }[]; startOfDay?: string; endOfDay: string; lessons: { number: number; start: string; end: string }[]; isSchoolDay: boolean };
}

/** «Отошёл»: куда и до какого времени (время по Ташкенту), одной строкой для перевода */
export function awayText(loc: { awayPlace?: AwayPlace; awayUntil?: string; roomName?: string | null }): string {
  if (!loc.awayPlace || !loc.awayUntil) return '';
  const t = new Date(loc.awayUntil).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });
  if (loc.awayPlace === 'ROOM') return `${loc.roomName ?? 'Кабинет'} до ${t}`;
  return loc.awayPlace === 'OFF_SITE' ? `За территорией школы до ${t}` : `На территории школы до ${t}`;
}
