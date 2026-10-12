import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { DEFAULT_SCHEDULE, ScheduleSettingsSchema, type ScheduleSettings } from './schedule';
import { toLocal, type LocalTime } from '../lib/time';

export const MonitorSettingsSchema = z.object({
  schoolTitle: z.string().min(1).max(80).default('Школа'),
  canteenTitle: z.string().min(1).max(80).default('Столовая'),
  /** Медленная автопрокрутка схемы, когда монитор никто не трогает */
  idleAutoScroll: z.boolean().default(true),
  idleAfterSeconds: z.number().int().min(15).max(3600).default(90),
  /** Тема монитора */
  theme: z.enum(['dark', 'light']).default('dark'),
  /** Показывать отсутствующих учителей в списке справа */
  showAbsentInList: z.boolean().default(true),
  /** Подсветка занятых кабинетов */
  highlightOccupied: z.boolean().default(true),
  /** Фоновые световые эффекты */
  ambientEffects: z.boolean().default(true),
});
export type MonitorSettings = z.infer<typeof MonitorSettingsSchema>;

export const SimulationSchema = z.object({
  enabled: z.boolean(),
  dayOfWeek: z.number().int().min(1).max(7),
  /** Минуты от полуночи на момент запуска */
  minutes: z.number().int().min(0).max(24 * 60 - 1),
  startedAt: z.string(),
  /** Считать всех активных учителей присутствующими (не меняя реальные отметки) */
  assumeAllPresent: z.boolean().default(true),
  startedBy: z.string().optional(),
});
export type Simulation = z.infer<typeof SimulationSchema>;

/** Тестовый режим автоматически выключается через это время. */
export const SIMULATION_MAX_MS = 4 * 60 * 60 * 1000;

export interface EffectiveTime extends LocalTime {
  simulated: boolean;
  now: Date;
}

export class SettingsService {
  private cache = new Map<string, unknown>();
  /** Вызывается после сохранения настройки — чтобы другие экземпляры сервера сбросили кеш. */
  onChange: (() => Promise<void>) | null = null;

  constructor(private prisma: PrismaClient) {}

  private async get<T>(key: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, fallback: T): Promise<T> {
    if (this.cache.has(key)) return this.cache.get(key) as T;
    const row = await this.prisma.setting.findUnique({ where: { key } });
    let value = fallback;
    if (row) {
      const p = schema.safeParse(row.value);
      if (p.success) value = p.data;
    }
    this.cache.set(key, value);
    return value;
  }

  private async set<T>(key: string, value: T): Promise<void> {
    await this.prisma.setting.upsert({
      where: { key },
      create: { key, value: value as object },
      update: { value: value as object },
    });
    this.cache.set(key, value);
    await this.onChange?.();
  }

  invalidate() {
    this.cache.clear();
  }

  schedule() {
    return this.get<ScheduleSettings>('schedule', ScheduleSettingsSchema, DEFAULT_SCHEDULE);
  }
  setSchedule(s: ScheduleSettings) {
    return this.set('schedule', s);
  }
  monitor(): Promise<MonitorSettings> {
    return this.get<MonitorSettings>('monitor', MonitorSettingsSchema, MonitorSettingsSchema.parse({}));
  }
  setMonitor(s: MonitorSettings) {
    return this.set('monitor', s);
  }
  async simulation(): Promise<Simulation | null> {
    const s = await this.get<Simulation | null>('simulation', SimulationSchema.nullable(), null);
    return s?.enabled ? s : null;
  }
  setSimulation(s: Simulation | null) {
    return this.set('simulation', s);
  }
  async logoFileId(): Promise<string | null> {
    return this.get<string | null>('logoFileId', z.string().nullable(), null);
  }
  setLogoFileId(id: string | null) {
    return this.set('logoFileId', id);
  }

  /** Текущее «действующее» время: реальное либо смоделированное в тестовом режиме. */
  async effectiveTime(realNow: Date): Promise<EffectiveTime> {
    const sim = await this.simulation();
    if (!sim) return { ...toLocal(realNow), simulated: false, now: realNow };
    const elapsedMs = Math.max(0, realNow.getTime() - new Date(sim.startedAt).getTime());
    const total = sim.minutes * 60 + Math.floor(elapsedMs / 1000);
    const minutes = Math.min(Math.floor(total / 60), 24 * 60 - 1);
    // Ручные назначения — реальные действия директора, поэтому их сроки проверяются по реальному времени (now).
    return { date: toLocal(realNow).date, dayOfWeek: sim.dayOfWeek, minutes, seconds: total % 60, simulated: true, now: realNow };
  }
}
