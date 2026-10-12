import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, BookOpen, Clock, DoorOpen, Info, LogIn, LogOut, MapPin, School, Users } from 'lucide-react';
import { useNavigate } from 'react-router';
import { teacherApi } from '../lib/api';
import { REASON_LABEL, KIND_LABEL, periodText, fmtTime, type TeacherState } from '../lib/types';
import { Avatar } from '../components/Avatar';
import { Alert, Badge, Button, useToast } from '../components/ui';

export function TeacherHome({ state, onState }: { state: TeacherState; onState: (s: TeacherState) => void }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const t = state.teacher;
  const loc = state.location;

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
                {state.present ? <Badge color="green">● В школе с {fmtTime(state.attendance?.checkInAt)}</Badge> : <Badge>Не в школе</Badge>}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Кнопка присутствия: показывается только одна */}
      <AnimatePresence mode="wait" initial={false}>
        {state.present ? (
          <motion.div key="out" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
            <Button variant="secondary" size="lg" className="h-16 w-full !rounded-3xl text-lg" loading={busy} onClick={toggle} icon={<LogOut className="h-5 w-5" />}>
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
              <div className="mt-2 text-2xl font-bold">{state.present ? loc.roomName ?? '—' : '—'}</div>
              <div className="mt-1 text-sm text-slate-500">{state.present ? REASON_LABEL[loc.reason] : 'Нажмите «Я в школе», когда придёте'}</div>
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
    </motion.div>
  );
}
