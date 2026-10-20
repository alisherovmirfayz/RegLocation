import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { Baby, Building2, CalendarClock, ChevronLeft, ChevronRight, FlaskConical, Info, LogOut, Trophy, Users, Utensils, Wifi, WifiOff } from 'lucide-react';
import { useLive, type ConnectionState, type LiveEvent } from '../lib/useLive';
import { logout } from '../lib/api';
import type { Snapshot } from '../lib/types';
import { Logo } from '../components/Logo';
import { LangSwitch } from '../components/LangSwitch';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { BuildingMap } from '../monitor/BuildingMap';
import { TeacherList } from '../monitor/TeacherList';
import { InfoTicker, Particles, PeriodProgress, SpotlightCard, useIdle, useSpotlight } from '../monitor/Ambient';
import { CheckInReminder } from '../monitor/CheckInReminder';

const DAYS = ['', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Часы: время сервера/тестового режима + прошедшее локально время. */
function useClock(snapshot: Snapshot | null, receivedAt: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!snapshot) return null;
  const elapsed = Math.floor((now - receivedAt) / 1000);
  const total = snapshot.clock.minutes * 60 + snapshot.clock.seconds + elapsed;
  const [y, mo, d] = snapshot.clock.date.split('-').map(Number);
  return {
    time: `${hm(Math.floor(total / 60) % 1440)}`,
    minutes: Math.floor(total / 60) % 1440,
    sec: total % 60,
    seconds: String(total % 60).padStart(2, '0'),
    date: `${DAYS[snapshot.clock.dayOfWeek]}, ${d} ${MONTHS[(mo ?? 1) - 1]} ${y}`,
  };
}

function ConnectionBadge({ state }: { state: ConnectionState }) {
  const cfg = {
    online: { text: 'Онлайн', cls: 'text-emerald-500', Icon: Wifi },
    connecting: { text: 'Подключение…', cls: 'text-amber-500', Icon: Wifi },
    reconnecting: { text: 'Переподключение…', cls: 'text-amber-500', Icon: Wifi },
    offline: { text: 'Нет связи', cls: 'text-rose-500', Icon: WifiOff },
  }[state];
  return (
    <div className="flex items-center gap-2 rounded-xl bg-white/70 px-3 py-2 text-sm font-medium shadow-sm dark:bg-white/5">
      <span className={`pulse-dot relative inline-block h-2.5 w-2.5 rounded-full bg-current ${cfg.cls}`} />
      <cfg.Icon className={`h-4 w-4 ${cfg.cls}`} />
      <span className="text-slate-600 dark:text-slate-300">{cfg.text}</span>
    </div>
  );
}

