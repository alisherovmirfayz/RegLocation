import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { DoorOpen, MapPin, Search, Users, X } from 'lucide-react';
import { awayText, type Teacher } from '../lib/types';
import { Avatar } from '../components/Avatar';

const REASON_LABEL: Record<string, string> = {
  MEAL: 'Столовая',
  MANUAL: 'Назначено директором',
  LESSON: 'По расписанию',
  FREE: 'Свободное время',
  DIRECTOR_OFFICE: 'Кабинет директора',
  HEAD_TEACHER_OFFICE: 'Кабинет завуча',
  UNKNOWN_ROOM: 'Кабинет не найден в схеме',
  AWAY: 'Отошёл',
};

export function TeacherList({
  teachers,
  showAbsent,
  focusId,
  onFocus,
}: {
  teachers: Teacher[];
  showAbsent: boolean;
  focusId: string | null;
  onFocus: (id: string | null) => void;
}) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return teachers
      .filter((t) => showAbsent || t.present || query)
      .filter((t) =>
        !query
          ? true
          : `${t.lastName} ${t.firstName} ${t.subject ?? ''} ${t.positionTitle} ${t.location.className ?? ''} ${t.location.roomName ?? ''}`.toLowerCase().includes(query),
      )
      .sort((a, b) => Number(b.present) - Number(a.present) || a.lastName.localeCompare(b.lastName, 'ru'));
  }, [teachers, q, showAbsent]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-4 pt-4 pb-3">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
          <Users className="h-4 w-4" /> Учителя
        </div>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск: ФИО, предмет, класс, кабинет"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-sm outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/15 dark:border-white/10 dark:bg-white/5"
          />
          {q && (
            <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-slate-600" aria-label="Очистить">
              <X className="h-4 w-4" />
            </button>
          )}
        </label>
      </div>
      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <AnimatePresence initial={false}>
          {list.map((t) => (
            <motion.button
              layout="position"
              key={t.id}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: t.present ? 1 : 0.45, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ type: 'spring', stiffness: 220, damping: 26 }}
              onClick={() => onFocus(focusId === t.id ? null : t.id)}
              className={`mb-2 flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition-colors ${
                focusId === t.id
                  ? 'border-amber-400 bg-amber-50 dark:border-amber-400/70 dark:bg-amber-400/10'
                  : 'border-transparent bg-white/70 hover:border-brand-200 dark:bg-white/[0.04] dark:hover:border-white/10'
              }`}
            >
              <Avatar name={t} url={t.avatarUrl} size={46} ring={false} className={!t.present ? 'grayscale' : t.location.reason === 'AWAY' ? 'ring-2 ring-amber-400/80' : 'ring-2 ring-emerald-400/80'} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold leading-tight">
                  {t.lastName} {t.firstName}
                </div>
                <div className="truncate text-xs text-slate-500 dark:text-slate-400">{t.subject ?? t.positionTitle}</div>
                {t.present && t.location.reason === 'AWAY' ? (
                  <div className="mt-1">
                    <span className="inline-flex max-w-full items-center gap-1 truncate rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                      <DoorOpen className="h-3 w-3 shrink-0" /> {awayText(t.location)}
                    </span>
                  </div>
                ) : t.present ? (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span
                      title={REASON_LABEL[t.location.reason]}
                      className={`inline-flex max-w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                        t.location.reason === 'MEAL'
                          ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300'
                          : t.location.reason === 'MANUAL'
                            ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300'
                            : 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200'
                      }`}
                    >
                      <MapPin className="h-3 w-3 shrink-0" /> {t.location.roomName ?? '—'}
                    </span>
                    {t.location.className && (
                      <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                        {t.location.className}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="mt-1 text-[11px] text-slate-400">Не в школе</div>
                )}
              </div>
            </motion.button>
          ))}
        </AnimatePresence>
        {list.length === 0 && <div className="py-10 text-center text-sm text-slate-400">{q ? 'Никого не найдено' : 'Сейчас в школе никого нет'}</div>}
      </div>
    </div>
  );
}
