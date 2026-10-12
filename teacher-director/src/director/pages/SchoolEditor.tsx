import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Grid3x3, Map as MapIcon, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { ApiError, directorApi } from '../../lib/api';
import { ROOM_TYPE_LABEL, type Building, type Room, type RoomType } from '../../lib/types';
import { Alert, Badge, Button, Field, PageLoader, useToast } from '../../components/ui';
import { Page, useLoad } from './common';

const GRID = 10;
const snap = (v: number, on: boolean) => (on ? Math.round(v / GRID) * GRID : Math.round(v));

const TYPE_COLOR: Partial<Record<RoomType, string>> = {
  CLASSROOM: 'bg-white border-slate-300 dark:bg-slate-800 dark:border-slate-600',
  CORRIDOR: 'bg-slate-100 border-dashed border-slate-300 dark:bg-slate-900 dark:border-slate-700',
  STAIRS: 'hatch bg-slate-100 border-slate-300 dark:bg-slate-900 dark:border-slate-700',
  ELEVATOR: 'hatch bg-slate-100 border-slate-300 dark:bg-slate-900 dark:border-slate-700',
  GYM: 'bg-emerald-50 border-emerald-300 dark:bg-emerald-900/30 dark:border-emerald-600',
  CANTEEN: 'bg-orange-50 border-orange-300 dark:bg-orange-900/30 dark:border-orange-600',
  TEACHERS_ROOM: 'bg-indigo-50 border-indigo-300 dark:bg-indigo-900/30 dark:border-indigo-600',
  DIRECTOR_OFFICE: 'bg-violet-50 border-violet-300 dark:bg-violet-900/30 dark:border-violet-600',
  HEAD_TEACHER_OFFICE: 'bg-fuchsia-50 border-fuchsia-300 dark:bg-fuchsia-900/30 dark:border-fuchsia-600',
  RECEPTION: 'bg-sky-50 border-sky-300 dark:bg-sky-900/30 dark:border-sky-600',
};

type Drag = { id: string; kind: 'move' | 'resize'; startX: number; startY: number; orig: Room };

