import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { CalendarDays } from 'lucide-react';
import { directorApi } from '../../lib/api';
import type { TeacherListItem } from '../../lib/types';
import { Avatar } from '../../components/Avatar';
import { Badge, EmptyState, PageLoader } from '../../components/ui';
import { TimetableEditor } from '../../components/TimetableEditor';
import { Page, SearchInput, useLoad } from './common';

export function TimetablesPage() {
  const { data, reload } = useLoad(() => directorApi.get<TeacherListItem[]>('/api/director/timetables'));
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'MISSING'>('ALL');
  const list = useMemo(
    () =>
      (data ?? []).filter(
        (t) => (filter === 'ALL' || !t.timetable) && `${t.lastName} ${t.firstName} ${t.positionTitle}`.toLowerCase().includes(q.trim().toLowerCase()),
      ),
    [data, q, filter],
  );
  if (!data) return <PageLoader />;
  const current = data.find((t) => t.id === selected);
  const missing = data.filter((t) => !t.timetable).length;

  return (
    <Page title="Расписания" subtitle={missing ? `Без расписания: ${missing} из ${data.length}` : 'У всех учителей загружено расписание'}>
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="card flex max-h-[75vh] flex-col overflow-hidden">
          <div className="space-y-2 border-b border-slate-100 p-3 dark:border-white/5">
            <SearchInput value={q} onChange={setQ} placeholder="Поиск учителя" />
            <div className="flex gap-1 text-sm">
              {(['ALL', 'MISSING'] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)} className={`rounded-lg px-3 py-1.5 font-medium ${filter === f ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5'}`}>
                  {f === 'ALL' ? 'Все' : `Без расписания (${missing})`}
                </button>
              ))}
            </div>
          </div>
          <div className="thin-scroll flex-1 overflow-y-auto p-2">
            {list.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelected(t.id)}
                className={`mb-1 flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition ${selected === t.id ? 'bg-brand-50 ring-1 ring-brand-300 dark:bg-brand-500/10 dark:ring-brand-500/40' : 'hover:bg-slate-50 dark:hover:bg-white/5'}`}
              >
                <Avatar name={t} url={t.avatarUrl} size={36} ring={false} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {t.lastName} {t.firstName}
                  </div>
                  <div className="truncate text-xs text-slate-500">{t.positionTitle}</div>
                </div>
                {t.timetable ? <Badge color="green">{t.timetable.lessons}</Badge> : <Badge color="amber">нет</Badge>}
              </button>
            ))}
            {list.length === 0 && <div className="p-6 text-center text-sm text-slate-500">Никого не найдено</div>}
          </div>
        </div>
        <div>
          {current ? (
            <motion.div key={current.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}>
              <div className="mb-4 flex items-center gap-3">
                <Avatar name={current} url={current.avatarUrl} size={44} />
                <div>
                  <div className="text-lg font-bold">
                    {current.lastName} {current.firstName}
                  </div>
                  <div className="text-sm text-slate-500">{current.positionTitle}</div>
                </div>
              </div>
              <TimetableEditor role="director" base={`/api/director/teachers/${current.id}`} onSaved={reload} />
            </motion.div>
          ) : (
            <div className="card">
              <EmptyState icon={<CalendarDays />} title="Выберите учителя" text="Загрузите фото или PDF расписания, проверьте распознанные классы и кабинеты и сохраните. Учитель может сделать то же самое со своего телефона." />
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}
