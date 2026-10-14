import type { Server as IOServer } from 'socket.io';
import { splitClasses } from '../ocr/normalize';
import type { BuildingKind, RoomType, StaffKind } from '@prisma/client';
import type { AppContext } from '../context';
import { computeLocation, isAssignmentActive, type AwayPlace, type ComputedLocation, type SpecialRooms, type TimetableSlot } from './location';
import { checkInBlock, describePeriod, isDayEnded, parseHM, type Period } from './schedule';
import { SIMULATION_MAX_MS, type MonitorSettings } from './settings';
import { toLocal } from '../lib/time';
import { logger } from '../lib/logger';
import { sha256 } from '../lib/credentials';

export interface SnapshotRoom {
  id: string;
  code: string;
  name: string;
  type: RoomType;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface SnapshotFloor {
  id: string;
  name: string;
  level: number;
  sortOrder: number;
  width: number;
  height: number;
  rooms: SnapshotRoom[];
}
export interface SnapshotBuilding {
  id: string;
  kind: BuildingKind;
  name: string;
  floors: SnapshotFloor[];
}
export interface SnapshotLocation extends ComputedLocation {
  buildingKind: BuildingKind | null;
  floorId: string | null;
  roomName: string | null;
}
export interface SnapshotTeacher {
  id: string;
  firstName: string;
  lastName: string;
  positionTitle: string;
  subject: string | null;
  kind: StaffKind;
  avatarUrl: string | null;
  present: boolean;
  location: SnapshotLocation;
}
export interface Clock {
  simulated: boolean;
  date: string;
  dayOfWeek: number;
  minutes: number;
  seconds: number;
  serverTime: string;
}
export interface MonitorSnapshot {
  hash: string;
  clock: Clock;
  period: Period;
  buildings: SnapshotBuilding[];
  teachers: SnapshotTeacher[];
  presentCount: number;
  totalCount: number;
  monitor: MonitorSettings;
  simulation: { enabled: boolean; assumeAllPresent: boolean } | null;
  day: { meals: { key: string; title: string; start: string; end: string }[]; endOfDay: string; lessons: { number: number; start: string; end: string }[]; isSchoolDay: boolean };
}

interface StaticTeacher {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  login: string;
  positionTitle: string;
  subject: string | null;
  kind: StaffKind;
  avatarUrl: string | null;
  classes: string[];
  timetable: TimetableSlot[];
}

interface StaticData {
  buildings: SnapshotBuilding[];
  roomIndex: Map<string, { room: SnapshotRoom; floorId: string; buildingKind: BuildingKind }>;
  special: SpecialRooms;
  teachers: StaticTeacher[];
}

interface DynamicData {
  present: Set<string>;
  openAttendance: Map<string, { checkInAt: Date }>;
  assignments: Map<string, { id: string; roomId: string; startsAt: Date; endsAt: Date | null; cancelledAt: Date | null }[]>;
  away: Map<string, { place: AwayPlace; until: Date; roomId: string | null }>;
}

export const avatarUrl = (fileId: string | null | undefined) => (fileId ? `/api/files/${fileId}` : null);

/** «1B» < «6B» < «10A»: сначала номер класса, затем буква. */
export const compareClasses = (a: string, b: string) => parseInt(a) - parseInt(b) || a.localeCompare(b);

export class LiveService {
  private ctx!: AppContext;
  private io: IOServer | null = null;
  private staticData: StaticData | null = null;
  private lastHash = '';
  private teacherHashes = new Map<string, string>();
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;
  private stopped = true;

  attach(ctx: AppContext) {
    this.ctx = ctx;
  }

  setIO(io: IOServer) {
    this.io = io;
  }

  /** Сбросить кеш статических данных (кабинеты, учителя, расписания) только в этом экземпляре. */
  invalidate() {
    this.staticData = null;
  }

  private seenVersion = -1;
  private lastMaintenance = 0;

  /**
   * Данные изменились: увеличиваем версию в базе. Остальные экземпляры сервера
   * (на Vercel их может быть несколько) увидят новую версию и перечитают кеш.
   */
  async bumpVersion() {
    this.invalidate();
    await this.ctx.prisma.systemState.upsert({ where: { id: 1 }, create: { id: 1, dataVersion: 1 }, update: { dataVersion: { increment: 1 } } });
  }

