import { memo, type ReactNode } from 'react';
import type { Floor, Room } from '../lib/types';

/**
 * Архитектурная отрисовка этажа в SVG: стены, двери в коридор, окна на наружных стенах,
 * мебель по типу помещения (парты и доска, спортзал, столовая, лестница, лифт, туалет…).
 * Координаты — в единицах этажа (viewBox), поэтому схема одинаково чёткая на любом экране.
 */

const WALL = 'stroke-slate-400 dark:stroke-slate-500';
const OUTER = 'stroke-slate-500 dark:stroke-slate-400';
const FURN = 'fill-slate-300/70 stroke-slate-400/80 dark:fill-slate-600/50 dark:stroke-slate-500/70';
const LINE = 'stroke-slate-400/70 dark:stroke-slate-500/70';

const FLOOR_FILL: Partial<Record<Room['type'], string>> = {
  CLASSROOM: 'fill-amber-50 dark:fill-[#1f2a40]',
  LAB: 'fill-cyan-50 dark:fill-[#17303d]',
  GYM: 'fill-[#e9f6ec] dark:fill-[#163126]',
  CANTEEN: 'fill-orange-50 dark:fill-[#33261c]',
  STADIUM: 'fill-[#14532d] dark:fill-[#0d2e1a]',
  KITCHEN: 'fill-stone-100 dark:fill-[#2a2622]',
  TEACHERS_ROOM: 'fill-indigo-50 dark:fill-[#222645]',
  DIRECTOR_OFFICE: 'fill-violet-50 dark:fill-[#2a2346]',
  HEAD_TEACHER_OFFICE: 'fill-fuchsia-50 dark:fill-[#30213f]',
  ACCOUNTING: 'fill-teal-50 dark:fill-[#18312f]',
  RECEPTION: 'fill-sky-50 dark:fill-[#183048]',
  CORRIDOR: 'fill-slate-100 dark:fill-[#141c2e]',
  STAIRS: 'fill-slate-200 dark:fill-[#1a2236]',
  ELEVATOR: 'fill-slate-200 dark:fill-[#1a2236]',
  OTHER: 'fill-slate-50 dark:fill-[#1b2335]',
};

const isWc = (r: Room) => /wc|туалет|санузел|hojatxona/i.test(`${r.code} ${r.name}`);
const near = (a: number, b: number, tol = 6) => Math.abs(a - b) <= tol;

type Side = 'top' | 'bottom' | 'left' | 'right';

/** Сторона, которой помещение примыкает к коридору, и участок общей стены. */
function doorSide(room: Room, corridors: Room[]): DoorInfo | null {
  for (const c of corridors) {
    const ox1 = Math.max(room.x, c.x), ox2 = Math.min(room.x + room.width, c.x + c.width);
    const oy1 = Math.max(room.y, c.y), oy2 = Math.min(room.y + room.height, c.y + c.height);
    if (ox2 - ox1 > 20) {
      if (near(room.y + room.height, c.y, 18)) return { side: 'bottom', from: ox1, to: ox2 };
      if (near(room.y, c.y + c.height, 18)) return { side: 'top', from: ox1, to: ox2 };
    }
    if (oy2 - oy1 > 20) {
      if (near(room.x + room.width, c.x, 18)) return { side: 'right', from: oy1, to: oy2 };
      if (near(room.x, c.x + c.width, 18)) return { side: 'left', from: oy1, to: oy2 };
    }
  }
  return null;
}

type DoorInfo = { side: Side; from: number; to: number };

/** Общая стена двух помещений: сторона помещения a и участок вдоль неё. */
function sharedEdge(a: Room, b: Room): DoorInfo | null {
  const ox1 = Math.max(a.x, b.x), ox2 = Math.min(a.x + a.width, b.x + b.width);
  const oy1 = Math.max(a.y, b.y), oy2 = Math.min(a.y + a.height, b.y + b.height);
  if (ox2 - ox1 > 10) {
    if (near(a.y + a.height, b.y, 3)) return { side: 'bottom', from: ox1, to: ox2 };
    if (near(a.y, b.y + b.height, 3)) return { side: 'top', from: ox1, to: ox2 };
  }
  if (oy2 - oy1 > 10) {
    if (near(a.x + a.width, b.x, 3)) return { side: 'right', from: oy1, to: oy2 };
    if (near(a.x, b.x + b.width, 3)) return { side: 'left', from: oy1, to: oy2 };
  }
  return null;
}

/** Размер двери и её положение вдоль стены */
function doorGeom(info: DoorInfo) {
  const len = Math.min(46, Math.max(22, (info.to - info.from) * 0.22));
  const along = info.to - len - Math.min(26, (info.to - info.from) * 0.12);
  return { len, along };
}

/**
 * Соседние лестничные пролёты (например, U-образная лестница вокруг лифта) — одна лестница:
 * цепочка помещений от одного конца к другому. Одиночные лестницы в группы не входят.
 */
