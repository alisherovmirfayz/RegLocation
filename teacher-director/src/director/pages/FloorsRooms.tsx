import { useState } from 'react';
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { ApiError, directorApi } from '../../lib/api';
import { ROOM_TYPE_LABEL, type Building, type Floor, type RoomType } from '../../lib/types';
import { Badge, Button, Field, Modal, PageLoader, useToast } from '../../components/ui';
import { Page, useLoad } from './common';

export function FloorsRoomsPage() {
  const toast = useToast();
  const { data, reload } = useLoad(() => directorApi.get<Building[]>('/api/director/buildings'));
  const [kind, setKind] = useState<'SCHOOL' | 'CANTEEN' | 'STADIUM' | 'SCHOOL2'>('SCHOOL');
  const [addFloor, setAddFloor] = useState(false);
  const [floorForm, setFloorForm] = useState({ name: '', level: 7, position: 'top' as 'top' | 'bottom' });
  const [rename, setRename] = useState<{ id: string; name: string; level: number } | null>(null);
  const [roomForms, setRoomForms] = useState<Record<string, { code: string; name: string; type: RoomType }>>({});

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast('success', ok);
      await reload();
    } catch (e) {
      toast('error', (e as Error).message);
    }
  };

  const withForce = async (url: string) => {
    try {
      await directorApi.del(url);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        if (!confirm(`${e.message}\n\nПродолжить удаление?`)) throw new Error('Удаление отменено');
        await directorApi.del(`${url}?force=1`);
      } else throw e;
    }
  };

  if (!data) return <PageLoader />;
  const building = data.find((b) => b.kind === kind)!;
  const floors = building.floors;

  const move = (i: number, dir: -1 | 1) => {
    const ids = floors.map((f) => f.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    void run(() => directorApi.post('/api/director/floors/reorder', { floorIds: ids }), 'Порядок этажей изменён');
  };

  return (
    <Page
      title="Этажи и кабинеты"
      subtitle="Порядок этажей = порядок на мониторе сверху вниз."
      actions={
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setAddFloor(true)}>
          Добавить этаж
        </Button>
      }
    >
      <div className="mb-4 flex rounded-xl bg-slate-100 p-1 dark:bg-white/5" style={{ width: 'fit-content' }}>
        {(['SCHOOL', 'SCHOOL2', 'CANTEEN'] as const).map((k) => (
          <button key={k} onClick={() => setKind(k)} className={`rounded-lg px-4 py-1.5 text-sm font-medium ${kind === k ? 'bg-white shadow dark:bg-slate-800' : 'text-slate-500'}`}>
            {k === 'SCHOOL' ? 'Школа' : k === 'CANTEEN' ? 'Столовая' : 'Второе здание'}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {floors.map((f: Floor, i) => {
          const form = roomForms[f.id] ?? { code: '', name: '', type: 'CLASSROOM' as RoomType };
          return (
            <div key={f.id} className="card overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3 dark:border-white/5">
                <span className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-brand-600 px-2 text-sm font-bold text-white">{f.level}</span>
                {rename?.id === f.id ? (
                  <>
                    <input className="input w-48 py-1.5" value={rename.name} onChange={(e) => setRename({ ...rename, name: e.target.value })} autoFocus />
                    <input className="input w-20 py-1.5" type="number" value={rename.level} onChange={(e) => setRename({ ...rename, level: Number(e.target.value) })} title="Номер этажа" />
                    <Button size="sm" icon={<Check className="h-4 w-4" />} onClick={() => void run(() => directorApi.patch(`/api/director/floors/${f.id}`, { name: rename.name, level: rename.level }), 'Этаж переименован').then(() => setRename(null))}>
                      Сохранить
                    </Button>
                    <button onClick={() => setRename(null)} className="p-1 text-slate-400">
                      <X className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="font-semibold">{f.name}</span>
                    <Badge>{f.rooms.length} помещений</Badge>
                    <button onClick={() => setRename({ id: f.id, name: f.name, level: f.level })} className="rounded-lg p-1.5 text-slate-400 hover:text-brand-600" title="Переименовать">
                      <Pencil className="h-4 w-4" />
                    </button>
                  </>
                )}
                <div className="ml-auto flex gap-1">
                  <button disabled={i === 0} onClick={() => move(i, -1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-white/10" title="Выше">
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button disabled={i === floors.length - 1} onClick={() => move(i, 1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-white/10" title="Ниже">
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Удалить «${f.name}» со всеми помещениями?`)) void run(() => withForce(`/api/director/floors/${f.id}`), 'Этаж удалён');
                    }}
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                    title="Удалить этаж"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {f.rooms.map((r) => (
                      <tr key={r.id}>
                        <td className="w-28 px-5 py-2 font-mono text-xs text-slate-500">{r.code}</td>
                        <td className="px-3 py-2">
                          <input
                            className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 hover:border-slate-200 focus:border-brand-400 focus:outline-none dark:hover:border-white/10"
                            defaultValue={r.name}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v && v !== r.name) void run(() => directorApi.patch(`/api/director/rooms/${r.id}`, { name: v }), 'Название сохранено');
                            }}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className="rounded-lg border border-slate-200 bg-transparent px-2 py-1 text-sm dark:border-white/10"
                            value={r.type}
                            onChange={(e) => void run(() => directorApi.patch(`/api/director/rooms/${r.id}`, { type: e.target.value }), 'Тип изменён')}
                          >
                            {Object.entries(ROOM_TYPE_LABEL).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-400">{r.timetableUses ? `в расписаниях: ${r.timetableUses}` : ''}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => {
                              if (confirm(`Удалить «${r.name}»?`)) void run(() => withForce(`/api/director/rooms/${r.id}`), 'Помещение удалено');
                            }}
                            className="rounded-lg p-1.5 text-slate-400 hover:text-rose-600"
                            title="Удалить"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 bg-slate-50/50 px-5 py-3 dark:border-white/5 dark:bg-white/[0.02]">
                <input className="input w-28 py-1.5" placeholder="Код: 406" value={form.code} onChange={(e) => setRoomForms({ ...roomForms, [f.id]: { ...form, code: e.target.value } })} />
                <input className="input w-48 py-1.5" placeholder="Название" value={form.name} onChange={(e) => setRoomForms({ ...roomForms, [f.id]: { ...form, name: e.target.value } })} />
                <select className="input w-auto py-1.5" value={form.type} onChange={(e) => setRoomForms({ ...roomForms, [f.id]: { ...form, type: e.target.value as RoomType } })}>
                  {Object.entries(ROOM_TYPE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!form.code.trim()}
                  icon={<Plus className="h-4 w-4" />}
                  onClick={() =>
                    void run(
                      () => directorApi.post('/api/director/rooms', { floorId: f.id, code: form.code.trim(), name: form.name.trim() || `Кабинет ${form.code.trim()}`, type: form.type }),
                      'Помещение добавлено. Расположите его в «Редакторе школы».',
                    ).then(() => setRoomForms({ ...roomForms, [f.id]: { code: '', name: '', type: 'CLASSROOM' } }))
                  }
                >
                  Добавить помещение
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={addFloor} onClose={() => setAddFloor(false)} title="Новый этаж">
        <div className="space-y-4">
          <Field label="Название">
            <input className="input" value={floorForm.name} onChange={(e) => setFloorForm({ ...floorForm, name: e.target.value })} placeholder="7 этаж" />
          </Field>
          <Field label="Номер этажа">
            <input className="input" type="number" value={floorForm.level} onChange={(e) => setFloorForm({ ...floorForm, level: Number(e.target.value) })} />
          </Field>
          <Field label="Расположение на мониторе">
            <select className="input" value={floorForm.position} onChange={(e) => setFloorForm({ ...floorForm, position: e.target.value as 'top' | 'bottom' })}>
              <option value="top">Сверху (над остальными)</option>
              <option value="bottom">Снизу</option>
            </select>
          </Field>
          <Button
            className="w-full"
            disabled={!floorForm.name.trim()}
            onClick={() =>
              void run(() => directorApi.post('/api/director/floors', { buildingKind: kind, ...floorForm, name: floorForm.name.trim() }), 'Этаж добавлен').then(() => setAddFloor(false))
            }
          >
            Добавить этаж
          </Button>
        </div>
      </Modal>
    </Page>
  );
}