  /** Сверка с версией данных в базе: при расхождении сбрасываем кеш учителей/кабинетов и настроек. */
  async syncVersion() {
    const row = await this.ctx.prisma.systemState.findUnique({ where: { id: 1 }, select: { dataVersion: true } });
    const v = row?.dataVersion ?? 0;
    if (v === this.seenVersion) return;
    if (this.seenVersion !== -1) {
      this.invalidate();
      this.ctx.settings.invalidate();
    }
    this.seenVersion = v;
  }

  /**
   * Обслуживание без постоянно работающего планировщика (Vercel): автоматический выход после 17:00
   * и выключение просроченного тестового режима. Выполняется не чаще раза в 30 секунд на экземпляр.
   */
  async maintain(force = false) {
    const now = Date.now();
    if (!force && now - this.lastMaintenance < 30_000) return;
    this.lastMaintenance = now;
    await this.autoCheckout();
    await this.expireSimulation();
  }

  private async expireSimulation() {
    const sim = await this.ctx.settings.simulation();
    if (sim && this.ctx.clock.now().getTime() - new Date(sim.startedAt).getTime() > SIMULATION_MAX_MS) {
      await this.ctx.settings.setSimulation(null);
      logger.info('Тестовый режим автоматически выключен по таймауту');
    }
  }

  private async loadStatic(): Promise<StaticData> {
    if (this.staticData) return this.staticData;
    const { prisma } = this.ctx;
    const [buildings, teachers] = await Promise.all([
      prisma.building.findMany({
        orderBy: { kind: 'asc' },
        include: { floors: { orderBy: { sortOrder: 'asc' }, include: { rooms: { include: { layout: true }, orderBy: { code: 'asc' } } } } },
      }),
      prisma.teacher.findMany({
        where: { user: { status: 'ACTIVE' } },
        include: {
          user: true,
          subject: true,
          classes: { include: { class: true } },
          timetables: { where: { status: 'ACTIVE' }, include: { entries: true } },
        },
      }),
    ]);

    const roomIndex: StaticData['roomIndex'] = new Map();
    const special: SpecialRooms = { canteenRoomId: null, teachersRoomId: null, directorOfficeId: null, headTeacherOfficeId: null };
    const snapBuildings: SnapshotBuilding[] = buildings.map((b) => ({
      id: b.id,
      kind: b.kind,
      name: b.name,
      floors: b.floors.map((f) => ({
        id: f.id,
        name: f.name,
        level: f.level,
        sortOrder: f.sortOrder,
        width: f.width,
        height: f.height,
        rooms: f.rooms.map((r) => {
          const room: SnapshotRoom = {
            id: r.id,
            code: r.code,
            name: r.name,
            type: r.type,
            x: r.layout?.x ?? 0,
            y: r.layout?.y ?? 0,
            width: r.layout?.width ?? 120,
            height: r.layout?.height ?? 80,
          };
          roomIndex.set(r.id, { room, floorId: f.id, buildingKind: b.kind });
          if (r.type === 'CANTEEN' && !special.canteenRoomId) special.canteenRoomId = r.id;
          if (r.type === 'TEACHERS_ROOM' && !special.teachersRoomId) special.teachersRoomId = r.id;
          if (r.type === 'DIRECTOR_OFFICE' && !special.directorOfficeId) special.directorOfficeId = r.id;
          if (r.type === 'HEAD_TEACHER_OFFICE' && !special.headTeacherOfficeId) special.headTeacherOfficeId = r.id;
          return room;
        }),
      })),
    }));

    const staticTeachers: StaticTeacher[] = teachers
      .map((t) => ({
        id: t.id,
        userId: t.userId,
        firstName: t.user.firstName,
        lastName: t.user.lastName,
        login: t.user.login,
        positionTitle: t.positionTitle,
        subject: t.subject?.name ?? null,
        kind: t.kind,
        avatarUrl: avatarUrl(t.avatarFileId),
        // Классы берутся из действующего расписания (и из старых ручных записей, если они есть)
        classes: [...new Set([...t.classes.map((c) => c.class.name), ...(t.timetables[0]?.entries ?? []).flatMap((e) => splitClasses(e.className))])].sort(compareClasses),
        timetable: (t.timetables[0]?.entries ?? []).map((e) => ({
          dayOfWeek: e.dayOfWeek,
          lessonNumber: e.lessonNumber,
          className: e.className,
          roomId: e.roomId,
          roomLabel: e.roomLabel,
        })),
      }))
      .sort((a, b) => a.lastName.localeCompare(b.lastName, 'ru') || a.firstName.localeCompare(b.firstName, 'ru'));

    this.staticData = { buildings: snapBuildings, roomIndex, special, teachers: staticTeachers };
    return this.staticData;
  }