export function stairChains(rooms: Room[]): Room[][] {
  const stairs = rooms.filter((r) => r.type === 'STAIRS');
  const adj = new Map(stairs.map((s) => [s.id, stairs.filter((o) => o.id !== s.id && sharedEdge(s, o))]));
  const seen = new Set<string>();
  const chains: Room[][] = [];
  for (const s of stairs) {
    if (seen.has(s.id)) continue;
    const comp: Room[] = [];
    const stack = [s];
    while (stack.length) {
      const c = stack.pop()!;
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      comp.push(c);
      stack.push(...adj.get(c.id)!);
    }
    if (comp.length < 2 || comp.some((c) => adj.get(c.id)!.length > 2)) continue;
    const ends = comp.filter((c) => adj.get(c.id)!.length === 1).sort((a, b) => a.x - b.x || a.y - b.y);
    if (!ends.length) continue;
    const chain = [ends[0]!];
    while (chain.length < comp.length) {
      const next = adj.get(chain[chain.length - 1]!.id)!.find((o) => !chain.includes(o));
      if (!next) break;
      chain.push(next);
    }
    if (chain.length === comp.length) chains.push(chain);
  }
  return chains;
}

/** Лестницы, у которых подпись не нужна: вторые и следующие пролёты одной лестницы */
export function hiddenStairLabels(rooms: Room[]): Set<string> {
  return new Set(stairChains(rooms).flatMap((c) => c.slice(1).map((r) => r.id)));
}

type Pt = { x: number; y: number };

type Box = { x1: number; y1: number; x2: number; y2: number };

/**
 * Составная лестница (например, U-образная вокруг лифта): прямые марши со ступенями поперёк хода,
 * а на поворотах — плавный веер забежных ступеней из внутреннего угла.
 */
