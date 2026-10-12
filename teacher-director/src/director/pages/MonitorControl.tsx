import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Building2, FlaskConical, MonitorPlay, MoveRight, RotateCcw, Save, Timer, Utensils, X } from 'lucide-react';
import { directorApi } from '../../lib/api';
import { DAY_NAMES, fmtDateTime, fmtTime, REASON_LABEL, type MonitorSettings, type RoomOption } from '../../lib/types';
import { BuildingMap } from '../../components/BuildingMap';
import { Avatar } from '../../components/Avatar';
import { Alert, Badge, Button, Field, PageLoader, useToast } from '../../components/ui';
import { useDirector } from '../DirectorApp';
import { Page, useLoad } from './common';

interface Assignment {
  id: string;
  teacherId: string;
  teacherName: string;
  roomName: string;
  roomCode: string;
  mode: 'UNTIL_LESSON_END' | 'UNTIL_TIME' | 'UNTIL_CANCELLED';
  startsAt: string;
  endsAt: string | null;
  createdBy: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  active: boolean;
}

const MODE_LABEL = { UNTIL_LESSON_END: 'До окончания урока', UNTIL_TIME: 'До определённого времени', UNTIL_CANCELLED: 'До отмены' };

function MovePanel({ rooms, onDone }: { rooms: RoomOption[]; onDone: () => void }) {
  const { snapshot } = useDirector();
  const toast = useToast();
  const [teacherId, setTeacherId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [mode, setMode] = useState<Assignment['mode']>('UNTIL_LESSON_END');
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const teachers = useMemo(
    () => [...(snapshot?.teachers ?? [])].sort((a, b) => Number(b.present) - Number(a.present) || a.lastName.localeCompare(b.lastName, 'ru')),
    [snapshot],
  );
  const t = teachers.find((x) => x.id === teacherId);
  const target = rooms.find((r) => r.id === roomId);

  const submit = async () => {
    setBusy(true);
    try {
      await directorApi.post('/api/director/assignments', { teacherId, roomId, mode, until: mode === 'UNTIL_TIME' ? until : undefined });
      toast('success', `${t?.lastName}: перемещение в «${target?.name}»`);
      setRoomId('');
      onDone();
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card space-y-4 p-5">
      <div className="flex items-center gap-2 font-semibold">
        <MoveRight className="h-5 w-5 text-brand-500" /> Переместить учителя
      </div>
      <Field label="Учитель">
        <select className="input" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
          <option value="">— выберите —</option>
          {teachers.map((x) => (
            <option key={x.id} value={x.id}>
              {x.present ? '● ' : '○ '}
              {x.lastName} {x.firstName} — {x.subject ?? x.positionTitle}
              {x.present && x.location.roomName ? ` (сейчас: ${x.location.roomName})` : ''}
            </option>
          ))}
        </select>
      </Field>
      {t && (
        <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 text-sm dark:bg-white/5">
          <Avatar name={t} url={t.avatarUrl} size={36} ring={false} />
          <div className="min-w-0 flex-1">
            <div className="font-medium">{t.present ? t.location.roomName ?? 'не на карте' : 'Не в школе'}</div>
            <div className="text-xs text-slate-500">{t.present ? REASON_LABEL[t.location.reason] : 'Назначение вступит в силу, когда учитель отметится'}</div>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400" />
          <div className="font-semibold">{target?.name ?? '?'}</div>
        </div>
      )}
      <Field label="Куда">
        <select className="input" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          <option value="">— выберите кабинет —</option>
          {Object.entries(
            rooms.reduce<Record<string, RoomOption[]>>((acc, r) => {
              (acc[`${r.building === 'CANTEEN' ? 'Столовая' : 'Школа'} · ${r.floor}`] ??= []).push(r);
              return acc;
            }, {}),
          ).map(([group, list]) => (
            <optgroup key={group} label={group}>
              {list.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>
      <div>
        <span className="label">Продолжительность</span>
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(MODE_LABEL) as Assignment['mode'][]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition ${mode === m ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200' : 'border-slate-200 hover:border-slate-300 dark:border-white/10'}`}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </div>
      {mode === 'UNTIL_TIME' && (
        <Field label="До какого времени (сегодня)">
          <input className="input" type="time" value={until} onChange={(e) => setUntil(e.target.value)} />
        </Field>
      )}
      <p className="text-xs text-slate-500">Исходное расписание не меняется. Во время обеда и полдника действует правило столовой. После окончания срока учитель вернётся к расписанию.</p>
      <Button className="w-full" disabled={!teacherId || !roomId || (mode === 'UNTIL_TIME' && !until)} loading={busy} onClick={submit} icon={<MoveRight className="h-4 w-4" />}>
        Переместить
      </Button>
    </div>
  );
}

function SimulationPanel() {
  const { snapshot } = useDirector();
  const toast = useToast();
  const [day, setDay] = useState(1);
  const [time, setTime] = useState('10:00');
  const [allPresent, setAllPresent] = useState(true);
  const [busy, setBusy] = useState(false);
  const simulated = snapshot?.clock.simulated;

  const start = async (t = time) => {
    setBusy(true);
    try {
      const [h, m] = t.split(':').map(Number);
      await directorApi.post('/api/director/simulation', { dayOfWeek: day, hours: h, minutes: m, assumeAllPresent: allPresent });
      setTime(t);
      toast('info', `Тестовый режим: ${DAY_NAMES[day]}, ${t}`);
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`card space-y-4 p-5 ${simulated ? 'ring-2 ring-amber-400' : ''}`}>
      <div className="flex items-center gap-2 font-semibold">
        <FlaskConical className="h-5 w-5 text-amber-500" /> Тестовый режим
        {simulated && <Badge color="amber">включён</Badge>}
      </div>
      <p className="text-sm text-slate-500">Монитор покажет школу в выбранное время. Реальные отметки посещаемости и расписания не изменяются. Время в тестовом режиме идёт дальше.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="День недели">
          <select className="input" value={day} onChange={(e) => setDay(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <option key={d} value={d}>
                {DAY_NAMES[d]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Часы : минуты">
          <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={allPresent} onChange={(e) => setAllPresent(e.target.checked)} />
        Считать всех учителей присутствующими
      </label>
      <div className="flex flex-wrap gap-1.5">
        {[
          ['10:00', 'урок'],
          ['12:30', 'обед'],
          ['13:15', 'конец обеда'],
          ['15:45', 'полдник'],
          ['16:05', 'конец полдника'],
          ['17:00', 'конец дня'],
        ].map(([t, label]) => (
          <button key={t} onClick={() => void start(t)} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium hover:bg-brand-50 hover:text-brand-700 dark:bg-white/5 dark:hover:bg-brand-500/15">
            {t} · {label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button className="flex-1" variant="warning" loading={busy} onClick={() => void start()} icon={<FlaskConical className="h-4 w-4" />}>
          Запустить
        </Button>
        {simulated && (
          <Button
            className="flex-1"
            variant="secondary"
            icon={<RotateCcw className="h-4 w-4" />}
            onClick={async () => {
              await directorApi.del('/api/director/simulation');
              toast('success', 'Монитор вернулся к реальному времени');
            }}
          >
            Вернуться к реальному времени
          </Button>
        )}
      </div>
    </div>
  );
}

function DisplaySettings() {
  const toast = useToast();
  const { data, setData } = useLoad(() => directorApi.get<{ monitor: MonitorSettings }>('/api/director/settings'));
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const m = data.monitor;
  const set = (patch: Partial<MonitorSettings>) => setData({ ...data, monitor: { ...m, ...patch } });
  const toggles: [keyof MonitorSettings, string][] = [
    ['idleAutoScroll', 'Живой режим в простое: обзор учителей с карточками и автопрокрутка схемы'],
    ['showAbsentInList', 'Показывать отсутствующих в списке учителей'],
    ['highlightOccupied', 'Подсветка занятых кабинетов'],
    ['ambientEffects', 'Фоновые световые эффекты'],
  ];
  return (
    <div className="card space-y-4 p-5">
      <div className="flex items-center gap-2 font-semibold">
        <MonitorPlay className="h-5 w-5 text-brand-500" /> Отображение монитора
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Тема">
          <select className="input" value={m.theme} onChange={(e) => set({ theme: e.target.value as 'dark' | 'light' })}>
            <option value="dark">Тёмная</option>
            <option value="light">Светлая</option>
          </select>
        </Field>
        <Field label="Живой режим через, сек">
          <input className="input" type="number" min={15} max={3600} value={m.idleAfterSeconds} onChange={(e) => set({ idleAfterSeconds: Number(e.target.value) })} />
        </Field>
      </div>
      {toggles.map(([k, label]) => (
        <label key={k} className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={Boolean(m[k])} onChange={(e) => set({ [k]: e.target.checked } as Partial<MonitorSettings>)} />
          {label}
        </label>
      ))}
      <Button
        loading={busy}
        icon={<Save className="h-4 w-4" />}
        onClick={async () => {
          setBusy(true);
          try {
            await directorApi.put('/api/director/settings/monitor', m);
            toast('success', 'Настройки монитора применены');
          } catch (e) {
            toast('error', (e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Применить на мониторе
      </Button>
    </div>
  );
}

export function MonitorControlPage() {
  const { snapshot } = useDirector();
  const toast = useToast();
  const [view, setView] = useState<'SCHOOL' | 'CANTEEN'>('SCHOOL');
  const rooms = useLoad(() => directorApi.get<RoomOption[]>('/api/director/rooms'));
  const assignments = useLoad(() => directorApi.get<Assignment[]>('/api/director/assignments'));
  const scrollRef = useRef<HTMLDivElement>(null);
  const [epochs, setEpochs] = useState(new Map<string, number>());
  const prev = useRef(new Map<string, string | null>());

  useEffect(() => {
    if (!snapshot) return;
    setEpochs((old) => {
      const next = new Map(old);
      for (const t of snapshot.teachers) {
        const p = prev.current.get(t.id);
        const room = t.present ? t.location.roomId : null;
        if (p !== undefined && p !== room && t.location.reason !== 'MANUAL') next.set(t.id, (next.get(t.id) ?? 0) + 1);
        prev.current.set(t.id, room);
      }
      return next;
    });
    void assignments.reload();
  }, [snapshot?.hash]);

  if (!snapshot || !rooms.data) return <PageLoader />;
  const building = snapshot.buildings.find((b) => b.kind === view)!;
  const active = (assignments.data ?? []).filter((a) => a.active);
  const history = (assignments.data ?? []).filter((a) => !a.active).slice(0, 15);

  return (
    <Page title="Управление монитором" subtitle="Изменения сразу появляются на мониторе ресепшена.">
      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <div className="card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-white/5">
              <span className="font-semibold">Монитор сейчас</span>
              <Badge color="green">в школе {snapshot.presentCount}</Badge>
              <div className="ml-auto flex rounded-xl bg-slate-100 p-1 dark:bg-white/5">
                {(['SCHOOL', 'CANTEEN'] as const).map((k) => (
                  <button key={k} onClick={() => setView(k)} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${view === k ? 'bg-white shadow dark:bg-slate-800' : 'text-slate-500'}`}>
                    {k === 'SCHOOL' ? <Building2 className="h-4 w-4" /> : <Utensils className="h-4 w-4" />}
                    {k === 'SCHOOL' ? 'Школа' : 'Столовая'}
                  </button>
                ))}
              </div>
            </div>
            <div ref={scrollRef} className="thin-scroll max-h-[70vh] overflow-y-auto bg-slate-50/60 dark:bg-slate-950/40">
              <motion.div key={view} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <BuildingMap building={building} teachers={snapshot.teachers} highlightOccupied focusTeacherId={null} scrollRef={scrollRef} epochs={epochs} />
              </motion.div>
            </div>
          </div>

          <div className="card p-5">
            <div className="mb-3 flex items-center gap-2 font-semibold">
              <Timer className="h-5 w-5 text-violet-500" /> Действующие назначения ({active.length})
            </div>
            {active.length === 0 ? (
              <p className="text-sm text-slate-500">Все учителя отображаются автоматически по расписанию.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-white/5">
                {active.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">
                        {a.teacherName} → {a.roomName}
                      </div>
                      <div className="text-xs text-slate-500">
                        {MODE_LABEL[a.mode]}
                        {a.endsAt ? ` · до ${fmtTime(a.endsAt)}` : ''} · назначил(а) {a.createdBy ?? '—'} в {fmtTime(a.startsAt)}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<X className="h-4 w-4" />}
                      onClick={async () => {
                        await directorApi.post(`/api/director/assignments/${a.id}/cancel`);
                        toast('success', `${a.teacherName}: возврат к расписанию`);
                        void assignments.reload();
                      }}
                    >
                      Вернуть по расписанию
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {history.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-500">История перемещений</summary>
                <ul className="mt-2 space-y-1.5 text-xs text-slate-500">
                  {history.map((a) => (
                    <li key={a.id}>
                      {fmtDateTime(a.startsAt)} — {a.createdBy ?? '—'}: {a.teacherName} → {a.roomName} ({MODE_LABEL[a.mode].toLowerCase()})
                      {a.cancelledAt ? `, отменено ${fmtTime(a.cancelledAt)}${a.cancelledBy ? ` (${a.cancelledBy})` : ''}` : ', срок истёк'}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>
        <div className="space-y-6">
          <MovePanel rooms={rooms.data} onDone={() => void assignments.reload()} />
          <SimulationPanel />
          <DisplaySettings />
          <Alert kind="info">Монитор открывается по адресу /monitor на сервере RegLocation. Логины для монитора — в разделе «Доступ к монитору».</Alert>
        </div>
      </div>
    </Page>
  );
}
