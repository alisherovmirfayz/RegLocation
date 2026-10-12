import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, Clock, DoorOpen, Info, Sparkles, Users, Utensils } from 'lucide-react';
import type { Snapshot, Teacher } from '../lib/types';
import { Avatar } from '../components/Avatar';

const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const toMin = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const duration = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} ч ${min % 60} мин` : `${min} мин`);

/** true, если монитор никто не трогает дольше seconds */
export function useIdle(seconds: number) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let last = Date.now();
    const onInput = () => {
      last = Date.now();
      setIdle(false);
    };
    const events = ['wheel', 'pointerdown', 'pointermove', 'keydown', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, onInput, { passive: true }));
    const t = setInterval(() => setIdle(Date.now() - last > seconds * 1000), 1000);
    return () => {
      clearInterval(t);
      events.forEach((e) => window.removeEventListener(e, onInput));
    };
  }, [seconds]);
  return idle;
}

/** Обход присутствующих учителей по очереди, пока монитор в простое */
export function useSpotlight(teachers: Teacher[], active: boolean, intervalMs = 9000) {
  const present = useMemo(() => teachers.filter((t) => t.present && t.location.roomId), [teachers]);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!active || present.length === 0) return;
    const t = setInterval(() => setIndex((i) => i + 1), intervalMs);
    return () => clearInterval(t);
  }, [active, present.length, intervalMs]);
  if (!active || present.length === 0) return null;
  return present[index % present.length] ?? null;
}

const REASON: Record<string, string> = {
  LESSON: 'Урок по расписанию',
  MEAL: 'Обед / полдник',
  MANUAL: 'Назначено директором',
  FREE: 'Свободное время',
  DIRECTOR_OFFICE: 'Рабочий кабинет',
  HEAD_TEACHER_OFFICE: 'Рабочий кабинет',
  UNKNOWN_ROOM: 'Кабинет не найден в схеме',
};

export function SpotlightCard({ teacher, intervalMs = 9000 }: { teacher: Teacher | null; intervalMs?: number }) {
  return (
    <div className="pointer-events-none absolute bottom-20 right-6 z-40 w-[360px]">
      <AnimatePresence mode="wait">
        {teacher && (
          <motion.div
            key={teacher.id}
            initial={{ opacity: 0, y: 30, scale: 0.94, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -20, scale: 0.96, filter: 'blur(6px)' }}
            transition={{ type: 'spring', stiffness: 160, damping: 20 }}
            className="overflow-hidden rounded-3xl border border-white/60 bg-white/90 shadow-2xl shadow-brand-900/30 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/85"
          >
            <div className="flex items-center gap-4 p-5">
              <motion.div initial={{ rotate: -8, scale: 0.8 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.1 }}>
                <Avatar name={teacher} url={teacher.avatarUrl} size={72} className="!ring-4 !ring-brand-400/60" />
              </motion.div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-300">
                  <Sparkles className="h-3.5 w-3.5" /> Сейчас в школе
                </div>
                <div className="truncate text-xl font-bold leading-tight">
                  {teacher.lastName} {teacher.firstName}
                </div>
                <div className="truncate text-sm text-slate-500 dark:text-slate-400">{teacher.subject ?? teacher.positionTitle}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-px bg-slate-200/70 dark:bg-white/5">
              <div className="bg-white/90 px-5 py-3 dark:bg-slate-900/90">
                <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-slate-400">
                  <DoorOpen className="h-3.5 w-3.5" /> Где
                </div>
                <div className="truncate font-semibold">{teacher.location.roomName ?? '—'}</div>
              </div>
              <div className="bg-white/90 px-5 py-3 dark:bg-slate-900/90">
                <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-slate-400">
                  <BookOpen className="h-3.5 w-3.5" /> Класс
                </div>
                <div className="font-semibold">{teacher.location.className ?? '—'}</div>
              </div>
            </div>
            <div className="px-5 py-2.5 text-xs text-slate-500 dark:text-slate-400">{REASON[teacher.location.reason] ?? ''}</div>
            <motion.div className="h-1 bg-gradient-to-r from-brand-500 to-sky-400" initial={{ width: '0%' }} animate={{ width: '100%' }} transition={{ duration: intervalMs / 1000, ease: 'linear' }} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Сменяющиеся подсказки внизу схемы: текущий урок, до обеда, сколько учителей в школе… */
export function InfoTicker({ snapshot, minutes }: { snapshot: Snapshot; minutes: number }) {
  const items = useMemo(() => {
    const out: { icon: React.ReactNode; text: string }[] = [];
    const p = snapshot.period;
    if (p.kind === 'LESSON' && p.end !== undefined) out.push({ icon: <BookOpen className="h-4 w-4" />, text: `Идёт ${p.lessonNumber}-й урок · до звонка ${duration(Math.max(0, p.end - minutes))}` });
    if (p.kind === 'MEAL' && p.end !== undefined) out.push({ icon: <Utensils className="h-4 w-4" />, text: `${p.title} — все учителя в столовой · ещё ${duration(Math.max(0, p.end - minutes))}` });
    if (p.kind === 'BREAK' && p.nextLesson) out.push({ icon: <Clock className="h-4 w-4" />, text: `Перемена · ${p.nextLesson.number}-й урок начнётся в ${p.nextLesson.start}` });
    for (const m of snapshot.day?.meals ?? []) {
      const s = toMin(m.start);
      if (s > minutes && snapshot.day?.isSchoolDay) {
        out.push({ icon: <Utensils className="h-4 w-4" />, text: `${m.title} в ${m.start} · через ${duration(s - minutes)}` });
        break;
      }
    }
    out.push({ icon: <Users className="h-4 w-4" />, text: `В школе ${snapshot.presentCount} из ${snapshot.totalCount} учителей` });
    const busy = snapshot.teachers.filter((t) => t.present && t.location.reason === 'LESSON').length;
    if (busy) out.push({ icon: <BookOpen className="h-4 w-4" />, text: `Сейчас ведут уроки: ${busy}` });
    if (snapshot.day && snapshot.day.isSchoolDay && minutes < toMin(snapshot.day.endOfDay)) out.push({ icon: <Clock className="h-4 w-4" />, text: `Учебный день до ${snapshot.day.endOfDay}` });
    out.push({ icon: <Info className="h-4 w-4" />, text: 'Нажмите на учителя в списке справа, чтобы найти его на схеме' });
    out.push({ icon: <Info className="h-4 w-4" />, text: 'Местоположение — расчётное, по расписанию и назначениям директора' });
    return out;
  }, [snapshot, minutes]);

  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => x + 1), 7000);
    return () => clearInterval(t);
  }, []);
  const item = items[i % items.length]!;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center pb-4">
      <div className="flex h-11 min-w-[420px] items-center justify-center overflow-hidden rounded-2xl border border-white/60 bg-white/85 px-5 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/80">
        <AnimatePresence mode="wait">
          <motion.div
            key={item.text}
            initial={{ y: 22, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -22, opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            <span className="text-brand-500">{item.icon}</span>
            {item.text}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Тонкая полоса прогресса текущего урока или перемены под шапкой */
export function PeriodProgress({ snapshot, minutes, seconds }: { snapshot: Snapshot; minutes: number; seconds: number }) {
  const p = snapshot.period;
  let start: number | undefined = p.start;
  let end: number | undefined = p.end;
  if ((p.kind === 'BREAK' || p.kind === 'BEFORE_SCHOOL') && p.nextLesson) {
    end = toMin(p.nextLesson.start);
    const prev = [...(snapshot.day?.lessons ?? [])].map((l) => toMin(l.end)).filter((e) => e <= minutes).pop();
    start = prev ?? end - 30;
  }
  if (start === undefined || end === undefined || end <= start) return <div className="h-1" />;
  const pct = Math.min(100, Math.max(0, ((minutes + seconds / 60 - start) / (end - start)) * 100));
  const color = p.kind === 'MEAL' ? 'from-orange-400 to-amber-300' : p.kind === 'LESSON' ? 'from-brand-500 to-sky-400' : 'from-emerald-400 to-teal-300';
  return (
    <div className="relative h-1 w-full overflow-hidden bg-slate-200/60 dark:bg-white/5">
      <motion.div className={`absolute inset-y-0 left-0 bg-gradient-to-r ${color}`} animate={{ width: `${pct}%` }} transition={{ duration: 1, ease: 'linear' }} />
      <div className="absolute inset-y-0 right-2 hidden items-center text-[0px]">{hm(end)}</div>
    </div>
  );
}

/** Световые частицы и проходящий луч — лёгкие CSS-анимации (transform/opacity) */
export function Particles({ count = 14 }: { count?: number }) {
  const parts = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: `${(i * 97) % 100}%`,
        delay: `${-((i * 3.7) % 22)}s`,
        duration: `${18 + ((i * 5) % 14)}s`,
        dx: `${((i % 5) - 2) * 18}px`,
        size: 3 + (i % 4) * 2,
      })),
    [count],
  );
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div className="light-sweep" />
      {parts.map((p, i) => (
        <span
          key={i}
          className="particle"
          style={{ left: p.left, animationDelay: p.delay, animationDuration: p.duration, width: p.size, height: p.size, ['--dx' as string]: p.dx }}
        />
      ))}
    </div>
  );
}