  private async loadDynamic(realNow: Date): Promise<DynamicData> {
    const { prisma } = this.ctx;
    const today = toLocal(realNow).date;
    const [open, assignments] = await Promise.all([
      prisma.attendance.findMany({ where: { date: today, checkOutAt: null }, select: { teacherId: true, checkInAt: true, awayPlace: true, awayUntil: true, awayRoomId: true } }),
      prisma.manualAssignment.findMany({
        where: { cancelledAt: null, OR: [{ endsAt: null }, { endsAt: { gt: realNow } }] },
        select: { id: true, teacherId: true, roomId: true, startsAt: true, endsAt: true, cancelledAt: true },
      }),
    ]);
    const map: DynamicData['assignments'] = new Map();
    for (const a of assignments) {
      const list = map.get(a.teacherId) ?? [];
      list.push(a);
      map.set(a.teacherId, list);
    }
    return {
      present: new Set(open.map((o) => o.teacherId)),
      openAttendance: new Map(open.map((o) => [o.teacherId, { checkInAt: o.checkInAt }])),
      assignments: map,
      away: new Map(open.filter((o) => o.awayPlace && o.awayUntil).map((o) => [o.teacherId, { place: o.awayPlace!, until: o.awayUntil!, roomId: o.awayRoomId }])),
    };
  }

  private locate(st: StaticData, t: StaticTeacher, present: boolean, dyn: DynamicData, eff: { dayOfWeek: number; minutes: number; now: Date }, schedule: Awaited<ReturnType<AppContext['settings']['schedule']>>): SnapshotLocation {
    const loc = computeLocation({
      kind: t.kind,
      present,
      dayOfWeek: eff.dayOfWeek,
      minutes: eff.minutes,
      now: eff.now,
      schedule,
      timetable: t.timetable,
      assignments: dyn.assignments.get(t.id) ?? [],
      away: dyn.away.get(t.id) ?? null,
      rooms: st.special,
    });
    const idx = loc.roomId ? st.roomIndex.get(loc.roomId) : undefined;
    return {
      ...loc,
      buildingKind: idx?.buildingKind ?? null,
      floorId: idx?.floorId ?? null,
      roomName: idx?.room.name ?? (loc.roomLabel ? `Каб. ${loc.roomLabel}` : null),
    };
  }

