// Типы данных backend RegLocation (проект №1).
export type RoomType =
  | 'CLASSROOM' | 'RECEPTION' | 'TEACHERS_ROOM' | 'DIRECTOR_OFFICE' | 'HEAD_TEACHER_OFFICE' | 'ACCOUNTING'
  | 'STAIRS' | 'ELEVATOR' | 'CORRIDOR' | 'GYM' | 'LAB' | 'CANTEEN' | 'KITCHEN' | 'STADIUM' | 'OTHER';

export const ROOM_TYPE_LABEL: Record<RoomType, string> = {
  CLASSROOM: 'Учебный кабинет',
  RECEPTION: 'Ресепшен',
  TEACHERS_ROOM: 'Учительская',
  DIRECTOR_OFFICE: 'Кабинет директора',
  HEAD_TEACHER_OFFICE: 'Кабинет завуча',
  ACCOUNTING: 'Бухгалтерия',
  STAIRS: 'Лестница',
  ELEVATOR: 'Лифт',
  CORRIDOR: 'Коридор',
  GYM: 'Спортзал',
  LAB: 'Лаборатория / кружок',
  CANTEEN: 'Столовая (зал)',
  KITCHEN: 'Кухня',
  STADIUM: 'Стадион',
  OTHER: 'Другое',
};

export interface Room {
  id: string;
  code: string;
  name: string;
  type: RoomType;
  x: number;
  y: number;
  width: number;
  height: number;
  timetableUses?: number;
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
  kind: 'SCHOOL' | 'CANTEEN' | 'STADIUM';
  name: string;
  floors: Floor[];
}

export type Reason = 'ABSENT' | 'MEAL' | 'MANUAL' | 'DIRECTOR_OFFICE' | 'HEAD_TEACHER_OFFICE' | 'LESSON' | 'FREE' | 'UNKNOWN_ROOM';
export type StaffKind = 'TEACHER' | 'DIRECTOR' | 'HEAD_TEACHER';

export interface Location {
  present: boolean;
  roomId: string | null;
  reason: Reason;
  roomLabel?: string;
  className?: string;
  lessonNumber?: number;
  mealKey?: 'lunch' | 'snack';
  buildingKind: 'SCHOOL' | 'CANTEEN' | 'STADIUM' | null;
  floorId: string | null;
  roomName: string | null;
  nextLesson?: { number: number; start: string; className: string; roomLabel: string } | null;
}

export const REASON_LABEL: Record<Reason, string> = {
  ABSENT: 'Не в школе',
  MEAL: 'Столовая',
  MANUAL: 'Назначено директором',
  DIRECTOR_OFFICE: 'Кабинет директора',
  HEAD_TEACHER_OFFICE: 'Кабинет завуча',
  LESSON: 'Урок по расписанию',
  FREE: 'Свободное время',
  UNKNOWN_ROOM: 'Кабинет не найден в схеме',
};

export interface SnapshotTeacher {
  id: string;
  firstName: string;
  lastName: string;
  positionTitle: string;
  subject: string | null;
  kind: StaffKind;
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
  teachers: SnapshotTeacher[];
  presentCount: number;
  totalCount: number;
  monitor: MonitorSettings;
  simulation: { enabled: boolean; assumeAllPresent: boolean } | null;
}

export interface LessonSlot {
  number: number;
  start: string;
  end: string;
}
export interface Meal {
  key: 'lunch' | 'snack';
  title: string;
  start: string;
  end: string;
  enabled: boolean;
}
export interface ScheduleSettings {
  lessons: LessonSlot[];
  meals: Meal[];
  startOfDay: string;
  endOfDay: string;
  schoolDays: number[];
}

export interface TeacherState {
  teacher: {
    id: string;
    firstName: string;
    lastName: string;
    login: string;
    positionTitle: string;
    subject: string | null;
    kind: StaffKind;
    classes: string[];
    avatarUrl: string | null;
  };
  present: boolean;
  attendance: { checkInAt: string; checkOutAt: string | null; checkOutReason: string | null } | null;
  canCheckIn: boolean;
  checkInBlockedReason: string | null;
  location: Location;
  period: Period;
  clock: { date: string; dayOfWeek: number; minutes: number; serverTime: string };
  todayLessons: { number: number; start: string; end: string; className: string; roomLabel: string; roomKnown: boolean }[];
  hasTimetable: boolean;
}

export interface RoomOption {
  id: string;
  code: string;
  name: string;
  type: RoomType;
  floor: string;
  building: 'SCHOOL' | 'CANTEEN' | 'STADIUM';
}

export interface TimetableEntry {
  dayOfWeek: number;
  lessonNumber: number;
  className: string;
  roomLabel: string;
  roomId?: string | null;
}

export interface TimetableResponse {
  timetable: { id: string; confirmedAt: string | null; sourceFileId: string | null; entries: TimetableEntry[] } | null;
  lessons: LessonSlot[];
  schoolDays: number[];
  rooms: RoomOption[];
}

export interface DraftEntry {
  dayOfWeek: number;
  lessonNumber: number;
  className: string;
  classRaw: string;
  classConfidence: number;
  roomLabel: string;
  roomRaw: string;
  roomId: string | null;
  roomConfidence: number;
  needsReview: boolean;
  notes: string[];
  classBox?: { page: number; x: number; y: number; w: number; h: number };
  roomBox?: { page: number; x: number; y: number; w: number; h: number };
}

export interface RecognitionResult {
  entries: DraftEntry[];
  warnings: string[];
  totalPages: number;
  processedPages: number;
  method: 'text-layer' | 'ocr' | 'mixed' | 'none';
  cellsRead: number;
  reread: number;
  previews: { page: number; dataUrl: string; width: number; height: number }[];
}

export interface TeacherListItem {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  login: string;
  status: 'ACTIVE' | 'BLOCKED' | 'ARCHIVED';
  positionTitle: string;
  subject: string | null;
  kind: StaffKind;
  classes: string[];
  avatarUrl: string | null;
  present: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  timetable: { lessons: number; confirmedAt: string | null } | null;
}

export interface AuditRow {
  id: string;
  actorName: string;
  actorRole: string;
  action: string;
  summary: string;
  targetType: string | null;
  createdAt: string;
  ip: string | null;
}

export const DAY_NAMES = ['', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
export const DAY_SHORT = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export const KIND_LABEL: Record<StaffKind, string> = { TEACHER: 'Учитель', DIRECTOR: 'Директор', HEAD_TEACHER: 'Завуч' };

export const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function periodText(p: Period): string {
  if (p.kind === 'LESSON' && p.start !== undefined && p.end !== undefined) return `${p.lessonNumber} урок · ${hm(p.start)}–${hm(p.end)}`;
  if (p.kind === 'MEAL' && p.start !== undefined && p.end !== undefined) return `${p.title} · ${hm(p.start)}–${hm(p.end)}`;
  if (p.nextLesson) return `${p.title} · далее ${p.nextLesson.number} урок в ${p.nextLesson.start}`;
  return p.title;
}

export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
export const fmtTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('ru-RU', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit' }) : '—';
