import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, BookOpen, Clock, DoorOpen, Footprints, Info, LogIn, LogOut, MapPin, School, Trees, Undo2, Users } from 'lucide-react';
import { useNavigate } from 'react-router';
import { teacherApi } from '../lib/api';
import { REASON_LABEL, KIND_LABEL, awayText, periodText, fmtTime, type AwayPlace, type TeacherState } from '../lib/types';
import { Avatar } from '../components/Avatar';
import { Alert, Badge, Button, Modal, useToast } from '../components/ui';

/** Варианты «На сколько» для кнопки «Отошёл» (минуты) */
const AWAY_DURATIONS = [5, 10, 15, 30, 45, 60, 90, 120, 180];
type AwayRoom = { id: string; code: string; name: string; floor: string };
const durationLabel =(m: number) => (m < 60 ? `${m} мин` : m % 60 ? `${Math.floor(m / 60)},5 ч` : `${m / 60} ч`);

export function TeacherHome({ state, onState }: { state: TeacherState; onState: (s: TeacherState) => void }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const t = state.teacher;
  const loc = state.location;
  const away = state.present && loc.reason === 'AWAY';
  const [awayOpen, setAwayOpen] = useState(false);
  const [awayPlace, setAwayPlace] = useState<AwayPlace>('ON_SITE');
  const [awayMinutes, setAwayMinutes] = useState(15);
  const [awayRoom, setAwayRoom] = useState('');
  const [rooms, setRooms] = useState<AwayRoom[] | null>(null);

  const loadRooms = async () => {
    if (rooms) return;
    try {
      setRooms(await teacherApi.get<AwayRoom[]>('/api/teacher/rooms'));
    } catch (e) {
      toast('error', (e as Error).message);
    }
  };

  // «205», «каб. 205», «Кабинет 205», «Учительская» → кабинет из списка
  const resolveRoom = (text: string) => {
    const q = text.trim().toLowerCase().replace(/^(каб\.?|кабинет|xona)\s*/, '').replace(/\s+/g, '');
    if (!q || !rooms) return null;
    return rooms.find((r) => r.code.toLowerCase().replace(/\s+/g, '') === q) ?? rooms.find((r) => r.name.toLowerCase().replace(/\s+/g, '') === q) ?? null;
  };

  const goAway = async () => {
    let roomId: string | undefined;
    if (awayPlace === 'ROOM') {
      const room = resolveRoom(awayRoom);
      if (!room) return toast('error', 'Выберите кабинет из списка.');
      roomId = room.id;
    }
    setBusy(true);
    try {
      const next = await teacherApi.post<TeacherState>('/api/teacher/away', { minutes: awayMinutes, place: awayPlace, roomId });
      onState(next);
      setAwayOpen(false);
      toast('success', 'Отмечено: вы отошли');
      if ('vibrate' in navigator) navigator.vibrate?.(30);
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const comeBack = async () => {
    setBusy(true);
    try {
      onState(await teacherApi.del<TeacherState>('/api/teacher/away'));
      toast('success', 'Отмечено: вы вернулись');
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async () => {
    setBusy(true);
    try {
      const next = await teacherApi.post<TeacherState>(state.present ? '/api/teacher/check-out' : '/api/teacher/check-in');
      onState(next);
      toast('success', next.present ? 'Отмечено: вы в школе' : 'Отмечено: вы вышли из школы');
      if ('vibrate' in navigator) navigator.vibrate?.(30);
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
      {/* Профиль */}
      <div className="card flex items-center gap-4 p-5">
        <Avatar name={t} url={t.avatarUrl} size={68} />
        <div className="min-w-0">
          <div className="truncate text-xl font-bold leading-tight">
            {t.lastName} {t.firstName}
          </div>
          <div className="mt-0.5 truncate text-sm text-slate-500">
            {t.subject ?? t.positionTitle}
            {t.kind !== 'TEACHER' && ` · ${KIND_LABEL[t.kind]}`}
          </div>
          <div className="mt-2">
            <AnimatePresence mode="wait">
              <motion.span key={String(state.present)} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="inline-block">
                {state.present ? <Badge color="green">{`● В школе с ${fmtTime(state.attendance?.checkInAt)}`}</Badge> : <Badge>Не в школе</Badge>}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Кнопка присутствия: показывается только одна */}
      <AnimatePresence mode="wait" initial={false}>
        {state.present ? (
          <motion.div key="out" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-3">
            {away ? (
              // Учитель отошёл: куда и до скольки, кнопка «Я вернулся»
              <div className="rounded-3xl border border-amber-300/70 bg-amber-50 p-4 dark:border-amber-400/25 dark:bg-amber-500/10">
                <div className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-200">
                  <Footprints className="h-5 w-5" /> Вы отошли
                </div>
                <div className="mt-1 text-sm text-amber-800 dark:text-amber-300">{awayText(loc)}</div>
                <Button size="lg" variant="success" className="mt-3 h-14 w-full !rounded-2xl text-lg" loading={busy} onClick={comeBack} icon={<Undo2 className="h-5 w-5" />}>
                  Я вернулся
                </Button>
              </div>
            ) : (
              <Button variant="warning" size="lg" className="h-14 w-full !rounded-3xl text-lg" disabled={busy} onClick={() => setAwayOpen(true)} icon={<Footprints className="h-5 w-5" />}>
                Отошёл
              </Button>
            )}
            <Button variant="secondary" size="lg" className="h-14 w-full !rounded-3xl text-lg" loading={busy} onClick={toggle} icon={<LogOut className="h-5 w-5" />}>
              Выйти из школы
            </Button>
          </motion.div>
        ) : (
          <motion.div key="in" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
            <Button
              size="lg"
              className="h-16 w-full !rounded-3xl bg-gradient-to-r from-brand-600 to-indigo-600 text-lg shadow-xl"
              loading={busy}
              disabled={!state.canCheckIn}
              onClick={toggle}
              icon={<LogIn className="h-5 w-5" />}
            >
              Я в школе
            </Button>
            {state.checkInBlockedReason && (
              <p className="mt-3 flex items-center justify-center gap-2 rounded-2xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-center text-sm font-medium text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200">
                <Clock className="h-4 w-4 shrink-0" />
                {state.checkInBlockedReason}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Текущее местоположение */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card col-span-2 p-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <MapPin className="h-4 w-4" /> Текущий кабинет
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={`${loc.roomName}-${loc.reason}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <div className="mt-2 text-2xl font-bold">{away ? REASON_LABEL.AWAY : state.present ? (loc.roomName ?? '—') : '—'}</div>
              <div className="mt-1 text-sm text-slate-500">{away ? awayText(loc) : state.present ? REASON_LABEL[loc.reason] : 'Нажмите «Я в школе», когда придёте'}</div>
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Users className="h-4 w-4" /> Класс
          </div>
          <div className="mt-2 text-xl font-bold">{loc.className ?? '—'}</div>
          <div className="text-xs text-slate-500">{loc.lessonNumber ? `${loc.lessonNumber} урок` : 'Сейчас нет урока'}</div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <ArrowRight className="h-4 w-4" /> Следующий урок
          </div>
          {loc.nextLesson ? (
            <>
              <div className="mt-2 text-xl font-bold">
                {loc.nextLesson.className} · {loc.nextLesson.roomLabel}
              </div>
              <div className="text-xs text-slate-500">
                {loc.nextLesson.number} урок в {loc.nextLesson.start}
              </div>
            </>
          ) : (
            <div className="mt-2 text-sm text-slate-500">Сегодня уроков больше нет</div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600 dark:bg-white/5 dark:text-slate-300">
        <Clock className="h-4 w-4 shrink-0" /> {periodText(state.period)}
      </div>

      {/* Сегодняшние уроки */}
      <div className="card p-5">
        <div className="mb-3 flex items-center gap-2 font-semibold">
          <BookOpen className="h-5 w-5 text-brand-500" /> Уроки сегодня
        </div>
        {!state.hasTimetable ? (
          <Alert kind="info">
            Расписание ещё не загружено.{' '}
            <button className="font-semibold underline" onClick={() => navigate('/teacher/schedule')}>
              Загрузить расписание
            </button>
          </Alert>
        ) : state.todayLessons.length === 0 ? (
          <div className="text-sm text-slate-500">Сегодня по расписанию уроков нет.</div>
        ) : (
          <ul className="space-y-2">
            {state.todayLessons.map((l) => {
              const current = state.location.lessonNumber === l.number && state.period.kind === 'LESSON';
              return (
                <li key={l.number} className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${current ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/25' : 'bg-slate-50 dark:bg-white/[0.03]'}`}>
                  <span className={`flex h-8 w-8 items-center justify-center rounded-xl text-sm font-bold ${current ? 'bg-white/20' : 'bg-white shadow-sm dark:bg-white/10'}`}>{l.number}</span>
                  <span className="text-sm tabular-nums opacity-80">
                    {l.start}–{l.end}
                  </span>
                  <span className="ml-auto font-semibold">{l.className}</span>
                  <span className={`flex items-center gap-1 rounded-lg px-2 py-0.5 text-sm font-semibold ${current ? 'bg-white/20' : 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300'}`}>
                    <DoorOpen className="h-3.5 w-3.5" /> {l.roomLabel}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {t.classes.length > 0 && (
        <div className="card p-5">
          <div className="mb-2 flex items-center gap-2 font-semibold">
            <School className="h-5 w-5 text-brand-500" /> Мои классы
          </div>
          <div className="flex flex-wrap gap-1.5">
            {t.classes.map((c) => (
              <Badge key={c} color="blue">
                {c}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <p className="flex items-start gap-2 px-1 text-xs text-slate-400">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Местоположение на мониторе — расчётное, по расписанию и назначениям директора. GPS не используется. В 17:00 отметка автоматически снимается.
      </p>

      {/* «Отошёл»: куда и на сколько */}
      <Modal open={awayOpen} onClose={() => setAwayOpen(false)} title="Отошёл">
        <div className="space-y-5">
          <div>
            <div className="label">Куда</div>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ['ON_SITE', 'На территории школы', School],
                  ['ROOM', 'В кабинет', DoorOpen],
                  ['OFF_SITE', 'За территорию школы', Trees],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setAwayPlace(value);
                    if (value === 'ROOM') void loadRooms();
                  }}
                  className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 px-1.5 py-3 text-center text-[13px] font-semibold leading-tight transition ${
                    awayPlace === value ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200' : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-white/10 dark:text-slate-300'
                  }`}
                >
                  <Icon className="h-6 w-6" />
                  {label}
                </button>
              ))}
            </div>
            {awayPlace === 'ROOM' && (
              <div className="mt-3">
                <div className="label">Номер кабинета</div>
                <input
                  className="input text-lg font-semibold"
                  list="rl-away-rooms"
                  inputMode="text"
                  placeholder="205"
                  value={awayRoom}
                  onChange={(e) => setAwayRoom(e.target.value)}
                  autoFocus
                />
                <datalist id="rl-away-rooms">
                  {(rooms ?? []).map((r) => (
                    <option key={r.id} value={r.code}>
                      {r.name} · {r.floor}
                    </option>
                  ))}
                </datalist>
              </div>
            )}
          </div>
          <div>
            <div className="label">На сколько</div>
            <div className="grid grid-cols-3 gap-2">
              {AWAY_DURATIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setAwayMinutes(m)}
                  className={`rounded-xl border-2 py-2.5 text-sm font-semibold transition ${
                    awayMinutes === m ? 'border-brand-500 bg-brand-600 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-white/10 dark:text-slate-300'
                  }`}
                >
                  {durationLabel(m)}
                </button>
              ))}
            </div>
          </div>
          <Button size="lg" className="h-14 w-full !rounded-2xl text-lg" loading={busy} onClick={goAway} icon={<Footprints className="h-5 w-5" />}>
            {`Отошёл на ${durationLabel(awayMinutes)}`}
          </Button>
        </div>
      </Modal>
    </motion.div>
  );
}