export function SchoolEditorPage() {
  const toast = useToast();
  const { data, reload } = useLoad(() => directorApi.get<Building[]>('/api/director/buildings'));
  const [buildingKind, setBuildingKind] = useState<'SCHOOL' | 'CANTEEN'>('SCHOOL');
  const [floorId, setFloorId] = useState<string | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [floorSize, setFloorSize] = useState({ width: 1000, height: 420 });
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [snapOn, setSnapOn] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newRoom, setNewRoom] = useState({ code: '', name: '', type: 'CLASSROOM' as RoomType });
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(800);
  const drag = useRef<Drag | null>(null);

  const building = data?.find((b) => b.kind === buildingKind);
  const floor = building?.floors.find((f) => f.id === floorId) ?? building?.floors[0];

  useEffect(() => {
    if (!floor) return;
    if (floor.id !== floorId) setFloorId(floor.id);
    if (!dirty) {
      setRooms(floor.rooms.map((r) => ({ ...r })));
      setFloorSize({ width: floor.width, height: floor.height });
    }
  }, [floor, dirty]);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

  const scale = boxW / floorSize.width;
  const sel = rooms.find((r) => r.id === selected);

  const update = (id: string, patch: Partial<Room>) => {
    setRooms((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  const onPointerDown = (e: React.PointerEvent, room: Room, kind: Drag['kind']) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setSelected(room.id);
    drag.current = { id: room.id, kind, startX: e.clientX, startY: e.clientY, orig: { ...room } };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / scale;
    const dy = (e.clientY - d.startY) / scale;
    if (d.kind === 'move') {
      update(d.id, {
        x: Math.max(0, Math.min(floorSize.width - d.orig.width, snap(d.orig.x + dx, snapOn))),
        y: Math.max(0, Math.min(floorSize.height - d.orig.height, snap(d.orig.y + dy, snapOn))),
      });
    } else {
      update(d.id, {
        width: Math.max(30, Math.min(floorSize.width - d.orig.x, snap(d.orig.width + dx, snapOn))),
        height: Math.max(30, Math.min(floorSize.height - d.orig.y, snap(d.orig.height + dy, snapOn))),
      });
    }
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  // Стрелки клавиатуры — точное смещение выбранного помещения
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!sel || (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
      const step = e.shiftKey ? GRID : 1;
      const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const m = moves[e.key];
      if (!m) return;
      e.preventDefault();
      update(sel.id, { x: Math.max(0, sel.x + m[0]), y: Math.max(0, sel.y + m[1]) });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel]);

  const save = async () => {
    if (!floor) return;
    setSaving(true);
    try {
      // Код и тип меняются отдельным запросом (с проверкой уникальности кода)
      for (const r of rooms) {
        const orig = floor.rooms.find((o) => o.id === r.id);
        if (orig && (orig.code !== r.code || orig.type !== r.type)) await directorApi.patch(`/api/director/rooms/${r.id}`, { code: r.code, type: r.type });
      }
      await directorApi.put(`/api/director/floors/${floor.id}/layout`, {
        width: floorSize.width,
        height: floorSize.height,
        rooms: rooms.map((r) => ({ id: r.id, x: r.x, y: r.y, width: r.width, height: r.height, name: r.name })),
      });
      setDirty(false);
      toast('success', 'Планировка сохранена — монитор обновлён');
      await reload();
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const addRoom = async () => {
    if (!floor) return;
    if (dirty) return toast('error', 'Сначала сохраните или отмените изменения');
    try {
      const r = await directorApi.post<{ id: string }>('/api/director/rooms', {
        floorId: floor.id,
        code: newRoom.code.trim(),
        name: newRoom.name.trim() || `Кабинет ${newRoom.code.trim()}`,
        type: newRoom.type,
        x: 40,
        y: 40,
        width: 200,
        height: 130,
      });
      setNewRoom({ code: '', name: '', type: 'CLASSROOM' });
      await reload();
      setSelected(r.id);
      toast('success', 'Помещение добавлено — перетащите его на нужное место');
    } catch (e) {
      toast('error', (e as Error).message);
    }
  };

  const removeRoom = async (room: Room) => {
    if (dirty) return toast('error', 'Сначала сохраните или отмените изменения');
    if (!confirm(`Удалить «${room.name}»?`)) return;
    try {
      await directorApi.del(`/api/director/rooms/${room.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && confirm(`${e.message}\n\nУдалить всё равно? Уроки останутся в расписании без привязки к кабинету.`)) {
        await directorApi.del(`/api/director/rooms/${room.id}?force=1`);
      } else if (!(e instanceof ApiError && e.status === 409)) return toast('error', (e as Error).message);
      else return;
    }
    setSelected(null);
    toast('success', 'Помещение удалено');
    await reload();
  };

  const floors = useMemo(() => building?.floors ?? [], [building]);
  if (!data) return <PageLoader />;

  return (
    <Page
      title="Редактор школы"
      subtitle="Перетаскивайте помещения мышью, тяните за угол, чтобы изменить размер. Стрелки — точное смещение (Shift — шаг 10)."
      actions={
        <>
          {dirty && (
            <Button
              variant="ghost"
              icon={<RotateCcw className="h-4 w-4" />}
              onClick={() => {
                setDirty(false);
                setSelected(null);
              }}
            >
              Отменить
            </Button>
          )}
          <Button onClick={save} loading={saving} disabled={!dirty} icon={<Save className="h-4 w-4" />}>
            Сохранить изменения
          </Button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-white/5">
          {(['SCHOOL', 'CANTEEN'] as const).map((k) => (
            <button
              key={k}
              disabled={dirty}
              onClick={() => {
                setBuildingKind(k);
                setFloorId(null);
                setSelected(null);
              }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${buildingKind === k ? 'bg-white shadow dark:bg-slate-800' : 'text-slate-500'}`}
            >
              {k === 'SCHOOL' ? 'Школа' : 'Столовая'}
            </button>
          ))}
        </div>
        <div className="thin-scroll flex gap-1 overflow-x-auto">
          {floors.map((f) => (
            <button
              key={f.id}
              disabled={dirty && f.id !== floor?.id}
              onClick={() => {
                setFloorId(f.id);
                setSelected(null);
              }}
              className={`shrink-0 rounded-xl px-3 py-1.5 text-sm font-medium transition disabled:opacity-40 ${f.id === floor?.id ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-white/5 dark:text-slate-300'}`}
            >
              {f.name}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input type="checkbox" className="accent-brand-600" checked={snapOn} onChange={(e) => setSnapOn(e.target.checked)} />
          <Grid3x3 className="h-4 w-4" /> Привязка к сетке
        </label>
      </div>
      {dirty && (
        <div className="mb-3">
          <Alert kind="warning">Есть несохранённые изменения. Нажмите «Сохранить изменения», чтобы они появились на мониторе.</Alert>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="card p-3">
          <div
            ref={boxRef}
            className="relative w-full touch-none select-none overflow-hidden rounded-2xl bg-[linear-gradient(to_right,rgb(148_163_184/0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgb(148_163_184/0.12)_1px,transparent_1px)] dark:bg-slate-950/50"
            style={{ height: floorSize.height * scale, backgroundSize: `${GRID * 2 * scale}px ${GRID * 2 * scale}px` }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerDown={() => setSelected(null)}
          >
            {rooms.map((r) => {
              const active = r.id === selected;
              return (
                <motion.div
                  key={r.id}
                  layout={false}
                  onPointerDown={(e) => onPointerDown(e, r, 'move')}
                  className={`absolute cursor-move rounded-xl border-2 ${TYPE_COLOR[r.type] ?? 'bg-white border-slate-300 dark:bg-slate-800 dark:border-slate-600'} ${active ? '!border-brand-500 shadow-xl shadow-brand-500/20 ring-4 ring-brand-500/20' : ''}`}
                  style={{ left: r.x * scale, top: r.y * scale, width: r.width * scale, height: r.height * scale, zIndex: active ? 10 : 1 }}
                >
                  <div className="pointer-events-none p-1.5 text-[11px] font-semibold leading-tight text-slate-700 dark:text-slate-200">
                    {r.name}
                    {r.width * scale > 90 && <div className="font-normal text-slate-400">{r.code}</div>}
                  </div>
                  <div
                    onPointerDown={(e) => onPointerDown(e, r, 'resize')}
                    className={`absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-nwse-resize rounded-md border-2 border-white bg-brand-500 shadow ${active ? '' : 'opacity-0 hover:opacity-100'}`}
                  />
                </motion.div>
              );
            })}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            Размер этажа: {floorSize.width} × {floorSize.height} · помещений: {rooms.length}
          </div>
        </div>

        <div className="space-y-4">
          {sel ? (
            <div className="card space-y-3 p-5">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Помещение</span>
                {sel.timetableUses ? <Badge color="blue">в расписаниях: {sel.timetableUses}</Badge> : null}
              </div>
              <Field label="Название">
                <input className="input" value={sel.name} onChange={(e) => update(sel.id, { name: e.target.value })} />
              </Field>
              <Field label="Номер / код" hint="По нему сопоставляются кабинеты из расписаний (например, 404)">
                <input className="input" value={sel.code} onChange={(e) => update(sel.id, { code: e.target.value })} />
              </Field>
              <Field label="Тип">
                <select className="input" value={sel.type} onChange={(e) => update(sel.id, { type: e.target.value as RoomType })}>
                  {Object.entries(ROOM_TYPE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-4 gap-2">
                {(['x', 'y', 'width', 'height'] as const).map((k) => (
                  <Field key={k} label={{ x: 'X', y: 'Y', width: 'Шир.', height: 'Выс.' }[k]}>
                    <input className="input px-2" type="number" value={sel[k]} onChange={(e) => update(sel.id, { [k]: Math.max(0, Number(e.target.value)) })} />
                  </Field>
                ))}
              </div>
              <Button variant="danger" size="sm" className="w-full" icon={<Trash2 className="h-4 w-4" />} onClick={() => void removeRoom(sel)}>
                Удалить помещение
              </Button>
            </div>
          ) : (
            <div className="card p-5 text-sm text-slate-500">
              <MapIcon className="mb-2 h-6 w-6 text-brand-500" />
              Нажмите на помещение, чтобы изменить его название, номер, тип или размер.
            </div>
          )}

          <div className="card space-y-3 p-5">
            <div className="font-semibold">Добавить помещение на «{floor?.name}»</div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Номер / код">
                <input className="input" value={newRoom.code} onChange={(e) => setNewRoom({ ...newRoom, code: e.target.value })} placeholder="406" />
              </Field>
              <Field label="Тип">
                <select className="input" value={newRoom.type} onChange={(e) => setNewRoom({ ...newRoom, type: e.target.value as RoomType })}>
                  {Object.entries(ROOM_TYPE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Название">
              <input className="input" value={newRoom.name} onChange={(e) => setNewRoom({ ...newRoom, name: e.target.value })} placeholder={newRoom.code ? `Кабинет ${newRoom.code}` : 'Кабинет 406'} />
            </Field>
            <Button className="w-full" variant="secondary" disabled={!newRoom.code.trim()} onClick={() => void addRoom()} icon={<Plus className="h-4 w-4" />}>
              Добавить
            </Button>
          </div>

          <div className="card space-y-3 p-5">
            <div className="font-semibold">Размер этажа</div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Ширина">
                <input className="input" type="number" min={300} max={4000} value={floorSize.width} onChange={(e) => (setFloorSize({ ...floorSize, width: Number(e.target.value) }), setDirty(true))} />
              </Field>
              <Field label="Высота">
                <input className="input" type="number" min={150} max={3000} value={floorSize.height} onChange={(e) => (setFloorSize({ ...floorSize, height: Number(e.target.value) }), setDirty(true))} />
              </Field>
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}