function EventFeed({ events }: { events: LiveEvent[] }) {
  const color: Record<LiveEvent['kind'], string> = {
    arrive: 'bg-emerald-500',
    leave: 'bg-slate-400',
    move: 'bg-violet-500',
    period: 'bg-brand-500',
    info: 'bg-sky-500',
  };
  return (
    <div className="pointer-events-none absolute bottom-20 left-4 z-40 flex w-80 flex-col-reverse gap-2">
      <AnimatePresence initial={false}>
        {events.map((e) => (
          <motion.div
            key={e.id}
            layout
            initial={{ opacity: 0, y: 24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="flex items-center gap-2.5 rounded-2xl border border-white/60 bg-white/90 px-3.5 py-2.5 text-sm shadow-xl shadow-black/10 backdrop-blur dark:border-white/10 dark:bg-slate-900/85"
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${color[e.kind]}`} />
            <span className="text-slate-700 dark:text-slate-200">{e.text}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Медленная автопрокрутка схемы, когда монитор никто не трогает. */
function useIdleScroll(ref: React.RefObject<HTMLDivElement | null>, enabled: boolean, idleSeconds: number, deps: unknown) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let lastInput = Date.now();
    let dir = 1;
    let raf = 0;
    let prev = performance.now();
    let pauseUntil = 0;
    const onInput = () => (lastInput = Date.now());
    const events = ['wheel', 'pointerdown', 'pointermove', 'keydown', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, onInput, { passive: true }));
    let acc = 0;
    const step = (t: number) => {
      const dt = Math.min(100, t - prev);
      prev = t;
      if (Date.now() - lastInput > idleSeconds * 1000 && t > pauseUntil && el.scrollHeight > el.clientHeight + 4) {
        acc += (dt / 1000) * 22 * dir; // ~22 px/с
        const whole = Math.trunc(acc);
        if (whole !== 0) {
          el.scrollTop += whole;
          acc -= whole;
        }
        if (dir > 0 && el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
          dir = -1;
          pauseUntil = t + 6000;
        } else if (dir < 0 && el.scrollTop <= 0) {
          dir = 1;
          pauseUntil = t + 6000;
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      events.forEach((e) => window.removeEventListener(e, onInput));
    };
  }, [ref, enabled, idleSeconds, deps]);
}

const VIEWS = [
  { kind: 'SCHOOL', label: 'Школа', Icon: Building2, pill: 'bg-brand-600 shadow-brand-600/30' },
  { kind: 'CANTEEN', label: 'Столовая', Icon: Utensils, pill: 'bg-orange-500 shadow-orange-500/30' },
  { kind: 'STADIUM', label: 'Стадион', Icon: Trophy, pill: 'bg-emerald-600 shadow-emerald-600/30' },
  { kind: 'KINDERGARTEN', label: 'Детский сад', Icon: Baby, pill: 'bg-pink-500 shadow-pink-500/30' },
] as const;

export function MonitorPage() {
  const navigate = useNavigate();
  const { snapshot, connection, events, receivedAt } = useLive(() => navigate('/monitor/login', { replace: true }));
  const [view, setView] = useState<'SCHOOL' | 'CANTEEN' | 'STADIUM' | 'KINDERGARTEN'>('SCHOOL');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [epochs, setEpochs] = useState(new Map<string, number>());
  const prevRooms = useRef(new Map<string, string | null>());
  const scrollRef = useRef<HTMLDivElement>(null);
  // Список учителей спрятан за стрелкой; пока он закрыт, схема показывает 4 этажа (2 × 2)
  const [listOpen, setListOpen] = useState(() => {
    try {
      return localStorage.getItem('rl.monitor.list') === 'open';
    } catch {
      return false;
    }
  });
  const toggleList = () =>
    setListOpen((v) => {
      try {
        localStorage.setItem('rl.monitor.list', v ? 'closed' : 'open');
      } catch {
        /* приватный режим браузера */
      }
      return !v;
    });
  const clock = useClock(snapshot, receivedAt);

  // Тема монитора из настроек директора
  useEffect(() => {
    if (!snapshot) return;
    document.documentElement.classList.toggle('dark', snapshot.monitor.theme === 'dark');
  }, [snapshot?.monitor.theme]);

  // Перемещение по расписанию — новая «эпоха» (исчезновение/появление), ручное — плавный переход по карте
  useEffect(() => {
    if (!snapshot) return;
    setEpochs((old) => {
      const next = new Map(old);
      for (const t of snapshot.teachers) {
        const prevRoom = prevRooms.current.get(t.id);
        const room = t.present ? t.location.roomId : null;
        if (prevRoom !== undefined && prevRoom !== room && t.location.reason !== 'MANUAL') next.set(t.id, (next.get(t.id) ?? 0) + 1);
        prevRooms.current.set(t.id, room);
      }
      return next;
    });
  }, [snapshot?.hash]);

  // При выборе учителя переключаемся на нужное здание
  useEffect(() => {
    if (!focusId || !snapshot) return;
    const t = snapshot.teachers.find((x) => x.id === focusId);
    if (t?.location.buildingKind && t.location.buildingKind !== view) setView(t.location.buildingKind);
    const timer = setTimeout(() => setFocusId(null), 12_000);
    return () => clearTimeout(timer);
  }, [focusId]);

  // Живой режим: когда монитор никто не трогает — обход учителей с карточкой и прокруткой к ним,
  // а если в школе никого нет — медленная автопрокрутка схемы.
  const idle = useIdle(snapshot?.monitor.idleAfterSeconds ?? 90);
  const attract = idle && !!snapshot?.monitor.idleAutoScroll && !focusId;
  const spotlight = useSpotlight(snapshot?.teachers ?? [], attract);
  useEffect(() => {
    if (spotlight?.location.buildingKind && spotlight.location.buildingKind !== view) setView(spotlight.location.buildingKind);
  }, [spotlight?.id]);
  useIdleScroll(scrollRef, attract && !spotlight, snapshot?.monitor.idleAfterSeconds ?? 90, view);

  const building = useMemo(() => snapshot?.buildings.find((b) => b.kind === view), [snapshot, view]);
  const countIn = (kind: string) => snapshot?.teachers.filter((t) => t.present && t.location.buildingKind === kind).length ?? 0;
  // Вкладки зданий; стадион — часть школы, отдельная вкладка показывается только для старой схемы
  const views = VIEWS.filter((v) => snapshot?.buildings.some((b) => b.kind === v.kind));

  if (!snapshot) {
    return (
      <div className="flex h-full items-center justify-center">
        <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 2 }}>
          <Logo size={64} subtitle="Загрузка схемы школы…" />
        </motion.div>
      </div>
    );
  }

  const p = snapshot.period;
  const periodText =
    p.kind === 'LESSON' && p.start !== undefined && p.end !== undefined ? `${p.lessonNumber} урок · ${hm(p.start)}–${hm(p.end)}` :
    p.kind === 'MEAL' && p.start !== undefined && p.end !== undefined ? `${p.title} · ${hm(p.start)}–${hm(p.end)}` :
    p.nextLesson ? `${p.title} · далее ${p.nextLesson.number} урок в ${p.nextLesson.start}` : p.title;

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {snapshot.monitor.ambientEffects && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="ambient left-[-10%] top-[-20%] h-[60vh] w-[50vw] bg-brand-500/20 dark:bg-brand-500/25" />
          <div className="ambient bottom-[-25%] right-[10%] h-[55vh] w-[45vw] bg-sky-400/15 dark:bg-indigo-500/20" style={{ animationDelay: '-14s' }} />
          {view === 'CANTEEN' && <div className="ambient left-[30%] top-[30%] h-[40vh] w-[40vw] bg-orange-400/15" style={{ animationDelay: '-7s' }} />}
          {view === 'STADIUM' && <div className="ambient left-[30%] top-[30%] h-[40vh] w-[40vw] bg-emerald-400/15" style={{ animationDelay: '-7s' }} />}
          {view === 'KINDERGARTEN' && <div className="ambient left-[30%] top-[30%] h-[40vh] w-[40vw] bg-pink-400/15" style={{ animationDelay: '-7s' }} />}
        </div>
      )}

      {/* Шапка */}
      <header className="relative z-20 flex items-center gap-4 border-b border-slate-200/70 bg-white/70 px-6 py-3 backdrop-blur-xl dark:border-white/5 dark:bg-brand-950/60">
        <Logo size={46} subtitle="Монитор ресепшена" />
        <div className="ml-6 flex rounded-2xl bg-slate-100 p-1 dark:bg-white/5">
          {views.map(({ kind: k, label, Icon, pill }) => (
            <button
              key={k}
              onClick={() => setView(k)}
              className={`relative flex items-center gap-2 rounded-xl px-5 py-2.5 text-base font-semibold transition-colors ${view === k ? 'text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'}`}
            >
              {view === k && (
                <motion.span layoutId="view-pill" className={`absolute inset-0 rounded-xl shadow-lg ${pill}`} transition={{ type: 'spring', stiffness: 300, damping: 28 }} />
              )}
              <span className="relative flex items-center gap-2">
                <Icon className="h-5 w-5" />
                {label}
                <span className={`rounded-full px-2 text-xs ${view === k ? 'bg-white/25' : 'bg-slate-200 dark:bg-white/10'}`}>{countIn(k)}</span>
              </span>
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={periodText}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold ${p.kind === 'MEAL' ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300' : 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200'}`}
          >
            <CalendarClock className="h-4 w-4" /> {periodText}
          </motion.div>
        </AnimatePresence>

        <div className="ml-auto flex items-center gap-4">
          {snapshot.clock.simulated && (
            <div className="flex items-center gap-2 rounded-xl bg-amber-400 px-3 py-2 text-sm font-bold text-amber-950 shadow-lg shadow-amber-400/30">
              <FlaskConical className="h-4 w-4" /> ТЕСТОВЫЙ РЕЖИМ
            </div>
          )}
          <div className="text-right">
            <div className="text-3xl font-bold leading-none tracking-tight tabular-nums">
              {clock?.time.slice(0, 2)}
              <span className="blink">:</span>
              {clock?.time.slice(3)}
              <span className="ml-0.5 text-lg text-slate-400">:{clock?.seconds}</span>
            </div>
            <div className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{clock?.date}</div>
          </div>
          <div className="rounded-2xl bg-emerald-500/10 px-4 py-2 text-center">
            <div className="text-2xl font-bold leading-none text-emerald-600 dark:text-emerald-400">
              <AnimatedNumber value={snapshot.presentCount} />
              <span className="text-base font-medium text-slate-400"> / {snapshot.totalCount}</span>
            </div>
            <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">в школе</div>
          </div>
          <LangSwitch />
          <ConnectionBadge state={connection} />
          <button
            onClick={async () => {
              if (!confirm('Выйти из монитора?')) return;
              await logout();
              navigate('/monitor/login', { replace: true });
            }}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10"
            title="Выйти"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      {clock && <PeriodProgress snapshot={snapshot} minutes={clock.minutes} seconds={clock.sec} />}

      {/* Основная область: схема; список учителей выдвигается справа по стрелке */}
      <main className="relative z-10 flex min-h-0 flex-1">
        <section className="relative min-h-0 min-w-0 flex-1 border-r border-slate-200/70 dark:border-white/5">
          {snapshot.monitor.ambientEffects && <Particles />}
          <div className="absolute left-4 top-3 z-30 flex items-center gap-1.5 rounded-lg bg-white/80 px-2.5 py-1 text-[11px] text-slate-500 shadow-sm backdrop-blur dark:bg-slate-900/70 dark:text-slate-400">
            <Info className="h-3.5 w-3.5" /> Расчётное местоположение по расписанию, а не подтверждённое физическое нахождение
          </div>
          <div ref={scrollRef} className="thin-scroll h-full overflow-y-auto scroll-smooth px-2 pt-10 pb-24">
            <AnimatePresence mode="wait">
              {building && (
                <motion.div
                  key={building.kind}
                  initial={{ opacity: 0, x: building.kind === 'SCHOOL' ? -60 : 60, filter: 'blur(6px)' }}
                  animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, x: building.kind === 'SCHOOL' ? -60 : 60, filter: 'blur(6px)' }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                >
                  <BuildingMap
                    building={building}
                    teachers={snapshot.teachers}
                    highlightOccupied={snapshot.monitor.highlightOccupied}
                    focusTeacherId={focusId ?? spotlight?.id ?? null}
                    scrollRef={scrollRef}
                    epochs={epochs}
                    // Школа — по 2 этажа в высоту экрана; столовая и стадион (один этаж) — крупно, на весь экран
                    maxFloorHeight={building.kind === 'SCHOOL' ? Math.max(240, (window.innerHeight - 260) / 2) : Math.max(300, window.innerHeight - 330)}
                    columns={listOpen || building.kind !== 'SCHOOL' ? 1 : 2}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <EventFeed events={events} />
          <SpotlightCard teacher={spotlight} />
          {clock && <InfoTicker snapshot={snapshot} minutes={clock.minutes} />}
          {clock && <CheckInReminder snapshot={snapshot} minutes={clock.minutes} />}
        </section>
        {/* Стрелка: открыть / закрыть список учителей */}
        <button
          onClick={toggleList}
          className="group relative z-20 flex w-11 shrink-0 flex-col items-center justify-center gap-3 border-r border-slate-200/70 bg-white/50 text-slate-500 backdrop-blur transition hover:bg-white/80 hover:text-brand-600 dark:border-white/5 dark:bg-white/[0.03] dark:text-slate-400 dark:hover:bg-white/[0.07] dark:hover:text-white"
          title={listOpen ? 'Скрыть список учителей' : 'Показать список учителей'}
          aria-expanded={listOpen}
        >
          {listOpen ? <ChevronRight className="h-6 w-6" /> : <ChevronLeft className="h-6 w-6 transition group-hover:-translate-x-0.5" />}
          <Users className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-widest [writing-mode:vertical-rl]">Учителя</span>
        </button>
        <AnimatePresence initial={false}>
          {listOpen && (
            <motion.aside
              key="list"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: '26vw', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="min-h-0 overflow-hidden bg-white/40 backdrop-blur-sm dark:bg-white/[0.02]"
            >
              <div className="h-full w-[26vw]">
                <TeacherList teachers={snapshot.teachers} showAbsent={snapshot.monitor.showAbsentInList} focusId={focusId} onFocus={setFocusId} />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
