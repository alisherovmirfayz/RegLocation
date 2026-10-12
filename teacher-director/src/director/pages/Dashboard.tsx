import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import { Activity, BookOpen, Building2, Clock, UserCheck, UserX, Users, Utensils } from 'lucide-react';
import { directorApi } from '../../lib/api';
import { DAY_SHORT, fmtDateTime, periodText, REASON_LABEL, type AuditRow, type Period, type Reason } from '../../lib/types';
import { AnimatedNumber } from '../../components/AnimatedNumber';
import { Badge, PageLoader } from '../../components/ui';
import { useDirector } from '../DirectorApp';
import { Page, StatCard, useLoad } from './common';

interface DashboardData {
  period: Period;
  totals: { teachers: number; blocked: number; archived: number; present: number; absent: number };
  currentLessons: { teacherId: string; name: string; subject: string; className: string; room: string | null; reason: Reason }[];
  occupancy: { kind: 'SCHOOL' | 'CANTEEN'; name: string; occupants: number; floors: { id: string; name: string; occupants: number }[] }[];
  chart: { date: string; dayOfWeek: number; count: number }[];
  recentAudit: AuditRow[];
}

function AttendanceChart({ data, max }: { data: DashboardData['chart']; max: number }) {
  const top = Math.max(1, max, ...data.map((d) => d.count));
  return (
    <div className="flex h-44 items-end gap-1.5 sm:gap-2">
      {data.map((d, i) => {
        const h = (d.count / top) * 100;
        const weekend = d.dayOfWeek === 7;
        return (
          <div key={d.date} className="group flex flex-1 flex-col items-center gap-1.5">
            <div className="relative flex h-36 w-full items-end">
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(h, d.count ? 4 : 1.5)}%` }}
                transition={{ delay: i * 0.03, type: 'spring', stiffness: 120, damping: 18 }}
                className={`w-full rounded-t-lg ${weekend ? 'bg-slate-200 dark:bg-white/10' : 'bg-gradient-to-t from-brand-600 to-brand-400'} group-hover:from-indigo-600 group-hover:to-brand-400`}
              />
              <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 rounded-md bg-slate-900 px-1.5 py-0.5 text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100">
                {d.count}
              </div>
            </div>
            <div className="text-[10px] text-slate-500">{DAY_SHORT[d.dayOfWeek]}</div>
            <div className="hidden text-[10px] text-slate-400 sm:block">{d.date.slice(8)}.{d.date.slice(5, 7)}</div>
          </div>
        );
      })}
    </div>
  );
}

export function Dashboard() {
  const { snapshot } = useDirector();
  const { data, reload } = useLoad(() => directorApi.get<DashboardData>('/api/director/dashboard'));
  // Обновление при изменении состояния монитора (не чаще раза в 3 секунды)
  const last = useRef(0);
  useEffect(() => {
    if (!snapshot || Date.now() - last.current < 3000) return;
    last.current = Date.now();
    void reload();
  }, [snapshot?.hash]);

  if (!data) return <PageLoader />;
  const present = snapshot?.presentCount ?? data.totals.present;
  const canteen = data.occupancy.find((o) => o.kind === 'CANTEEN');
  const school = data.occupancy.find((o) => o.kind === 'SCHOOL');

  return (
    <Page title="Главная" subtitle={<span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" /> {periodText(snapshot?.period ?? data.period)}</span>}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Учителей" value={<AnimatedNumber value={data.totals.teachers} />} icon={<Users className="h-6 w-6" />} hint={data.totals.blocked ? `Заблокировано: ${data.totals.blocked}` : 'Активные аккаунты'} />
        <StatCard label="В школе сейчас" value={<AnimatedNumber value={present} />} icon={<UserCheck className="h-6 w-6" />} tone="green" hint={`Отсутствуют: ${data.totals.teachers - present}`} />
        <StatCard label="Идут уроки" value={<AnimatedNumber value={data.currentLessons.length} />} icon={<BookOpen className="h-6 w-6" />} tone="amber" hint="По расписанию" />
        <StatCard label="В столовой" value={<AnimatedNumber value={canteen?.occupants ?? 0} />} icon={<Utensils className="h-6 w-6" />} tone="orange" hint={`В здании школы: ${school?.occupants ?? 0}`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold">
              <Activity className="h-5 w-5 text-brand-500" /> Посещаемость за 14 дней
            </div>
            <Link to="/director/attendance" className="text-sm font-medium text-brand-600">
              Подробнее →
            </Link>
          </div>
          <AttendanceChart data={data.chart} max={data.totals.teachers} />
        </div>
        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2 font-semibold">
            <Building2 className="h-5 w-5 text-brand-500" /> Состояние зданий
          </div>
          <div className="space-y-4">
            {data.occupancy.map((b) => (
              <div key={b.kind}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-semibold">{b.name}</span>
                  <Badge color={b.kind === 'CANTEEN' ? 'orange' : 'blue'}>{b.occupants} чел.</Badge>
                </div>
                <div className="space-y-1.5">
                  {b.floors.map((f) => (
                    <div key={f.id} className="flex items-center gap-2 text-xs">
                      <span className="w-20 shrink-0 text-slate-500">{f.name}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5">
                        <motion.div
                          className={`h-full rounded-full ${b.kind === 'CANTEEN' ? 'bg-orange-400' : 'bg-brand-500'}`}
                          animate={{ width: `${Math.min(100, (f.occupants / Math.max(1, present)) * 100)}%` }}
                        />
                      </div>
                      <span className="w-5 text-right font-semibold tabular-nums">{f.occupants}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card overflow-hidden lg:col-span-2">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 font-semibold dark:border-white/5">
            <BookOpen className="h-5 w-5 text-brand-500" /> Текущие уроки
          </div>
          {data.currentLessons.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500">Сейчас уроков нет или учителя ещё не отметились.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-2.5">Учитель</th>
                    <th className="px-3 py-2.5">Предмет</th>
                    <th className="px-3 py-2.5">Класс</th>
                    <th className="px-3 py-2.5">Кабинет</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {data.currentLessons.map((l) => (
                    <tr key={l.teacherId}>
                      <td className="px-5 py-2.5 font-medium">{l.name}</td>
                      <td className="px-3 py-2.5 text-slate-500">{l.subject}</td>
                      <td className="px-3 py-2.5">
                        <Badge color="green">{l.className}</Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        {l.room} {l.reason === 'MANUAL' && <Badge color="violet">{REASON_LABEL.MANUAL}</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="flex items-center gap-2 font-semibold">
              <UserX className="h-5 w-5 text-brand-500" /> Последние действия
            </span>
            <Link to="/director/history" className="text-sm font-medium text-brand-600">
              Все →
            </Link>
          </div>
          <ul className="space-y-3">
            {data.recentAudit.map((a) => (
              <motion.li key={a.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="text-sm">
                <div className="line-clamp-2">{a.summary}</div>
                <div className="text-xs text-slate-400">
                  {a.actorName} · {fmtDateTime(a.createdAt)}
                </div>
              </motion.li>
            ))}
            {data.recentAudit.length === 0 && <li className="text-sm text-slate-500">Пока нет действий</li>}
          </ul>
        </div>
      </div>
    </Page>
  );
}
