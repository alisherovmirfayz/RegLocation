import { Trophy, Utensils } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Building, Room, SnapshotTeacher as Teacher } from '../lib/types';
import { Avatar } from '../components/Avatar';
import { FloorPlan } from './FloorPlan';

const FLOOR_HEADER = 44;
const FLOOR_GAP = 28;
const PAD = 16;

const ROOM_STYLE: Record<string, string> = {
  CLASSROOM: 'bg-white/90 border-slate-300 dark:bg-slate-800/70 dark:border-slate-600/70',
  RECEPTION: 'bg-sky-50 border-sky-300 dark:bg-sky-900/40 dark:border-sky-500/50',
  TEACHERS_ROOM: 'bg-indigo-50 border-indigo-300 dark:bg-indigo-900/40 dark:border-indigo-500/50',
  DIRECTOR_OFFICE: 'bg-violet-50 border-violet-300 dark:bg-violet-900/40 dark:border-violet-500/50',
  HEAD_TEACHER_OFFICE: 'bg-fuchsia-50 border-fuchsia-300 dark:bg-fuchsia-900/30 dark:border-fuchsia-500/50',
  ACCOUNTING: 'bg-teal-50 border-teal-300 dark:bg-teal-900/30 dark:border-teal-500/50',
  STAIRS: 'hatch bg-slate-100 border-slate-300 dark:bg-slate-900/60 dark:border-slate-700',
  ELEVATOR: 'hatch bg-slate-100 border-slate-300 dark:bg-slate-900/60 dark:border-slate-700',
  CORRIDOR: 'bg-slate-100/60 border-dashed border-slate-300 dark:bg-slate-900/30 dark:border-slate-700',
  GYM: 'bg-emerald-50 border-emerald-300 dark:bg-emerald-900/30 dark:border-emerald-500/50',
  LAB: 'bg-cyan-50 border-cyan-300 dark:bg-cyan-900/30 dark:border-cyan-500/50',
  CANTEEN: 'bg-orange-50 border-orange-300 dark:bg-orange-900/30 dark:border-orange-500/50',
  STADIUM: 'bg-emerald-50 border-emerald-400 dark:bg-emerald-900/30 dark:border-emerald-500/50',
  KITCHEN: 'bg-amber-50 border-amber-300 dark:bg-amber-900/20 dark:border-amber-600/50',
  OTHER: 'bg-white/80 border-slate-300 dark:bg-slate-800/60 dark:border-slate-600/70',
};

interface Placed {
  teacher: Teacher;
  x: number;
  y: number;
  size: number;
  showName: boolean;
}

/** Раскладка аватарок внутри прямоугольника кабинета (сетка по центру). */
function layoutInRoom(rect: { x: number; y: number; w: number; h: number }, count: number) {
  const labelSpace = Math.min(30, rect.h * 0.28);
  // Снизу оставляем место под фамилию и класс, чтобы подписи не выходили за стену
  const captionSpace = Math.min(18, rect.h * 0.15);
  const availH = rect.h - labelSpace - captionSpace - 8;
  const availW = rect.w - 12;
  let best = { size: 20, cols: 1, rows: count };
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const size = Math.min(availW / cols, availH / rows) * 0.86;
    if (size > best.size) best = { size, cols, rows };
  }
  const size = Math.max(18, Math.min(68, best.size));
  const cellW = size / 0.86;
  const gridW = cellW * best.cols;
  const gridH = cellW * best.rows;
  const startX = rect.x + (rect.w - gridW) / 2;
  const startY = rect.y + labelSpace + Math.max(0, (availH - gridH) / 2) + 4;
  return Array.from({ length: count }, (_, i) => {
    const c = i % best.cols;
    const r = Math.floor(i / best.cols);
    return { x: startX + c * cellW + (cellW - size) / 2, y: startY + r * cellW + (cellW - size) / 2, size };
  });
}

