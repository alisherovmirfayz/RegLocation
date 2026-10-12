/**
 * Поиск таблицы на изображении: горизонтальные и вертикальные линии, ячейки, объединённые ячейки,
 * цвет фона ячейки (белая / оранжевая) и наличие текста.
 * Работает на «сырых» пикселях (RGB), без внешних библиотек компьютерного зрения.
 */

export interface RawImage {
  /** RGB, 3 байта на пиксель */
  data: Uint8Array;
  width: number;
  height: number;
}

export interface Line {
  pos: number;
  thickness: number;
  start: number;
  end: number;
}

export type CellColor = 'white' | 'orange' | 'colored' | 'dark';

export interface GridCell {
  row: number;
  col: number;
  /** Количество объединённых столбцов */
  colSpan: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color: CellColor;
  rgb: [number, number, number];
  hasInk: boolean;
}

export interface Grid {
  rows: Line[];
  cols: Line[];
  /** cells[row] — ячейки строки слева направо (с учётом объединений) */
  cells: GridCell[][];
  bounds: { x: number; y: number; width: number; height: number };
}

export function toGray(img: RawImage): Uint8Array {
  const g = new Uint8Array(img.width * img.height);
  for (let i = 0, p = 0; i < g.length; i++, p += 3) {
    g[i] = (img.data[p]! * 299 + img.data[p + 1]! * 587 + img.data[p + 2]! * 114) / 1000;
  }
  return g;
}

/** Порог Оцу по гистограмме яркости. */
export function otsu(gray: Uint8Array): number {
  const hist = new Array(256).fill(0) as number[];
  for (const v of gray) hist[v]!++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i]!;
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t]!;
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/** Группирует подряд идущие индексы в линии. */
function groupLines(flags: { idx: number; start: number; end: number }[], maxGap = 2): Line[] {
  const lines: Line[] = [];
  let cur: { first: number; last: number; start: number; end: number } | null = null;
  for (const f of flags) {
    if (cur && f.idx - cur.last <= maxGap) {
      cur.last = f.idx;
      cur.start = Math.min(cur.start, f.start);
      cur.end = Math.max(cur.end, f.end);
    } else {
      if (cur) lines.push({ pos: Math.round((cur.first + cur.last) / 2), thickness: cur.last - cur.first + 1, start: cur.start, end: cur.end });
      cur = { first: f.idx, last: f.idx, start: f.start, end: f.end };
    }
  }
  if (cur) lines.push({ pos: Math.round((cur.first + cur.last) / 2), thickness: cur.last - cur.first + 1, start: cur.start, end: cur.end });
  return lines;
}

function longestRun(get: (i: number) => boolean, from: number, to: number, gapTolerance = 3) {
  let best = 0;
  let bestStart = from;
  let bestEnd = from;
  let runStart = -1;
  let lastDark = -100;
  for (let i = from; i < to; i++) {
    if (get(i)) {
      if (runStart < 0 || i - lastDark > gapTolerance) runStart = i;
      lastDark = i;
      const len = i - runStart + 1;
      if (len > best) {
        best = len;
        bestStart = runStart;
        bestEnd = i;
      }
    }
  }
  return { length: best, start: bestStart, end: bestEnd };
}

/** Удаляет линии, слишком близкие друг к другу (двойные рамки). */
function dedupe(lines: Line[], minDist: number): Line[] {
  const out: Line[] = [];
  for (const l of lines) {
    const prev = out[out.length - 1];
    if (prev && l.pos - prev.pos < minDist) {
      if (l.end - l.start > prev.end - prev.start) out[out.length - 1] = l;
    } else out.push(l);
  }
  return out;
}

function classifyColor(r: number, g: number, b: number): CellColor {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const v = max / 255;
  const s = max === 0 ? 0 : (max - min) / max;
  if (v < 0.35) return 'dark';
  if (s < 0.15) return 'white';
  let h = 0;
  if (max === r) h = ((g - b) / (max - min)) % 6;
  else if (max === g) h = (b - r) / (max - min) + 2;
  else h = (r - g) / (max - min) + 4;
  h *= 60;
  if (h < 0) h += 360;
  // Оранжевые/персиковые/жёлто-оранжевые оттенки
  if (h >= 8 && h <= 52 && s >= 0.18) return 'orange';
  return 'colored';
}