  /** Полный снимок для монитора и кабинета директора. */
  async snapshot(): Promise<MonitorSnapshot> {
    const realNow = this.ctx.clock.now();
    const [st, dyn, schedule, monitor, sim, eff] = await Promise.all([
      this.loadStatic(),
      this.loadDynamic(realNow),
      this.ctx.settings.schedule(),
      this.ctx.settings.monitor(),
      this.ctx.settings.simulation(),
      this.ctx.settings.effectiveTime(realNow),
    ]);
    const teachers: SnapshotTeacher[] = st.teachers.map((t) => {
      const present = sim ? (sim.assumeAllPresent ? !isDayEnded(schedule, eff.minutes) : dyn.present.has(t.id)) : dyn.present.has(t.id);
      const location = this.locate(st, t, present, dyn, eff, schedule);
      return {
        id: t.id,
        firstName: t.firstName,
        lastName: t.lastName,
        positionTitle: t.positionTitle,
        subject: t.subject,
        kind: t.kind,
        avatarUrl: t.avatarUrl,
        present: location.present,
        location,
      };
    });
    const period = describePeriod(schedule, eff.dayOfWeek, eff.minutes);
    const body = {
      clock: { simulated: eff.simulated, date: eff.date, dayOfWeek: eff.dayOfWeek, minutes: eff.minutes, seconds: eff.seconds, serverTime: realNow.toISOString() },
      period,
      buildings: st.buildings,
      teachers,
      // Ушедшие за территорию школы не считаются «в школе»
      presentCount: teachers.filter((t) => t.present && t.location.awayPlace !== 'OFF_SITE').length,
      totalCount: teachers.length,
      monitor,
      simulation: sim ? { enabled: true, assumeAllPresent: sim.assumeAllPresent } : null,
      day: { meals: schedule.meals.filter((m) => m.enabled), endOfDay: schedule.endOfDay, lessons: schedule.lessons, isSchoolDay: schedule.schoolDays.includes(eff.dayOfWeek) },
    };
    const hash = sha256(JSON.stringify({ ...body, clock: { ...body.clock, seconds: 0, serverTime: '' } })).slice(0, 16);
    return { hash, ...body };
  }

  /** Состояние для личного кабинета учителя (всегда по реальному времени и реальным отметкам). */
  async teacherState(teacherId: string) {
    const realNow = this.ctx.clock.now();
    const [st, dyn, schedule] = await Promise.all([this.loadStatic(), this.loadDynamic(realNow), this.ctx.settings.schedule()]);
    let t = st.teachers.find((x) => x.id === teacherId);
    if (!t) {
      this.invalidate();
      t = (await this.loadStatic()).teachers.find((x) => x.id === teacherId);
      if (!t) return null;
    }
    const local = toLocal(realNow);
    const dayEnded = isDayEnded(schedule, local.minutes);
    // С 17:00 учитель «Не в школе» сразу, даже если автоматический выход ещё не записан в базу
    const present = dyn.present.has(teacherId) && !dayEnded;
    const location = this.locate(st, t, present, dyn, { dayOfWeek: local.dayOfWeek, minutes: local.minutes, now: realNow }, schedule);
    const blocked = checkInBlock(schedule, local.dayOfWeek, local.minutes);
    const todayLessons = t.timetable
      .filter((e) => e.dayOfWeek === local.dayOfWeek)
      .sort((a, b) => a.lessonNumber - b.lessonNumber)
      .map((e) => {
        const slot = schedule.lessons.find((l) => l.number === e.lessonNumber);
        return { number: e.lessonNumber, start: slot?.start ?? '', end: slot?.end ?? '', className: e.className, roomLabel: e.roomLabel, roomKnown: !!e.roomId };
      });
    const lastToday = await this.ctx.prisma.attendance.findFirst({
      where: { teacherId, date: local.date },
      orderBy: { checkInAt: 'desc' },
    });
    return {
      teacher: {
        id: t.id,
        firstName: t.firstName,
        lastName: t.lastName,
        login: t.login,
        positionTitle: t.positionTitle,
        subject: t.subject,
        kind: t.kind,
        classes: t.classes,
        avatarUrl: t.avatarUrl,
      },
      present,
      attendance: lastToday
        ? { checkInAt: lastToday.checkInAt.toISOString(), checkOutAt: lastToday.checkOutAt?.toISOString() ?? null, checkOutReason: lastToday.checkOutReason }
        : null,
      canCheckIn: !present && !blocked,
      checkInBlockedReason: !present && blocked ? blocked.message : null,
      location,
      period: describePeriod(schedule, local.dayOfWeek, local.minutes),
      clock: { date: local.date, dayOfWeek: local.dayOfWeek, minutes: local.minutes, serverTime: realNow.toISOString() },
      todayLessons,
      hasTimetable: t.timetable.length > 0,
    };
  }

  // ───────────────────────── Посещаемость ─────────────────────────

