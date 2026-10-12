import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { History } from 'lucide-react';
import { directorApi } from '../../lib/api';
import { fmtDateTime, type AuditRow } from '../../lib/types';
import { Badge, Button, EmptyState, PageLoader } from '../../components/ui';
import { useDirector } from '../DirectorApp';
import { Page, SearchInput } from './common';

const ACTIONS: [string, string][] = [
  ['', 'Все действия'],
  ['teacher', 'Учителя'],
  ['assignment', 'Перемещения'],
  ['timetable', 'Расписания'],
  ['floor', 'Этажи'],
  ['room', 'Кабинеты'],
  ['reception', 'Доступ к монитору'],
  ['settings', 'Настройки'],
  ['simulation', 'Тестовый режим'],
  ['attendance', 'Посещаемость'],
  ['director', 'Директор'],
];

const color = (action: string) =>
  action.startsWith('assignment') ? 'violet' : action.startsWith('teacher') ? 'blue' : action.startsWith('simulation') ? 'amber' : action.includes('deleted') ? 'red' : 'slate';

export function AuditPage() {
  const { lastAudit } = useDirector();
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');

  const load = async (more = false) => {
    const params = new URLSearchParams({ limit: '50', ...(q ? { q } : {}), ...(action ? { action } : {}), ...(more && cursor ? { cursor } : {}) });
    const r = await directorApi.get<{ rows: AuditRow[]; nextCursor: string | null }>(`/api/director/audit?${params}`);
    setRows((prev) => (more ? [...(prev ?? []), ...r.rows] : r.rows));
    setCursor(r.nextCursor);
  };

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [q, action]);

  // Новые события появляются сверху в реальном времени
  useEffect(() => {
    if (lastAudit && !q && (!action || lastAudit.action.startsWith(action))) setRows((prev) => (prev && !prev.some((r) => r.id === lastAudit.id) ? [lastAudit, ...prev] : prev));
  }, [lastAudit]);

  return (
    <Page title="История изменений" subtitle="Кто, когда и что изменил. Записи нельзя удалить.">
      <div className="mb-4 flex flex-wrap gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Поиск по описанию или автору" />
        <select className="input w-auto" value={action} onChange={(e) => setAction(e.target.value)}>
          {ACTIONS.map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {!rows ? (
        <PageLoader />
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState icon={<History />} title="Записей нет" />
        </div>
      ) : (
        <div className="card divide-y divide-slate-100 dark:divide-white/5">
          <AnimatePresence initial={false}>
            {rows.map((r) => (
              <motion.div key={r.id} initial={{ opacity: 0, backgroundColor: 'rgba(58,99,246,0.12)' }} animate={{ opacity: 1, backgroundColor: 'rgba(0,0,0,0)' }} transition={{ duration: 1.2 }} className="flex flex-wrap items-start gap-3 px-5 py-3.5">
                <div className="w-36 shrink-0 text-xs tabular-nums text-slate-500">{fmtDateTime(r.createdAt)}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm">{r.summary}</div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {r.actorName}
                    {r.ip ? ` · IP ${r.ip}` : ''}
                  </div>
                </div>
                <Badge color={color(r.action) as 'violet'}>{r.action}</Badge>
              </motion.div>
            ))}
          </AnimatePresence>
          {cursor && (
            <div className="p-3 text-center">
              <Button variant="ghost" onClick={() => void load(true)}>
                Показать ещё
              </Button>
            </div>
          )}
        </div>
      )}
    </Page>
  );
}
