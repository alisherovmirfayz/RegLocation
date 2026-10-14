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
function doorSide(room: Room, corridors: Room[]): { side: Side; from: number; to: number } | null {
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

function Door({ room, info }: { room: Room; info: { side: Side; from: number; to: number } }) {
  const len = Math.min(46, Math.max(22, (info.to - info.from) * 0.22));
  const along = info.to - len - Math.min(26, (info.to - info.from) * 0.12);
  const cls = 'stroke-brand-400/80 dark:stroke-brand-300/70';
  if (info.side === 'bottom' || info.side === 'top') {
    const y = info.side === 'bottom' ? room.y + room.height : room.y;
    const dir = info.side === 'bottom' ? -1 : 1;
    return (
      <g>
        <line x1={along} y1={y} x2={along + len} y2={y} className="stroke-slate-100 dark:stroke-[#141c2e]" strokeWidth={6} />
        <line x1={along} y1={y} x2={along} y2={y + dir * len} className={cls} strokeWidth={2} />
        <path d={`M ${along} ${y + dir * len} A ${len} ${len} 0 0 ${dir > 0 ? 0 : 1} ${along + len} ${y}`} className={cls} fill="none" strokeWidth={1.2} strokeDasharray="3 3" />
      </g>
    );
  }
  const x = info.side === 'right' ? room.x + room.width : room.x;
  const dir = info.side === 'right' ? -1 : 1;
  return (
    <g>
      <line x1={x} y1={along} x2={x} y2={along + len} className="stroke-slate-100 dark:stroke-[#141c2e]" strokeWidth={6} />
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
function Furniture({ room }: { room: Room }) {
  const { x, y, width: w, height: h } = room;
  const pad = 14;
  const top = y + 34; // место для подписи
  const ix = x + pad, iw = w - pad * 2, iy = top, ih = y + h - pad - top;
  // Лестница и лифт рисуются на всю площадь (подпись поверх), остальное — ниже подписи
  if ((iw < 30 || ih < 20) && room.type !== 'STAIRS' && room.type !== 'ELEVATOR') return null;
  const els: ReactNode[] = [];

  switch (room.type) {
    case 'CLASSROOM':
    case 'LAB': {
      // Доска у стены и стол учителя
      els.push(<rect key="board" x={x + w * 0.3} y={y + 5} width={w * 0.4} height={5} rx={2} className="fill-emerald-600/70 dark:fill-emerald-500/50" />);
      const deskW = Math.min(46, iw / 5);
      els.push(<rect key="tdesk" x={x + w - pad - deskW} y={iy} width={deskW} height={14} rx={3} className={FURN} strokeWidth={1} />);
      const cols = Math.max(2, Math.min(5, Math.floor(iw / 62)));
      const rows = Math.max(1, Math.min(4, Math.floor((ih - 24) / 30)));
      const cw = iw / cols;
      const rh = (ih - 24) / rows;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const dx = ix + c * cw + cw * 0.14;
          const dy = iy + 24 + r * rh + rh * 0.18;
          els.push(<rect key={`d${r}${c}`} x={dx} y={dy} width={cw * 0.72} height={Math.min(14, rh * 0.42)} rx={2.5} className={FURN} strokeWidth={1} />);
          els.push(<circle key={`c${r}${c}`} cx={dx + cw * 0.36} cy={dy + Math.min(14, rh * 0.42) + 5} r={3.2} className="fill-slate-300 dark:fill-slate-600/70" />);
        }
      if (room.type === 'LAB') {
        const cx = x + w - pad - 20, cy = y + h - pad - 20;
        els.push(<circle key="gear" cx={cx} cy={cy} r={12} fill="none" className="stroke-cyan-500/70" strokeWidth={4} strokeDasharray="4 3" />);
        els.push(<circle key="gear2" cx={cx} cy={cy} r={4} className="fill-cyan-500/70" />);
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
      // Ступени поперёк длинной стороны + стрелка подъёма
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
      const ax = x + w / 2, ay = y + h / 2;
      els.push(
        vertical ? (
          <path key="ar" d={`M ${ax} ${y + h - 12} L ${ax} ${y + 14} M ${ax - 6} ${y + 22} L ${ax} ${y + 14} L ${ax + 6} ${y + 22}`} fill="none" className="stroke-brand-400/80" strokeWidth={2} />
        ) : (
          <path key="ar" d={`M ${x + 12} ${ay} L ${x + w - 14} ${ay} M ${x + w - 22} ${ay - 6} L ${x + w - 14} ${ay} L ${x + w - 22} ${ay + 6}`} fill="none" className="stroke-brand-400/80" strokeWidth={2} />
        ),
      );
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
          <Furniture room={r} />
        </g>
      ))}
      {/* Стены */}
      {ordered
        .filter((r) => r.type !== 'CORRIDOR')
        .map((r) => (
          <rect key={`w${r.id}`} x={r.x} y={r.y} width={r.width} height={r.height} fill="none" className={WALL} strokeWidth={3} />
        ))}
      {/* Двери в коридор (у лестниц и лифта дверей нет) */}
      {ordered
        .filter((r) => r.type !== 'CORRIDOR' && r.type !== 'ELEVATOR' && r.type !== 'STAIRS')
        .map((r) => {
          const info = doorSide(r, corridors);
          return info ? <Door key={`d${r.id}`} room={r} info={info} /> : null;
        })}
      {/* Наружные стены и окна */}
      <rect x={bounds.x1} y={bounds.y1} width={bounds.x2 - bounds.x1} height={bounds.y2 - bounds.y1} fill="none" className={OUTER} strokeWidth={7} rx={2} />
      {ordered
        .filter((r) => r.type !== 'STAIRS' && r.type !== 'ELEVATOR' && r.type !== 'CORRIDOR')
        .map((r) => (
          <Windows key={`win${r.id}`} room={r} bounds={bounds} />
        ))}
    </svg>
  );
});