function StairChain({ chain }: { chain: Room[] }) {
  const STEP = 13;
  const edges = chain.slice(0, -1).map((r, i) => sharedEdge(r, chain[i + 1]!)!);
  const axis = chain.map((r, i): 'h' | 'v' => {
    if (i > 0 && i < chain.length - 1) return edges[i - 1]!.side === 'left' || edges[i - 1]!.side === 'right' ? 'h' : 'v';
    return r.height >= r.width ? 'v' : 'h';
  });
  // Повороты: участок пролёта, где марш меняет направление, и внутренний угол веера
  const turns: { room: number; q: Box; pivot: Pt }[] = [];
  edges.forEach((e, i) => {
    if (axis[i] === axis[i + 1]) return;
    // Поворот лежит в том пролёте, к боковой стене которого примыкает соседний
    const sideAxis = e.side === 'left' || e.side === 'right' ? 'v' : 'h';
    const host = axis[i] === sideAxis ? i : i + 1;
    const r = chain[host]!;
    const other = chain[host === i ? i + 1 : i]!;
    if (sideAxis === 'v') {
      const q = { x1: r.x, x2: r.x + r.width, y1: Math.max(r.y, other.y), y2: Math.min(r.y + r.height, other.y + other.height) };
      const px = other.x >= r.x + r.width - 3 ? r.x + r.width : r.x;
      const py = near(q.y1, r.y, 3) ? q.y2 : q.y1;
      turns.push({ room: host, q, pivot: { x: px, y: py } });
    } else {
      const q = { y1: r.y, y2: r.y + r.height, x1: Math.max(r.x, other.x), x2: Math.min(r.x + r.width, other.x + other.width) };
      const py = other.y >= r.y + r.height - 3 ? r.y + r.height : r.y;
      const px = near(q.x1, r.x, 3) ? q.x2 : q.x1;
      turns.push({ room: host, q, pivot: { x: px, y: py } });
    }
  });

  const els: ReactNode[] = [];
  chain.forEach((r, i) => {
    const vertical = axis[i] === 'v';
    const lo = vertical ? r.y : r.x, hi = vertical ? r.y + r.height : r.x + r.width;
    // Прямые участки марша = пролёт без зон поворота
    let free: [number, number][] = [[lo, hi]];
    for (const t of turns.filter((t) => t.room === i)) {
      const a = vertical ? t.q.y1 : t.q.x1, b = vertical ? t.q.y2 : t.q.x2;
      free = free.flatMap(([f, to]): [number, number][] => {
        const parts: [number, number][] = [[f, Math.min(to, a)], [Math.max(f, b), to]];
        return parts.filter(([u, v]) => v - u > 2);
      });
    }
    for (const [f, to] of free) {
      const n = Math.max(1, Math.round((to - f) / STEP));
      for (let k = 0; k <= n; k++) {
        const s = f + ((to - f) * k) / n;
        if (s <= lo + 2 || s >= hi - 2) continue; // по стенам ступени не рисуются
        els.push(
          vertical ? (
            <line key={`s${i}-${s}`} x1={r.x + 3} y1={s} x2={r.x + r.width - 3} y2={s} className={LINE} strokeWidth={1.2} />
          ) : (
            <line key={`s${i}-${s}`} x1={s} y1={r.y + 3} x2={s} y2={r.y + r.height - 3} className={LINE} strokeWidth={1.2} />
          ),
        );
      }
    }
  });
  // Веер забежных ступеней
  turns.forEach(({ q, pivot }, ti) => {
    const fx = near(pivot.x, q.x1, 1) ? q.x2 : q.x1, fy = near(pivot.y, q.y1, 1) ? q.y2 : q.y1;
    const a0 = Math.atan2(0, fx - pivot.x), a1 = Math.atan2(fy - pivot.y, 0);
    let da = a1 - a0;
    if (da > Math.PI) da -= 2 * Math.PI;
    if (da < -Math.PI) da += 2 * Math.PI;
    const qw = q.x2 - q.x1, qh = q.y2 - q.y1;
    const n = Math.max(3, Math.round(((Math.PI / 2) * Math.max(qw, qh)) / (STEP * 2.2)));
    for (let k = 1; k < n; k++) {
      const ang = a0 + (da * k) / n;
      const c = Math.cos(ang), s = Math.sin(ang);
      const t = Math.min(Math.abs(c) > 1e-6 ? qw / Math.abs(c) : Infinity, Math.abs(s) > 1e-6 ? qh / Math.abs(s) : Infinity) - 2;
      els.push(<line key={`w${ti}-${k}`} x1={pivot.x} y1={pivot.y} x2={pivot.x + c * t} y2={pivot.y + s * t} className={LINE} strokeWidth={1.2} />);
    }
    // Границы поворота с прямыми маршами — тоже ступени
    els.push(<line key={`wa${ti}`} x1={pivot.x} y1={pivot.y} x2={fx} y2={pivot.y} className={LINE} strokeWidth={1.2} />);
    els.push(<line key={`wb${ti}`} x1={pivot.x} y1={pivot.y} x2={pivot.x} y2={fy} className={LINE} strokeWidth={1.2} />);
  });
  // Стены только снаружи лестницы: общие участки между пролётами не рисуются
  const walls: ReactNode[] = [];
  for (const r of chain) {
    const sides: { side: Side; a: Pt; b: Pt }[] = [
      { side: 'top', a: { x: r.x, y: r.y }, b: { x: r.x + r.width, y: r.y } },
      { side: 'bottom', a: { x: r.x, y: r.y + r.height }, b: { x: r.x + r.width, y: r.y + r.height } },
      { side: 'left', a: { x: r.x, y: r.y }, b: { x: r.x, y: r.y + r.height } },
      { side: 'right', a: { x: r.x + r.width, y: r.y }, b: { x: r.x + r.width, y: r.y + r.height } },
    ];
    for (const s of sides) {
      const horizontal = s.side === 'top' || s.side === 'bottom';
      let segs: [number, number][] = [horizontal ? [s.a.x, s.b.x] : [s.a.y, s.b.y]];
      for (const o of chain) {
        if (o.id === r.id) continue;
        const e = sharedEdge(r, o);
        if (!e || e.side !== s.side) continue;
        segs = segs.flatMap(([f, t]): [number, number][] => {
          const parts: [number, number][] = [[f, Math.min(t, e.from)], [Math.max(f, e.to), t]];
          return parts.filter(([u, v]) => v - u > 1);
        });
      }
      segs.forEach(([f, t], k) =>
        walls.push(
          horizontal ? (
            <line key={`${r.id}${s.side}${k}`} x1={f} y1={s.a.y} x2={t} y2={s.a.y} className={WALL} strokeWidth={3} strokeLinecap="square" />
          ) : (
            <line key={`${r.id}${s.side}${k}`} x1={s.a.x} y1={f} x2={s.a.x} y2={t} className={WALL} strokeWidth={3} strokeLinecap="square" />
          ),
        ),
      );
    }
  }
  return (
    <g>
      {els}
      {walls}
    </g>
  );
}

/** Стена для доски в классе: смежная с соседним кабинетом, поперёк стены с дверью. */
function boardSide(room: Room, door: DoorInfo | null, rooms: Room[]): Side {
  const perp: Side[] = !door ? ['left', 'right', 'top', 'bottom'] : door.side === 'top' || door.side === 'bottom' ? ['left', 'right'] : ['top', 'bottom'];
  const neighbour = (s: Side) => rooms.some((o) => o.id !== room.id && o.type !== 'CORRIDOR' && sharedEdge(room, o)?.side === s);
  return perp.find(neighbour) ?? (door ? perp[0]! : 'top');
}

const isEntrance = (r: Room) => /вход|выход|kirish|chiqish|entrance|exit/i.test(r.name);

