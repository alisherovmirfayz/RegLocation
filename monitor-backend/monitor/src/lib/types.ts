// Типы данных, приходящих от backend (см. src/domain/live.ts).
export type RoomType =
  | 'CLASSROOM' | 'RECEPTION' | 'TEACHERS_ROOM' | 'DIRECTOR_OFFICE' | 'HEAD_TEACHER_OFFICE' | 'ACCOUNTING'
  | 'STAIRS' | 'ELEVATOR' | 'CORRIDOR' | 'GYM' | 'LAB' | 'CANTEEN' | 'KITCHEN' | 'OTHER';

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
  kind: 'SCHOOL' | 'CANTEEN';
  name: string;
  floors: Floor[];
}

export type Reason = 'ABSENT' | 'MEAL' | 'MANUAL' | 'DIRECTOR_OFFICE' | 'HEAD_TEACHER_OFFICE' | 'LESSON' | 'FREE' | 'UNKNOWN_ROOM';

export interface Location {
  present: boolean;
  roomId: string | null;
  reason: Reason;
  roomLabel?: string;
  className?: string;
  lessonNumber?: number;
  mealKey?: 'lunch' | 'snack';
  buildingKind: 'SCHOOL' | 'CANTEEN' | null;
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
  day?: { meals: { key: string; title: string; start: string; end: string }[]; endOfDay: string; lessons: { number: number; start: string; end: string }[]; isSchoolDay: boolean };
}