export function BuildingMap({
  building,
  teachers,
  highlightOccupied,
  focusTeacherId,
  scrollRef,
  epochs,
  maxFloorHeight,
  columns = 1,
}: {
  building: Building;
  teachers: Teacher[];
  highlightOccupied: boolean;
  focusTeacherId: string | null;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  /** Ключ «эпохи» аватарки: меняется при перемещении по расписанию (без анимации пути) */
  epochs: Map<string, number>;
  /** Ограничение высоты этажа (px), чтобы на экране помещалось несколько этажей */
  maxFloorHeight?: number;
  /** Сколько этажей в ряд (2 — на мониторе без списка учителей видно сразу 4 этажа) */
  columns?: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const floors = useMemo(() => [...building.floors].sort((a, b) => a.sortOrder - b.sortOrder), [building]);
  const isCanteen = building.kind === 'CANTEEN';
  const isStadium = building.kind === 'STADIUM';

  const geometry = useMemo(() => {
    const cols = Math.max(1, Math.min(columns, floors.length || 1));
    const colGap = cols > 1 ? FLOOR_GAP : 0;
    const inner = Math.max(200, width - PAD * 2);
    const colW = (inner - colGap * (cols - 1)) / cols;
    let top = PAD;
    let rowHeight = 0;
    const rooms = new Map<string, { room: Room; x: number; y: number; w: number; h: number }>();
    const floorBoxes = floors.map((f, i) => {
      const col = i % cols;
      // Новый ряд этажей начинается ниже самого высокого этажа предыдущего ряда
      if (col === 0 && i > 0) {
        top += rowHeight + FLOOR_GAP;
        rowHeight = 0;
      }
      const fw = maxFloorHeight ? Math.min(colW, (maxFloorHeight * f.width) / f.height) : colW;
      const left = PAD + col * (colW + colGap) + (colW - fw) / 2;
      const scale = fw / f.width;
      const h = f.height * scale;
      const box = { floor: f, top, height: h + FLOOR_HEADER, scale, left: left - PAD, width: fw + PAD * 2, planLeft: left, planTop: top + FLOOR_HEADER, planW: fw, planH: h };
      for (const r of f.rooms) {
        rooms.set(r.id, { room: r, x: left + r.x * scale, y: top + FLOOR_HEADER + r.y * scale, w: r.width * scale, h: r.height * scale });
      }
      rowHeight = Math.max(rowHeight, h + FLOOR_HEADER);
      return box;
    });
    return { rooms, floorBoxes, total: top + rowHeight + PAD };
  }, [floors, width, maxFloorHeight, columns]);

  const byRoom = useMemo(() => {
    const m = new Map<string, Teacher[]>();
    for (const t of teachers) {
      if (!t.present || !t.location.roomId || !geometry.rooms.has(t.location.roomId)) continue;
      const list = m.get(t.location.roomId) ?? [];
      list.push(t);
      m.set(t.location.roomId, list);
    }
    for (const list of m.values()) list.sort((a, b) => a.lastName.localeCompare(b.lastName, 'ru'));
    return m;
  }, [teachers, geometry]);

  const occupiedIds = useMemo(() => new Set(byRoom.keys()), [byRoom]);

  const placed: Placed[] = useMemo(() => {
    const out: Placed[] = [];
    for (const [roomId, list] of byRoom) {
      const g = geometry.rooms.get(roomId)!;
      const spots = layoutInRoom(g, list.length);
      list.forEach((t, i) => out.push({ teacher: t, ...spots[i]!, showName: spots[i]!.size >= 44 && list.length <= 6 }));
    }
    return out;
  }, [byRoom, geometry]);

  // Прокрутка к выбранному учителю
  useEffect(() => {
    if (!focusTeacherId || !scrollRef?.current) return;
    const p = placed.find((x) => x.teacher.id === focusTeacherId);
    if (p) scrollRef.current.scrollTo({ top: Math.max(0, p.y - scrollRef.current.clientHeight / 2), behavior: 'smooth' });
  }, [focusTeacherId, placed, scrollRef]);

  return (
    <div ref={boxRef} className={`relative w-full ${isCanteen ? 'canteen' : ''}`} style={{ height: geometry.total }}>
      {geometry.floorBoxes.map(({ floor, top, height, left, width: w, planLeft, planTop, planW, planH }) => (
        <div key={floor.id}>
          <div className="absolute" style={{ top: top - 8, height: height + 16, left: left + 8, width: w - 16 }}>
            <div className="absolute inset-0 rounded-3xl border border-slate-200/80 bg-white/40 shadow-sm dark:border-white/5 dark:bg-white/[0.025]" />
            <div className="absolute left-4 top-3 flex items-center gap-2">
              <span className={`flex h-7 min-w-7 items-center justify-center rounded-lg px-2 text-sm font-bold text-white shadow ${isCanteen ? 'bg-orange-500' : isStadium ? 'bg-emerald-600' : 'bg-brand-600'}`}>
                {isCanteen ? <Utensils className="h-4 w-4" /> : isStadium ? <Trophy className="h-4 w-4" /> : floor.level}
              </span>
              <span className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">{floor.name}</span>
            </div>
          </div>
          <div className="absolute" style={{ left: planLeft, top: planTop, width: planW, height: planH }}>
            <FloorPlan floor={floor} width={planW} height={planH} occupied={occupiedIds} />
          </div>
        </div>
      ))}

      {[...geometry.rooms.values()].map(({ room, x, y, w, h }) => {
        const occupants = byRoom.get(room.id)?.length ?? 0;
        const passive = room.type === 'CORRIDOR' || room.type === 'STAIRS' || room.type === 'ELEVATOR';
        return (
          <div
            key={room.id}
            className={`pointer-events-none absolute rounded-[3px] ${occupants && highlightOccupied ? 'room-glow' : ''}`}
            style={{ left: x, top: y, width: w, height: h }}
          >
            <div className={`flex items-start justify-between gap-1 px-2 pt-1.5 ${passive ? 'opacity-60' : ''}`}>
              {room.type === 'CORRIDOR' ? (
                <span className="text-[10px] font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500">{room.name}</span>
              ) : (
                <span
                  className={`truncate rounded-md px-1.5 py-0.5 font-semibold shadow-sm ${w < 110 ? 'text-[10px]' : 'text-xs'} ${passive ? 'bg-transparent text-slate-500 shadow-none dark:text-slate-400' : 'bg-white/90 text-slate-700 dark:bg-slate-900/80 dark:text-slate-100'}`}
                >
                  {room.name}
                </span>
              )}
              <AnimatePresence>
                {occupants > 0 && (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    className={`rounded-full px-1.5 text-[10px] font-bold text-white ${isCanteen ? 'bg-orange-500' : isStadium ? 'bg-emerald-600' : 'bg-brand-500'}`}
                  >
                    {occupants}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </div>
        );
      })}

      {/* Слой аватарок: позиционирование через transform — плавные перемещения без перерисовки карты */}
      <AnimatePresence>
        {placed.map((p) => {
          const key = `${p.teacher.id}:${epochs.get(p.teacher.id) ?? 0}`;
          const focused = focusTeacherId === p.teacher.id;
          return (
            <motion.div
              key={key}
              className="absolute left-0 top-0 flex flex-col items-center"
              style={{ width: p.size, zIndex: focused ? 30 : 10 }}
              initial={{ x: p.x, y: p.y, scale: 0.3, opacity: 0 }}
              animate={{ x: p.x, y: p.y, scale: focused ? 1.18 : 1, opacity: 1 }}
              exit={{ scale: 0.3, opacity: 0, transition: { duration: 0.45 } }}
              transition={{ type: 'spring', stiffness: 70, damping: 16, mass: 0.9, opacity: { duration: 0.5 } }}
            >
              <div className="bob" style={{ animationDelay: `${-(p.teacher.id.charCodeAt(0) % 7) * 0.6}s` }}>
                <Avatar name={p.teacher} url={p.teacher.avatarUrl} size={p.size} className={focused ? '!ring-amber-400 !ring-4' : ''} />
              </div>
              {(p.showName || p.teacher.location.className) && (
                <span className="mt-0.5 flex max-w-[160%] items-center gap-0.5 whitespace-nowrap rounded-md bg-white/85 px-0.5 py-px text-[10px] font-medium leading-tight text-slate-700 shadow-sm dark:bg-slate-900/80 dark:text-slate-200">
                  {p.showName && <span className="truncate px-0.5">{p.teacher.lastName}</span>}
                  {/* Класс, у которого сейчас идёт урок */}
                  {p.teacher.location.className && (
                    <span className="rounded bg-emerald-500 px-1 font-bold text-white" title={`Урок в классе ${p.teacher.location.className}`}>
                      {p.teacher.location.className}
                    </span>
                  )}
                </span>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