/** Наружная стена помещения (для входной двери здания) */
function outerSide(room: Room, b: { x1: number; y1: number; x2: number; y2: number }): DoorInfo | null {
  if (near(room.x + room.width, b.x2)) return { side: 'right', from: room.y, to: room.y + room.height };
  if (near(room.y + room.height, b.y2)) return { side: 'bottom', from: room.x, to: room.x + room.width };
  if (near(room.x, b.x1)) return { side: 'left', from: room.y, to: room.y + room.height };
  if (near(room.y, b.y1)) return { side: 'top', from: room.x, to: room.x + room.width };
  return null;
}

function Door({ room, info, gap = 6 }: { room: Room; info: DoorInfo; gap?: number }) {
  const { len, along } = doorGeom(info);
  const cls = 'stroke-brand-400/80 dark:stroke-brand-300/70';
  if (info.side === 'bottom' || info.side === 'top') {
    const y = info.side === 'bottom' ? room.y + room.height : room.y;
    const dir = info.side === 'bottom' ? -1 : 1;
    return (
      <g>
        <line x1={along} y1={y} x2={along + len} y2={y} className="stroke-slate-100 dark:stroke-[#141c2e]" strokeWidth={gap} />
        <line x1={along} y1={y} x2={along} y2={y + dir * len} className={cls} strokeWidth={2} />
        <path d={`M ${along} ${y + dir * len} A ${len} ${len} 0 0 ${dir > 0 ? 0 : 1} ${along + len} ${y}`} className={cls} fill="none" strokeWidth={1.2} strokeDasharray="3 3" />
      </g>
    );
  }
  const x = info.side === 'right' ? room.x + room.width : room.x;
  const dir = info.side === 'right' ? -1 : 1;
  return (
    <g>
      <line x1={x} y1={along} x2={x} y2={along + len} className="stroke-slate-100 dark:stroke-[#141c2e]" strokeWidth={gap} />
      <line x1={x} y1={along} x2={x + dir * len} y2={along} className={cls} strokeWidth={2} />
      <path d={`M ${x + dir * len} ${along} A ${len} ${len} 0 0 ${dir > 0 ? 1 : 0} ${x} ${along + len}`} className={cls} fill="none" strokeWidth={1.2} strokeDasharray="3 3" />
    </g>
  );
}

/** Окна на наружных стенах здания */
function Windows({ room, bounds }: { room: Room; bounds: { x1: number; y1: number; x2: number; y2: number } }) {
  const out: ReactNode[] = [];
  const cls = 'stroke-sky-400 dark:stroke-sky-400/80';
  const seg = (x1: number, y1: number, x2: number, y2: number, key: string) => {
    const horizontal = y1 === y2;
    const len = horizontal ? x2 - x1 : y2 - y1;
    const n = Math.max(1, Math.floor(len / 110));
    for (let i = 0; i < n; i++) {
      const c = (i + 0.5) / n;
      const w = Math.min(60, len / n - 24);
      if (horizontal) {
        const cx = x1 + c * len;
        out.push(<line key={`${key}${i}`} x1={cx - w / 2} y1={y1} x2={cx + w / 2} y2={y1} className={cls} strokeWidth={5} strokeLinecap="round" />);
      } else {
        const cy = y1 + c * len;
        out.push(<line key={`${key}${i}`} x1={x1} y1={cy - w / 2} x2={x1} y2={cy + w / 2} className={cls} strokeWidth={5} strokeLinecap="round" />);
      }
    }
  };
  if (near(room.y, bounds.y1)) seg(room.x, room.y, room.x + room.width, room.y, 't');
  if (near(room.y + room.height, bounds.y2)) seg(room.x, room.y + room.height, room.x + room.width, room.y + room.height, 'b');
  if (near(room.x, bounds.x1)) seg(room.x, room.y, room.x, room.y + room.height, 'l');
  if (near(room.x + room.width, bounds.x2)) seg(room.x + room.width, room.y, room.x + room.width, room.y + room.height, 'r');
  return <g>{out}</g>;
}