  /**
   * Автоматический выход: закрывает отметки прошлых дней и, начиная с 17:00 (endOfDay), отметки текущего дня.
   * Идемпотентна и безопасна при перезапуске сервера: работает по состоянию базы, а не по таймеру «ровно в 17:00».
   */
  async autoCheckout(): Promise<number> {
    const { prisma } = this.ctx;
    const now = this.ctx.clock.now();
    const local = toLocal(now);
    const schedule = await this.ctx.settings.schedule();
    const stale = await prisma.attendance.updateMany({
      where: { checkOutAt: null, date: { lt: local.date } },
      data: { checkOutAt: now, checkOutReason: 'AUTO_END_OF_DAY' },
    });
    let today = 0;
    if (local.minutes >= parseHM(schedule.endOfDay)) {
      const r = await prisma.attendance.updateMany({
        where: { checkOutAt: null, date: local.date },
        data: { checkOutAt: now, checkOutReason: 'AUTO_END_OF_DAY' },
      });
      today = r.count;
      const state = await prisma.systemState.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
      if (state.lastAutoCheckoutDate !== local.date) {
        await prisma.systemState.update({ where: { id: 1 }, data: { lastAutoCheckoutDate: local.date } });
        const { audit } = await import('../lib/audit');
        await audit(this.ctx, null, {
          action: 'attendance.auto_checkout',
          summary: `Автоматическое завершение дня в ${schedule.endOfDay}: отмечено «Не в школе» — ${today}`,
          details: { date: local.date, count: today },
        });
      }
    }
    const total = stale.count + today;
    if (total > 0) logger.info('Автоматический выход', { date: local.date, closed: total });
    return total;
  }

  // ───────────────────────── Планировщик и рассылка ─────────────────────────

  start() {
    this.stopped = false;
    void this.tick();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private scheduleNext() {
    if (this.stopped) return;
    const now = Date.now();
    // Просыпаемся не реже интервала и обязательно сразу после смены минуты (граница уроков и обеда).
    const toNextMinute = 60_000 - (now % 60_000) + 250;
    const delay = Math.min(this.ctx.config.SCHEDULER_INTERVAL_MS, toNextMinute);
    this.timer = setTimeout(() => void this.tick(), delay);
  }

  async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.syncVersion();
      await this.autoCheckout();
      await this.expireSimulation();
      await this.publish(false);
    } catch (e) {
      logger.error('Ошибка планировщика', { err: String((e as Error)?.stack ?? e) });
    } finally {
      this.ticking = false;
      this.scheduleNext();
    }
  }

  /** Пересчитать и разослать состояние. force — отправить даже без изменений. */
  async publish(force = true) {
    if (!this.io) return;
    const liveRoom = this.io.sockets.adapter.rooms.get('live');
    if (liveRoom && liveRoom.size > 0) {
      const snap = await this.snapshot();
      if (force || snap.hash !== this.lastHash) {
        this.lastHash = snap.hash;
        this.io.to('live').emit('state', snap);
      }
    }
    for (const [room, members] of this.io.sockets.adapter.rooms) {
      if (!room.startsWith('teacher:') || members.size === 0) continue;
      const teacherId = room.slice('teacher:'.length);
      const state = await this.teacherState(teacherId);
      if (!state) continue;
      const h = sha256(JSON.stringify({ ...state, clock: { ...state.clock, serverTime: '' } }));
      if (force || this.teacherHashes.get(teacherId) !== h) {
        this.teacherHashes.set(teacherId, h);
        this.io.to(room).emit('teacher:state', state);
      }
    }
  }

  /** Вызывается после любых изменений данных. */
  async changed(opts: { staticData?: boolean } = {}) {
    try {
      if (opts.staticData) await this.bumpVersion();
      await this.publish(true);
    } catch (e) {
      logger.error('Ошибка рассылки состояния', { err: String(e) });
    }
  }

  emitToDirectors(event: string, payload: unknown) {
    this.io?.to('directors').emit(event, payload);
  }

  disconnectSessions(sessionIds: string[]) {
    if (!this.io || sessionIds.length === 0) return;
    const ids = new Set(sessionIds);
    for (const socket of this.io.sockets.sockets.values()) {
      if (ids.has(socket.data.sessionId)) {
        socket.emit('session:revoked');
        socket.disconnect(true);
      }
    }
  }
}

export { isAssignmentActive };
