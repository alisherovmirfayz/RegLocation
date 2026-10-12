import { useMemo, useState } from 'react';
import { ClipboardCheck, Download, LogOut } from 'lucide-react';
import { directorApi } from '../../lib/api';
import { fmtTime } from '../../lib/types';
import { Avatar } from '../../components/Avatar';
import { Badge, Button, EmptyState, PageLoader, useToast } from '../../components/ui';
import { Page, SearchInput, StatCard, useLoad } from './common';

interface Row {
  teacherId: string;
  name: string;
  positionTitle: string;
  avatarUrl: string | null;
  present: boolean;
  firstIn: string | null;
  lastOut: string | null;
  lastReason: string | null;
  minutes: number;
}

const todayTashkent = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });

export function AttendancePage() {
  const toast = useToast();
  const [date, setDate] = useState(todayTashkent());
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'CAME' | 'ABSENT' | 'NOW'>('ALL');
  const { data, reload } = useLoad(() => directorApi.get<{ date: string; rows: Row[] }>(`/api/director/attendance?date=${date}`), [date]);

  const rows = useMemo(
    () =>
      (data?.rows ?? []).filter(
        (r) =>
          r.name.toLowerCase().includes(q.trim().toLowerCase()) &&
          (filter === 'ALL' || (filter === 'CAME' && r.firstIn) || (filter === 'ABSENT' && !r.firstIn) || (filter === 'NOW' && r.present)),
      ),
    [data, q, filter],
  );
  if (!data) return <PageLoader />;
  const came = data.rows.filter((r) => r.firstIn).length;
  const now = data.rows.filter((r) => r.present).length;

  const exportCsv = () => {
    const lines = [['ФИО', 'Должность', 'Пришёл', 'Ушёл', 'Минут в школе', 'Причина выхода'].join(';')];
    for (const r of data.rows) lines.push([r.name, r.positionTitle, fmtTime(r.firstIn), r.present ? 'в школе' : fmtTime(r.lastOut), r.minutes, r.lastReason ?? ''].join(';'));
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `poseshchaemost-${date}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Page
      title="Посещаемость"
      subtitle="Отметки «Я в школе» / «Выйти из школы». В 17:00 все отметки закрываются автоматически."
      actions={
        <Button variant="secondary" onClick={exportCsv} icon={<Download className="h-4 w-4" />}>
          Скачать CSV
        </Button>
      }
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Пришли за день" value={`${came} / ${data.rows.length}`} icon={<ClipboardCheck className="h-6 w-6" />} tone="green" />
        <StatCard label="Сейчас в школе" value={now} icon={<ClipboardCheck className="h-6 w-6" />} />
        <StatCard label="Не отмечались" value={data.rows.length - came} icon={<ClipboardCheck className="h-6 w-6" />} tone="slate" />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <input type="date" className="input w-auto" value={date} max={todayTashkent()} onChange={(e) => setDate(e.target.value)} />
        <SearchInput value={q} onChange={setQ} placeholder="Поиск по ФИО" />
        <select className="input w-auto" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="ALL">Все</option>
          <option value="CAME">Отметились</option>
          <option value="ABSENT">Не отмечались</option>
          <option value="NOW">Сейчас в школе</option>
        </select>
      </div>
      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={<ClipboardCheck />} title="Нет данных" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-white/5">
                <tr>
                  <th className="px-5 py-3">Учитель</th>
                  <th className="px-3 py-3">Пришёл</th>
                  <th className="px-3 py-3">Ушёл</th>
                  <th className="px-3 py-3">Время в школе</th>
                  <th className="px-3 py-3">Статус</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {rows.map((r) => (
                  <tr key={r.teacherId}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={{ firstName: r.name.split(' ')[1] ?? '', lastName: r.name.split(' ')[0] ?? '', id: r.teacherId }} url={r.avatarUrl} size={34} ring={false} />
                        <div>
                          <div className="font-medium">{r.name}</div>
                          <div className="text-xs text-slate-500">{r.positionTitle}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 tabular-nums">{fmtTime(r.firstIn)}</td>
                    <td className="px-3 py-3 tabular-nums">
                      {r.present ? '—' : fmtTime(r.lastOut)}
                      {r.lastReason === 'AUTO_END_OF_DAY' && <span className="ml-1 text-xs text-slate-400">(авто)</span>}
                    </td>
                    <td className="px-3 py-3 tabular-nums">{r.firstIn ? `${Math.floor(r.minutes / 60)} ч ${r.minutes % 60} мин` : '—'}</td>
                    <td className="px-3 py-3">{r.present ? <Badge color="green">В школе</Badge> : r.firstIn ? <Badge color="blue">Был(а)</Badge> : <Badge>Не отмечался</Badge>}</td>
                    <td className="px-3 py-3 text-right">
                      {r.present && date === todayTashkent() && (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<LogOut className="h-4 w-4" />}
                          onClick={async () => {
                            try {
                              await directorApi.post(`/api/director/attendance/${r.teacherId}/check-out`);
                              toast('success', `${r.name}: отмечено «Не в школе»`);
                              await reload();
                            } catch (e) {
                              toast('error', (e as Error).message);
                            }
                          }}
                        >
                          Отметить уход
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Page>
  );
}