/** Мебель и обозначения внутри помещения */
function Furniture({ room, door, board }: { room: Room; door: DoorInfo | null; board: Side }) {
  const { x, y, width: w, height: h } = room;
  const pad = 14;
  const top = y + 34; // место для подписи
  let x1 = x + pad, y1 = top, x2 = x + w - pad, y2 = y + h - pad;
  // Полоса у двери свободна: мебель не попадает под створку
  if (door && room.type !== 'GYM' && room.type !== 'STADIUM') {
    const clear = doorGeom(door).len + 8;
    if (door.side === 'top') y1 = Math.max(y1, y + clear);
    if (door.side === 'bottom') y2 = Math.min(y2, y + h - clear);
    if (door.side === 'left') x1 = Math.max(x1, x + clear);
    if (door.side === 'right') x2 = Math.min(x2, x + w - clear);
  }
  const ix = x1, iw = x2 - x1, iy = y1, ih = y2 - y1;
  // Лестница и лифт рисуются на всю площадь (подпись поверх), остальное — ниже подписи
  if ((iw < 30 || ih < 20) && room.type !== 'STAIRS' && room.type !== 'ELEVATOR') return null;
  const els: ReactNode[] = [];

  switch (room.type) {
    case 'CLASSROOM':
    case 'LAB': {
      // Доска на стене у соседнего кабинета; парты и стулья смотрят на неё.
      // Локальные координаты: u — вдоль доски, v — вглубь класса от доски.
      const alongX = board === 'top' || board === 'bottom';
      const U = alongX ? iw : ih, V = alongX ? ih : iw;
      const at = (u: number, v: number, du: number, dv: number) => {
        if (board === 'top') return { x: ix + u, y: iy + v, width: du, height: dv };
        if (board === 'bottom') return { x: ix + u, y: iy + ih - v - dv, width: du, height: dv };
        if (board === 'left') return { x: ix + v, y: iy + u, width: dv, height: du };
        return { x: ix + iw - v - dv, y: iy + u, width: dv, height: du };
      };
      const boardRect =
        board === 'top' ? { x: x + w * 0.3, y: y + 5, width: w * 0.4, height: 5 }
        : board === 'bottom' ? { x: x + w * 0.3, y: y + h - 10, width: w * 0.4, height: 5 }
        : board === 'left' ? { x: x + 5, y: y + h * 0.3, width: 5, height: h * 0.4 }
        : { x: x + w - 10, y: y + h * 0.3, width: 5, height: h * 0.4 };
      els.push(<rect key="board" {...boardRect} rx={2} className="fill-emerald-600/70 dark:fill-emerald-500/50" />);
      const front = 24;
      const deskW = Math.min(46, U / 5);
      els.push(<rect key="tdesk" {...at(U - deskW, 0, deskW, 14)} rx={3} className={FURN} strokeWidth={1} />);
      const cols = Math.max(2, Math.min(5, Math.floor(U / 62)));
      const rows = Math.max(1, Math.min(4, Math.floor((V - front) / 30)));
      const cw = U / cols;
      const rh = (V - front) / rows;
      const dv = Math.min(14, rh * 0.42);
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const u = c * cw + cw * 0.14, v = front + r * rh + rh * 0.18;
          els.push(<rect key={`d${r}${c}`} {...at(u, v, cw * 0.72, dv)} rx={2.5} className={FURN} strokeWidth={1} />);
          const seat = at(u + cw * 0.36, v + dv + 5, 0, 0);
          els.push(<circle key={`c${r}${c}`} cx={seat.x} cy={seat.y} r={3.2} className="fill-slate-300 dark:fill-slate-600/70" />);
        }
      if (room.type === 'LAB') {
        const g = at(14, 12, 0, 0);
        els.push(<circle key="gear" cx={g.x} cy={g.y} r={10} fill="none" className="stroke-cyan-500/70" strokeWidth={4} strokeDasharray="4 3" />);
        els.push(<circle key="gear2" cx={g.x} cy={g.y} r={3.5} className="fill-cyan-500/70" />);
      }
      break;
    }
    case 'GYM': {
      // Разметка площадки
      const cls = 'stroke-emerald-600/50 dark:stroke-emerald-400/40';
      els.push(<rect key="court" x={ix} y={iy} width={iw} height={ih} rx={4} fill="none" className={cls} strokeWidth={2} />);
      els.push(<line key="mid" x1={ix + iw / 2} y1={iy} x2={ix + iw / 2} y2={iy + ih} className={cls} strokeWidth={2} />);
      els.push(<circle key="cc" cx={ix + iw / 2} cy={iy + ih / 2} r={Math.min(ih, iw) * 0.18} fill="none" className={cls} strokeWidth={2} />);
      const k = Math.min(ih * 0.5, iw * 0.12);
      els.push(<path key="k1" d={`M ${ix} ${iy + ih / 2 - k} A ${k} ${k} 0 0 1 ${ix} ${iy + ih / 2 + k}`} fill="none" className={cls} strokeWidth={2} />);
      els.push(<path key="k2" d={`M ${ix + iw} ${iy + ih / 2 - k} A ${k} ${k} 0 0 0 ${ix + iw} ${iy + ih / 2 + k}`} fill="none" className={cls} strokeWidth={2} />);
      break;
    }
    case 'STADIUM': {
      // Футбольное поле: тёмный газон в полоску и белая разметка (без беговой дорожки)
      els.push(<rect key="grass" x={ix} y={iy} width={iw} height={ih} rx={4} className="fill-[#14532d] dark:fill-[#0d2e1a]" />);
      const m = Math.min(iw, ih) * 0.08;
      const fx = ix + m * 1.4, fy = iy + m, fw = iw - m * 2.8, fh = ih - m * 2;
      const stripes = 12;
      for (let k = 0; k < stripes; k += 2) {
        els.push(<rect key={`st${k}`} x={ix + (k * iw) / stripes} y={iy} width={iw / stripes} height={ih} className="fill-black/[0.12] dark:fill-black/25" />);
      }
      const line = 'stroke-white/80 dark:stroke-white/55';
      els.push(<rect key="pitch" x={fx} y={fy} width={fw} height={fh} fill="none" className={line} strokeWidth={2} />);
      els.push(<line key="half" x1={fx + fw / 2} y1={fy} x2={fx + fw / 2} y2={fy + fh} className={line} strokeWidth={2} />);
      els.push(<circle key="center" cx={fx + fw / 2} cy={fy + fh / 2} r={fh * 0.16} fill="none" className={line} strokeWidth={2} />);
      els.push(<circle key="spot" cx={fx + fw / 2} cy={fy + fh / 2} r={2.5} className="fill-white/90" />);
      const bw = fw * 0.13, bh = fh * 0.5;
      els.push(<rect key="boxL" x={fx} y={fy + (fh - bh) / 2} width={bw} height={bh} fill="none" className={line} strokeWidth={2} />);
      els.push(<rect key="boxR" x={fx + fw - bw} y={fy + (fh - bh) / 2} width={bw} height={bh} fill="none" className={line} strokeWidth={2} />);
      const gh = fh * 0.18, gw = Math.max(4, fw * 0.015);
      els.push(<rect key="goalL" x={fx - gw} y={fy + (fh - gh) / 2} width={gw} height={gh} className="fill-white/80 dark:fill-white/50" />);
      els.push(<rect key="goalR" x={fx + fw} y={fy + (fh - gh) / 2} width={gw} height={gh} className="fill-white/80 dark:fill-white/50" />);
      break;
    }
    case 'CANTEEN': {
      const cols = Math.max(2, Math.floor(iw / 90));
      const rows = Math.max(1, Math.floor(ih / 80));
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const cx = ix + (c + 0.5) * (iw / cols);
          const cy = iy + (r + 0.5) * (ih / rows);
          const rr = Math.min(16, iw / cols / 4);
          els.push(<circle key={`t${r}${c}`} cx={cx} cy={cy} r={rr} className="fill-orange-200/70 stroke-orange-300 dark:fill-orange-900/40 dark:stroke-orange-700/60" strokeWidth={1} />);
          for (let a = 0; a < 4; a++) {
            const ang = (a * Math.PI) / 2 + Math.PI / 4;
            els.push(<circle key={`s${r}${c}${a}`} cx={cx + Math.cos(ang) * (rr + 7)} cy={cy + Math.sin(ang) * (rr + 7)} r={3.5} className="fill-orange-300/60 dark:fill-orange-800/50" />);
          }
        }
      break;
    }
    case 'KITCHEN':
      els.push(<rect key="k1" x={ix} y={iy} width={iw} height={14} rx={2} className={FURN} strokeWidth={1} />);
      els.push(<rect key="k2" x={ix} y={iy} width={14} height={ih} rx={2} className={FURN} strokeWidth={1} />);
      for (let i = 0; i < 3; i++) els.push(<circle key={`p${i}`} cx={ix + 40 + i * 26} cy={iy + 7} r={4} className="fill-slate-400/60" />);
      break;
    case 'TEACHERS_ROOM': {
      const tw = iw * 0.6, th = Math.min(30, ih * 0.35);
      const tx = ix + (iw - tw) / 2, ty = iy + (ih - th) / 2;
      els.push(<rect key="tbl" x={tx} y={ty} width={tw} height={th} rx={8} className={FURN} strokeWidth={1} />);
      const n = Math.max(3, Math.floor(tw / 34));
      for (let i = 0; i < n; i++) {
        const cx = tx + ((i + 0.5) * tw) / n;
        els.push(<circle key={`a${i}`} cx={cx} cy={ty - 7} r={4} className="fill-slate-300 dark:fill-slate-600/70" />);
        els.push(<circle key={`b${i}`} cx={cx} cy={ty + th + 7} r={4} className="fill-slate-300 dark:fill-slate-600/70" />);
      }
      els.push(<rect key="sofa" x={ix} y={iy + ih - 16} width={Math.min(90, iw * 0.3)} height={16} rx={6} className={FURN} strokeWidth={1} />);
      break;
    }
    case 'DIRECTOR_OFFICE':
    case 'HEAD_TEACHER_OFFICE':
    case 'ACCOUNTING': {
      const dw = Math.min(70, iw * 0.65), dh = Math.min(26, ih * 0.3);
      const dx = ix + (iw - dw) / 2, dy = iy + ih * 0.25;
      els.push(<rect key="desk" x={dx} y={dy} width={dw} height={dh} rx={4} className={FURN} strokeWidth={1} />);
      els.push(<circle key="chair" cx={dx + dw / 2} cy={dy + dh + 9} r={6} className="fill-slate-300 dark:fill-slate-600/70" />);
      els.push(<rect key="cab" x={ix} y={iy + ih - 12} width={Math.min(60, iw * 0.5)} height={12} rx={2} className={FURN} strokeWidth={1} />);
      if (room.type === 'ACCOUNTING') els.push(<rect key="desk2" x={dx} y={dy + dh + 22} width={dw} height={dh * 0.8} rx={4} className={FURN} strokeWidth={1} />);
      break;
    }
    case 'RECEPTION': {
      const cx = ix + iw / 2, cy = iy + ih * 0.55, rr = Math.min(iw, ih) * 0.32;
      els.push(<path key="desk" d={`M ${cx - rr} ${cy} A ${rr} ${rr * 0.6} 0 0 0 ${cx + rr} ${cy}`} fill="none" className="stroke-sky-500/60" strokeWidth={10} strokeLinecap="round" />);
      els.push(<circle key="chair" cx={cx} cy={cy + rr * 0.15} r={6} className="fill-slate-300 dark:fill-slate-600/70" />);
      for (let i = 0; i < 3; i++) els.push(<rect key={`s${i}`} x={ix + i * 26} y={iy} width={20} height={12} rx={4} className={FURN} strokeWidth={1} />);
      break;
    }
    case 'STAIRS': {
      // Ступени поперёк длинной стороны (без стрелки)
      const vertical = h >= w;
      const n = Math.max(5, Math.floor((vertical ? h : w) / 14));
      for (let i = 1; i < n; i++) {
        const t = i / n;
        els.push(
          vertical ? (
            <line key={`s${i}`} x1={x + 4} y1={y + t * h} x2={x + w - 4} y2={y + t * h} className={LINE} strokeWidth={1.2} />
          ) : (
            <line key={`s${i}`} x1={x + t * w} y1={y + 4} x2={x + t * w} y2={y + h - 4} className={LINE} strokeWidth={1.2} />
          ),
        );
      }
      break;
    }
    case 'ELEVATOR': {
      const bw = Math.min(w, h) * 0.55;
      const bx = x + (w - bw) / 2, by = y + (h - bw) / 2;
      els.push(<rect key="cab" x={bx} y={by} width={bw} height={bw} rx={4} fill="none" className={LINE} strokeWidth={2} />);
      els.push(<line key="dl" x1={bx} y1={by} x2={bx + bw} y2={by + bw} className={LINE} strokeWidth={1} />);
      els.push(<line key="dr" x1={bx + bw} y1={by} x2={bx} y2={by + bw} className={LINE} strokeWidth={1} />);
      break;
    }
    case 'CORRIDOR': {
      const horizontal = w >= h;
      els.push(
        horizontal ? (
          <line key="c" x1={x + 10} y1={y + h / 2} x2={x + w - 10} y2={y + h / 2} className="stroke-slate-300/80 dark:stroke-slate-700/80" strokeWidth={1.5} strokeDasharray="10 10" />
        ) : (
          <line key="c" x1={x + w / 2} y1={y + 10} x2={x + w / 2} y2={y + h - 10} className="stroke-slate-300/80 dark:stroke-slate-700/80" strokeWidth={1.5} strokeDasharray="10 10" />
        ),
      );
      break;
    }
    case 'OTHER':
      if (isWc(room)) {
        const cx = x + w / 2, cy = y + h / 2 + 8;
        els.push(<circle key="h1" cx={cx - 14} cy={cy - 16} r={5} className="fill-sky-400/70" />);
        els.push(<rect key="b1" x={cx - 20} y={cy - 9} width={12} height={22} rx={4} className="fill-sky-400/70" />);
        els.push(<circle key="h2" cx={cx + 14} cy={cy - 16} r={5} className="fill-pink-400/70" />);
        els.push(<path key="b2" d={`M ${cx + 14} ${cy - 9} L ${cx + 22} ${cy + 13} L ${cx + 6} ${cy + 13} Z`} className="fill-pink-400/70" />);
      } else {
        for (let i = 0; i < 2; i++) els.push(<rect key={`sh${i}`} x={ix} y={iy + i * 20} width={iw} height={10} rx={2} className={FURN} strokeWidth={1} />);
      }
      break;
  }
  return <g>{els}</g>;
}