export function detectGrid(img: RawImage, opts: { darkThreshold?: number; minLineFraction?: number } = {}): Grid | null {
  const { width: W, height: H } = img;
  const gray = toGray(img);
  const threshold = opts.darkThreshold ?? Math.min(otsu(gray), 140);
  const g = (x: number, y: number) => gray[y * W + x]!;
  const dark = (x: number, y: number) => g(x, y) < threshold;
  // «Гребень»: тонкая светло-серая линия на светлом фоне — пиксель заметно темнее соседей по обе стороны.
  // Так находятся бледные линии таблиц из PDF/скриншотов (серый ~200 на фоне 230–255).
  const RIDGE = 10;
  const ridgeH = (x: number, y: number) => {
    const v = g(x, y);
    for (const d of [3, 5]) {
      if (y - d < 0 || y + d >= H) continue;
      if (v + RIDGE <= g(x, y - d) && v + RIDGE <= g(x, y + d)) return true;
    }
    return false;
  };
  const ridgeV = (x: number, y: number) => {
    const v = g(x, y);
    for (const d of [3, 5]) {
      if (x - d < 0 || x + d >= W) continue;
      if (v + RIDGE <= g(x - d, y) && v + RIDGE <= g(x + d, y)) return true;
    }
    return false;
  };
  const lineH = (x: number, y: number) => dark(x, y) || ridgeH(x, y);
  const lineV = (x: number, y: number) => dark(x, y) || ridgeV(x, y);
  // Допуск ±1 пиксель — устойчивость к остаточному наклону и неровным линиям на фото
  const darkH = (x: number, y: number) => lineH(x, y) || (y > 0 && lineH(x, y - 1)) || (y < H - 1 && lineH(x, y + 1));
  const darkV = (x: number, y: number) => lineV(x, y) || (x > 0 && lineV(x - 1, y)) || (x < W - 1 && lineV(x + 1, y));
  const minFrac = opts.minLineFraction ?? 0.3;

  // Горизонтальные линии
  const hFlags: { idx: number; start: number; end: number }[] = [];
  for (let y = 0; y < H; y++) {
    const run = longestRun((x) => darkH(x, y), 0, W);
    if (run.length >= W * minFrac) hFlags.push({ idx: y, start: run.start, end: run.end });
  }
  let rows = dedupe(groupLines(hFlags), 8);
  if (rows.length < 2) return null;

  const left = Math.min(...rows.map((r) => r.start));
  const right = Math.max(...rows.map((r) => r.end));
  const top = rows[0]!.pos;
  const bottom = rows[rows.length - 1]!.pos;
  const tableH = bottom - top;
  if (tableH < 20) return null;

  // Вертикальные линии внутри найденной области
  const vFlags: { idx: number; start: number; end: number }[] = [];
  for (let x = Math.max(0, left - 2); x <= Math.min(W - 1, right + 2); x++) {
    const run = longestRun((y) => darkV(x, y), top, bottom + 1);
    if (run.length >= tableH * 0.5) vFlags.push({ idx: x, start: run.start, end: run.end });
  }
  const cols = dedupe(groupLines(vFlags), 8);
  if (cols.length < 2) return null;

  // Оставляем только горизонтальные линии, пересекающие большую часть таблицы
  const tableW = cols[cols.length - 1]!.pos - cols[0]!.pos;
  rows = rows.filter((r) => r.end - r.start >= tableW * 0.5);
  if (rows.length < 2) return null;

  const pad = (l: Line) => Math.ceil(l.thickness / 2) + 2;

  /** Есть ли разделитель (вертикальная линия) между столбцами в пределах строки */
  const hasSeparator = (col: Line, y0: number, y1: number) => {
    let cnt = 0;
    let total = 0;
    for (let y = y0; y <= y1; y++) {
      total++;
      let any = false;
      for (let dx = -Math.ceil(col.thickness / 2) - 1; dx <= Math.ceil(col.thickness / 2) + 1; dx++) {
        const x = col.pos + dx;
        if (x >= 0 && x < W && lineV(x, y)) {
          any = true;
          break;
        }
      }
      if (any) cnt++;
    }
    return total > 0 && cnt / total > 0.7;
  };

  const cells: GridCell[][] = [];
  for (let r = 0; r < rows.length - 1; r++) {
    const y0 = rows[r]!.pos + pad(rows[r]!);
    const y1 = rows[r + 1]!.pos - pad(rows[r + 1]!);
    if (y1 - y0 < 4) continue;
    const rowCells: GridCell[] = [];
    let c = 0;
    while (c < cols.length - 1) {
      let span = 1;
      while (c + span < cols.length - 1 && !hasSeparator(cols[c + span]!, y0, y1)) span++;
      const x0 = cols[c]!.pos + pad(cols[c]!);
      const x1 = cols[c + span]!.pos - pad(cols[c + span]!);
      if (x1 - x0 >= 4) {
        // Фон ячейки — 85-й перцентиль яркости; «чернила» — пиксели заметно темнее фона
        // (так находится и цветной текст, например оранжевые номера кабинетов).
        const step = Math.max(1, Math.floor(Math.min(x1 - x0, y1 - y0) / 40));
        const samples: number[] = [];
        for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x += step) samples.push(y * W + x);
        const sorted = samples.map((i) => gray[i]!).sort((a, b) => a - b);
        const bg = sorted[Math.floor(sorted.length * 0.85)] ?? 255;
        let rs = 0, gs = 0, bs = 0, n = 0, ink = 0, total = 0;
        // Чернила ищем только во внутренней части: у краёв могут оказаться куски линий сетки
        // (если граница столбца найдена со сдвигом в пару пикселей), и пустая ячейка выглядела бы заполненной.
        const inset = Math.max(2, Math.round(Math.min(x1 - x0, y1 - y0) * 0.06));
        for (const i of samples) {
          const v = gray[i]!;
          const sx = i % W;
          const sy = (i - sx) / W;
          const inner = sx >= x0 + inset && sx <= x1 - inset && sy >= y0 + inset && sy <= y1 - inset;
          if (inner) total++;
          if (v < Math.min(bg - 45, 235)) {
            if (inner) ink++;
          } else if (v >= bg - 12) {
            rs += img.data[i * 3]!;
            gs += img.data[i * 3 + 1]!;
            bs += img.data[i * 3 + 2]!;
            n++;
          }
        }
        const rgb: [number, number, number] = n ? [rs / n, gs / n, bs / n] : [0, 0, 0];
        rowCells.push({
          row: cells.length,
          col: c,
          colSpan: span,
          x: x0,
          y: y0,
          width: x1 - x0,
          height: y1 - y0,
          color: classifyColor(...rgb),
          rgb: rgb.map(Math.round) as [number, number, number],
          hasInk: total > 0 && ink / total > 0.004,
        });
      }
      c += span;
    }
    cells.push(rowCells);
  }

  return {
    rows,
    cols,
    cells,
    bounds: { x: cols[0]!.pos, y: top, width: tableW, height: tableH },
  };
}