export const FloorPlan = memo(function FloorPlan({ floor, width, height, occupied }: { floor: Floor; width: number; height: number; occupied: Set<string> }) {
  const rooms = floor.rooms;
  const corridors = rooms.filter((r) => r.type === 'CORRIDOR');
  const bounds = rooms.length
    ? {
        x1: Math.min(...rooms.map((r) => r.x)),
        y1: Math.min(...rooms.map((r) => r.y)),
        x2: Math.max(...rooms.map((r) => r.x + r.width)),
        y2: Math.max(...rooms.map((r) => r.y + r.height)),
      }
    : { x1: 0, y1: 0, x2: floor.width, y2: floor.height };
  // Порядок: коридоры снизу, затем помещения
  const ordered = [...rooms].sort((a, b) => Number(b.type === 'CORRIDOR') - Number(a.type === 'CORRIDOR'));
  const chains = stairChains(rooms);
  const chained = new Set(chains.flat().map((r) => r.id));
  const doors = new Map(
    rooms
      .filter((r) => r.type !== 'CORRIDOR' && r.type !== 'ELEVATOR' && r.type !== 'STAIRS')
      .map((r) => [r.id, doorSide(r, corridors)] as const),
  );

  return (
    <svg viewBox={`0 0 ${floor.width} ${floor.height}`} width={width} height={height} className="absolute left-0 top-0 overflow-visible" aria-hidden>
      <defs>
        <pattern id={`tiles-${floor.id}`} width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M 24 0 L 0 0 0 24" fill="none" className="stroke-slate-300/40 dark:stroke-slate-700/40" strokeWidth={0.8} />
        </pattern>
        <pattern id={`wood-${floor.id}`} width="60" height="12" patternUnits="userSpaceOnUse">
          <path d="M 0 12 L 60 12 M 30 0 L 30 12" fill="none" className="stroke-amber-200/60 dark:stroke-slate-700/35" strokeWidth={0.8} />
        </pattern>
      </defs>
      {/* Тень и контур здания */}
      <rect x={bounds.x1 - 6} y={bounds.y1 - 6} width={bounds.x2 - bounds.x1 + 12} height={bounds.y2 - bounds.y1 + 12} rx={10} className="fill-white/60 dark:fill-slate-950/40" />
      {ordered.map((r) => (
        <g key={r.id}>
          <rect x={r.x} y={r.y} width={r.width} height={r.height} className={FLOOR_FILL[r.type] ?? FLOOR_FILL.OTHER} />
          {(r.type === 'CORRIDOR' || r.type === 'RECEPTION' || r.type === 'CANTEEN' || isWc(r)) && (
            <rect x={r.x} y={r.y} width={r.width} height={r.height} fill={`url(#tiles-${floor.id})`} />
          )}
          {(r.type === 'CLASSROOM' || r.type === 'TEACHERS_ROOM' || r.type === 'DIRECTOR_OFFICE' || r.type === 'HEAD_TEACHER_OFFICE' || r.type === 'ACCOUNTING' || r.type === 'LAB') && (
            <rect x={r.x} y={r.y} width={r.width} height={r.height} fill={`url(#wood-${floor.id})`} />
          )}
          {occupied.has(r.id) && <rect x={r.x} y={r.y} width={r.width} height={r.height} className="fill-brand-400/10 dark:fill-brand-400/10" />}
          {!chained.has(r.id) && <Furniture room={r} door={doors.get(r.id) ?? null} board={r.type === 'CLASSROOM' || r.type === 'LAB' ? boardSide(r, doors.get(r.id) ?? null, rooms) : 'top'} />}
        </g>
      ))}
      {/* Стены (у составной лестницы — только наружные, вместе со ступенями) */}
      {ordered
        .filter((r) => r.type !== 'CORRIDOR' && !chained.has(r.id))
        .map((r) => (
          <rect key={`w${r.id}`} x={r.x} y={r.y} width={r.width} height={r.height} fill="none" className={WALL} strokeWidth={3} />
        ))}
      {chains.map((c) => (
        <StairChain key={`st${c[0]!.id}`} chain={c} />
      ))}
      {/* Двери в коридор (у лестниц и лифта дверей нет) */}
      {[...doors].map(([id, info]) => {
        const r = rooms.find((x) => x.id === id)!;
        return info ? <Door key={`d${id}`} room={r} info={info} /> : null;
      })}
      {/* Наружные стены и окна */}
      <rect x={bounds.x1} y={bounds.y1} width={bounds.x2 - bounds.x1} height={bounds.y2 - bounds.y1} fill="none" className={OUTER} strokeWidth={7} rx={2} />
      {/* Входная дверь здания */}
      {rooms.filter(isEntrance).map((r) => {
        const info = outerSide(r, bounds);
        return info ? <Door key={`in${r.id}`} room={r} info={info} gap={10} /> : null;
      })}
      {ordered
        .filter((r) => r.type !== 'STAIRS' && r.type !== 'ELEVATOR' && r.type !== 'CORRIDOR')
        .map((r) => (
          <Windows key={`win${r.id}`} room={r} bounds={bounds} />
        ))}
    </svg>
  );
});
