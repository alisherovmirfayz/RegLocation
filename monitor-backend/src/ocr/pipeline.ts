import sharp from 'sharp';
import { detectGrid, type Grid, type GridCell, type RawImage } from './grid';
import { renderPdf, type PdfTextItem } from './pdf';
import { FORMAT_LABEL, imagePages, InputFileError, PHOTO_MIME, sniffMime } from './formats';
const DAY_SHORT = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
import { extractClass, looksLikeRoom, matchDay, matchLessonNumber, normalizeRoom, type Normalized, type RoomRef } from './normalize';

export type ReadMode = 'any' | 'class' | 'classLine' | 'room' | 'word';

export interface CellReader {
  read(png: Buffer, mode: ReadMode): Promise<{ text: string; confidence: number }>;
}

export interface Box {
  page: number;
  /** Доли от размера страницы 0..1 */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DraftEntry {
  dayOfWeek: number;
  lessonNumber: number;
  className: string;
  classRaw: string;
  classConfidence: number;
  roomLabel: string;
  roomRaw: string;
  roomId: string | null;
  roomConfidence: number;
  needsReview: boolean;
  notes: string[];
  classBox?: Box;
  roomBox?: Box;
}

export interface PagePreview {
  page: number;
  dataUrl: string;
  width: number;
  height: number;
}

export interface RecognitionResult {
  entries: DraftEntry[];
  warnings: string[];
  totalPages: number;
  processedPages: number;
  method: 'text-layer' | 'ocr' | 'mixed' | 'none';
  cellsRead: number;
  reread: number;
  previews: PagePreview[];
}

export const REVIEW_THRESHOLD = 0.8;

export { sniffMime };

interface PreparedPage {
  raw: RawImage;
  textItems?: PdfTextItem[];
}

/** Оценка наклона по дисперсии горизонтальной проекции (для фотографий). */
async function estimateSkew(buf: Buffer): Promise<number> {
  const small = await sharp(buf).resize({ width: 1000 }).grayscale().raw().toBuffer({ resolveWithObject: true });
  const score = async (a: number) => {
    const rotated =
      a === 0
        ? small
        : await sharp(small.data, { raw: { width: small.info.width, height: small.info.height, channels: 1 } })
            .rotate(a, { background: { r: 255, g: 255, b: 255 } })
            .raw()
            .toBuffer({ resolveWithObject: true });
    const { width, height } = rotated.info;
    let s = 0;
    for (let y = 0; y < height; y++) {
      let row = 0;
      for (let x = 0; x < width; x++) if (rotated.data[y * width + x]! < 120) row++;
      s += row * row;
    }
    return s;
  };
  // Грубый поиск с шагом 0,5°, затем уточнение с шагом 0,1°
  let best = { a: 0, s: await score(0) };
  for (let a = -5; a <= 5; a += 0.5) {
    if (a === 0) continue;
    const s = await score(a);
    if (s > best.s) best = { a, s };
  }
  const coarse = best.a;
  for (let a = coarse - 0.4; a <= coarse + 0.41; a += 0.1) {
    const r = Math.round(a * 10) / 10;
    if (r === coarse) continue;
    const s = await score(r);
    if (s > best.s) best = { a: r, s };
  }
  return Math.abs(best.a) < 0.15 ? 0 : best.a;
}

/** Шаг 4: масштаб, выравнивание, контраст, шумоподавление. */
export async function prepareRaster(buf: Buffer, mime: string): Promise<RawImage> {
  const oriented = await sharp(buf, { limitInputPixels: 60_000_000 }).rotate().flatten({ background: '#ffffff' }).png().toBuffer();
  const meta = await sharp(oriented).metadata();
  const w = meta.width ?? 1000;
  const target = w < 1600 ? 2000 : w > 3200 ? 3000 : w;
  let pipeline = sharp(oriented).resize({ width: target, kernel: 'lanczos3' });
  if (mime === 'image/jpeg') pipeline = pipeline.median(3);
  let prepared = await pipeline.normalise().png().toBuffer();
  if (mime === 'image/jpeg') {
    const angle = await estimateSkew(prepared);
    if (angle !== 0) prepared = await sharp(prepared).rotate(angle, { background: '#ffffff' }).png().toBuffer();
  }
  const out = await sharp(prepared).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(out.data.buffer, out.data.byteOffset, out.data.length), width: out.info.width, height: out.info.height };
}

async function rawToPngCrop(raw: RawImage, cell: GridCell, scaleUp: boolean): Promise<Buffer> {
  const extract = sharp(Buffer.from(raw.data.buffer, raw.data.byteOffset, raw.data.length), {
    raw: { width: raw.width, height: raw.height, channels: 3 },
  })
    .extract({ left: cell.x, top: cell.y, width: cell.width, height: cell.height })
    .grayscale()
    .normalise();
  const targetH = scaleUp ? 96 : 64;
  const factor = cell.height < targetH ? targetH / cell.height : 1;
  // Бинаризация: чёрный текст на белом фоне независимо от цвета ячейки и текста
  // (серый заголовок, оранжевые номера кабинетов на персиковом фоне).
  const normalized = await extract
    .resize({ width: Math.round(cell.width * factor), height: Math.round(cell.height * factor), kernel: 'lanczos3' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const px = normalized.data;
  const hist = new Array(256).fill(0) as number[];
  for (const v of px) hist[v]!++;
  // Порог между фоном (самые частые светлые значения) и текстом
  let bgLevel = 255;
  for (let v = 255, acc = 0; v >= 0; v--) {
    acc += hist[v]!;
    if (acc > px.length * 0.5) {
      bgLevel = v;
      break;
    }
  }
  const t = Math.max(60, Math.min(200, bgLevel - 55));
  return sharp(px, { raw: { width: normalized.info.width, height: normalized.info.height, channels: 1 } })
    .threshold(t)
    .extend({ top: 16, bottom: 16, left: 16, right: 16, background: '#ffffff' })
    .png()
    .toBuffer();
}

/**
 * Вырезает первую строку текста ячейки (класс «9A»), без второй строки с предметом и без рамок,
 * и масштабирует её до заданной высоты букв. Так Tesseract видит крупную одиночную строку.
 */
export async function classLineCrop(raw: RawImage, cell: GridCell, targetH: number, thresholdShift = 0): Promise<Buffer | null> {
  const m = Math.max(2, Math.round(Math.min(cell.width, cell.height) * 0.07));
  const w = cell.width - m * 2;
  const h = cell.height - m * 2;
  if (w < 8 || h < 8) return null;
  const g = await sharp(Buffer.from(raw.data.buffer, raw.data.byteOffset, raw.data.length), { raw: { width: raw.width, height: raw.height, channels: 3 } })
    .extract({ left: cell.x + m, top: cell.y + m, width: w, height: h })
    .grayscale()
    .extractChannel(0)
    .raw()
    .toBuffer();
  const sorted = [...g].sort((a, b) => a - b);
  const bg = sorted[Math.floor(sorted.length * 0.6)]!;
  const ink = (v: number) => v < bg - 60;
  const rowInk = (y: number) => {
    let n = 0;
    for (let x = 0; x < w; x++) if (ink(g[y * w + x]!)) n++;
    return n;
  };
  const minRun = Math.max(2, Math.round(h * 0.03));
  let top = -1;
  let bottom = -1;
  for (let y = 0, gap = 0; y < h; y++) {
    if (rowInk(y) >= 2) {
      if (top < 0) top = y;
      bottom = y;
      gap = 0;
    } else if (top >= 0 && ++gap >= minRun) break;
  }
  if (top < 0 || bottom - top < 3) return null;
  let left = w;
  let right = -1;
  for (let y = top; y <= bottom; y++) {
    for (let x = 0; x < w; x++) {
      if (!ink(g[y * w + x]!)) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  }
  if (right - left < 3) return null;
  const pad = 3;
  const cx = Math.max(0, left - pad);
  const cy = Math.max(0, top - pad);
  const cw = Math.min(w - cx, right - left + 1 + pad * 2);
  const ch = Math.min(h - cy, bottom - top + 1 + pad * 2);
  const factor = targetH / ch;
  const scaled = await sharp(g, { raw: { width: w, height: h, channels: 1 } })
    .extract({ left: cx, top: cy, width: cw, height: ch })
    .resize({ width: Math.max(8, Math.round(cw * factor)), height: targetH, kernel: 'lanczos3' })
    .blur(factor > 2 ? 0.6 : 0.3)
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return sharp(scaled.data, { raw: { width: scaled.info.width, height: scaled.info.height, channels: 1 } })
    .threshold(Math.max(40, Math.min(220, bg - 70 + thresholdShift)))
    .extend({ top: 24, bottom: 24, left: 24, right: 24, background: '#ffffff' })
    .png()
    .toBuffer();
}

async function previewOf(raw: RawImage, page: number): Promise<PagePreview> {
  const width = Math.min(1400, raw.width);
  const buf = await sharp(Buffer.from(raw.data.buffer, raw.data.byteOffset, raw.data.length), {
    raw: { width: raw.width, height: raw.height, channels: 3 },
  })
    .resize({ width })
    .jpeg({ quality: 70 })
    .toBuffer({ resolveWithObject: true });
  return { page, dataUrl: `data:image/jpeg;base64,${buf.data.toString('base64')}`, width: buf.info.width, height: buf.info.height };
}

interface CellText {
  text: string;
  confidence: number;
  source: 'text-layer' | 'ocr' | 'empty';
}

function textFromLayer(items: PdfTextItem[], cell: GridCell): string | null {
  const inside = items.filter((it) => {
    const cx = it.x + it.width / 2;
    const cy = it.y + it.height / 2;
    return cx >= cell.x - 2 && cx <= cell.x + cell.width + 2 && cy >= cell.y - 2 && cy <= cell.y + cell.height + 2;
  });
  if (!inside.length) return null;
  return inside
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .reduce<{ y: number; h: number; parts: string[] }[]>((lines, it) => {
      const last = lines[lines.length - 1];
      if (last && Math.abs(it.y - last.y) < Math.max(it.height, last.h) * 0.6) last.parts.push(it.text);
      else lines.push({ y: it.y, h: it.height, parts: [it.text] });
      return lines;
    }, [])
    .map((l) => l.parts.join(' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

const firstLine = (s: string | undefined) => (s ?? '').split('\n')[0]!.trim();

function cellAt(grid: Grid, row: number, col: number): GridCell | undefined {
  return grid.cells[row]?.find((c) => col >= c.col && col < c.col + c.colSpan);
}

/** Анализ одной страницы: шаги 5–11. */
async function analyzePage(
  page: PreparedPage,
  pageNo: number,
  reader: CellReader,
  rooms: RoomRef[],
  stats: { cellsRead: number; reread: number; textLayer: number; ocr: number },
  warnings: string[],
): Promise<DraftEntry[]> {
  const grid = detectGrid(page.raw);
  if (!grid || grid.cells.length < 2) {
    warnings.push(`Страница ${pageNo}: таблица не найдена. Проверьте, что расписание чёткое и полностью попадает в кадр.`);
    return [];
  }
  const { width: W, height: H } = page.raw;
  const box = (c: GridCell): Box => ({ page: pageNo, x: c.x / W, y: c.y / H, w: c.width / W, h: c.height / H });

  // Шаг 9: текст каждой ячейки (сначала текстовый слой PDF, затем OCR)
  const texts = new Map<GridCell, CellText>();
  const readCell = async (cell: GridCell): Promise<CellText> => {
    const cached = texts.get(cell);
    if (cached) return cached;
    let result: CellText = { text: '', confidence: 0, source: 'empty' };
    const layer = page.textItems ? textFromLayer(page.textItems, cell) : null;
    if (layer) {
      result = { text: layer, confidence: 0.99, source: 'text-layer' };
      stats.textLayer++;
    } else if (cell.hasInk) {
      const png = await rawToPngCrop(page.raw, cell, false);
      const r = await reader.read(png, 'any');
      result = { text: r.text.trim(), confidence: r.confidence, source: 'ocr' };
      stats.ocr++;
    }
    stats.cellsRead++;
    texts.set(cell, result);
    return result;
  };

  // Шаг 7: заголовки дней недели (ищем в первых строках)
  const dayOf = async (cell: GridCell): Promise<number | null> => {
    const t = await readCell(cell);
    let d = matchDay(t.text);
    if (!d && cell.hasInk && t.source !== 'text-layer') {
      // Повторное чтение заголовка только буквами
      stats.reread++;
      const again = await reader.read(await rawToPngCrop(page.raw, cell, true), 'word');
      d = matchDay(again.text);
    }
    return d;
  };
  let headerRow = -1;
  const dayColumns = new Map<number, number[]>();
  for (let r = 0; r < Math.min(4, grid.cells.length) && headerRow < 0; r++) {
    const rowCells = grid.cells[r]!;
    const found: { day: number; cell: GridCell }[] = [];
    for (const cell of rowCells) {
      const d = await dayOf(cell);
      if (d) found.push({ day: d, cell });
    }
    if (!(found.length >= 2 || (found.length === 1 && rowCells.length <= 4))) continue;
    headerRow = r;
    // Если часть заголовков не прочиталась, восстанавливаем дни по порядку объединённых ячеек
    const groups = rowCells.filter((x) => x.colSpan >= 2);
    if (groups.length >= 2 && found.every((f) => f.cell.colSpan >= 2) && found.length < groups.length) {
      const offsets = new Set(found.map((f) => f.day - groups.indexOf(f.cell)));
      if (offsets.size === 1) {
        const offset = [...offsets][0]!;
        const inferred = groups
          .map((cell, i) => ({ day: i + offset, cell }))
          .filter((x) => x.day >= 1 && x.day <= 6 && !found.some((f) => f.cell === x.cell));
        if (inferred.length) {
          warnings.push(`Страница ${pageNo}: часть заголовков дней определена по порядку столбцов (${inferred.map((x) => DAY_SHORT[x.day]).join(', ')}). Проверьте результат.`);
          found.push(...inferred);
        }
      }
    }
    for (const { day, cell } of found) {
      const cols: number[] = [];
      for (let c = cell.col; c < cell.col + cell.colSpan; c++) cols.push(c);
      // Если заголовок не объединён, присоединяем соседний столбец без дня (например, «каб.»/«xona»)
      if (cell.colSpan === 1) {
        const next = rowCells.find((x) => x.col === cell.col + 1);
        if (next && !found.some((f) => f.cell === next)) cols.push(next.col);
      }
      dayColumns.set(day, [...(dayColumns.get(day) ?? []), ...cols]);
    }
  }

  const dataRows = grid.cells.map((_, i) => i).filter((i) => i > headerRow);

  // Номер урока: столбец, где в большинстве строк стоят числа 1..15 (время «09:00-09:45» не считается)
  const lessonCache = new Map<GridCell, number | null>();
  const lessonOf = async (cell: GridCell): Promise<number | null> => {
    if (lessonCache.has(cell)) return lessonCache.get(cell)!;
    const t = await readCell(cell);
    let n = matchLessonNumber(t.text.split(/\s+/)[0] ?? '');
    if (n === null && cell.hasInk && t.source !== 'text-layer' && !/\d\s*[:.]\s*\d\d/.test(t.text)) {
      // Одиночные цифры («1», «7») OCR часто читает как «|» или «/» — перечитываем только цифрами
      stats.reread++;
      const again = await reader.read(await rawToPngCrop(page.raw, cell, true), 'room');
      n = matchLessonNumber(again.text);
    }
    lessonCache.set(cell, n);
    return n;
  };
  let lessonCol = -1;
  let bestHits = 0;
  const maxCols = grid.cols.length - 1;
  for (let c = 0; c < Math.min(2, maxCols); c++) {
    if ([...dayColumns.values()].some((cols) => cols.includes(c))) continue;
    let hits = 0;
    for (const r of dataRows) {
      const cell = cellAt(grid, r, c);
      if (cell && (await lessonOf(cell)) !== null) hits++;
    }
    if (hits > bestHits) {
      bestHits = hits;
      lessonCol = c;
    }
  }  const lessonByRow = new Map<number, number>();
  if (lessonCol >= 0 && bestHits >= Math.max(1, Math.floor(dataRows.length / 2))) {
    for (const r of dataRows) {
      const cell = cellAt(grid, r, lessonCol);
      if (!cell) continue;
      const n = await lessonOf(cell);
      if (n !== null) lessonByRow.set(r, n);
    }
    // Восстанавливаем пропуски по соседям: строки идут по порядку (…, 6, ?, 8 → 7)
    for (let i = 0; i < dataRows.length; i++) {
      const r = dataRows[i]!;
      if (lessonByRow.has(r)) continue;
      const prev = i > 0 ? lessonByRow.get(dataRows[i - 1]!) : undefined;
      const next = i + 1 < dataRows.length ? lessonByRow.get(dataRows[i + 1]!) : undefined;
      if (prev !== undefined && (next === undefined || next === prev + 2)) lessonByRow.set(r, prev + 1);
      else if (next !== undefined && next > 1) lessonByRow.set(r, next - 1);
    }
  } else {
    lessonCol = -1;
    dataRows.forEach((r, i) => lessonByRow.set(r, i + 1));
    warnings.push(`Страница ${pageNo}: номера уроков не найдены — уроки пронумерованы по порядку строк. Проверьте результат.`);
  }

  if (dayColumns.size === 0) {
    const first = lessonCol >= 0 ? lessonCol + 1 : 0;
    const dataCols = maxCols - first;
    if (dataCols >= 2 && dataCols % 2 === 0 && dataCols / 2 <= 6) {
      for (let d = 1; d <= dataCols / 2; d++) dayColumns.set(d, [first + (d - 1) * 2, first + (d - 1) * 2 + 1]);
      warnings.push(`Страница ${pageNo}: заголовки дней недели не распознаны — дни определены по порядку столбцов (пн, вт, …). Проверьте результат.`);
    } else {
      warnings.push(`Страница ${pageNo}: не удалось определить столбцы дней недели.`);
      return [];
    }
  }

  const entries: DraftEntry[] = [];
  const classOk = new Map<DraftEntry, boolean>();
  for (const [day, colsRaw] of [...dayColumns.entries()].sort((a, b) => a[0] - b[0])) {
    const cols = [...new Set(colsRaw)].filter((c) => c !== lessonCol).sort((a, b) => a - b);
    // Шаг 8: какая колонка — класс (белая), какая — кабинет (оранжевая)
    const pairs: [number, number | null][] = [];
    if (cols.length >= 2) {
      for (let i = 0; i + 1 < cols.length; i += 2) {
        const a = cols[i]!;
        const b = cols[i + 1]!;
        let orangeA = 0, orangeB = 0, roomLikeA = 0, roomLikeB = 0;
        for (const r of dataRows) {
          const ca = cellAt(grid, r, a);
          const cb = cellAt(grid, r, b);
          if (ca?.color === 'orange') orangeA++;
          if (cb?.color === 'orange') orangeB++;
          if (ca?.hasInk && looksLikeRoom(firstLine((await readCell(ca)).text))) roomLikeA++;
          if (cb?.hasInk && looksLikeRoom(firstLine((await readCell(cb)).text))) roomLikeB++;
        }
        const roomIsA = orangeA !== orangeB ? orangeA > orangeB : roomLikeA > roomLikeB;
        pairs.push(roomIsA ? [b, a] : [a, b]);
      }
    } else if (cols.length === 1) {
      pairs.push([cols[0]!, null]);
    }

    for (const r of dataRows) {
      const lesson = lessonByRow.get(r);
      if (lesson === undefined) continue;
      for (const [classCol, roomCol] of pairs) {
        const classCell = cellAt(grid, r, classCol);
        const roomCell = roomCol !== null ? cellAt(grid, r, roomCol) : undefined;
        let classText = classCell ? await readCell(classCell) : null;
        let roomText = roomCell ? await readCell(roomCell) : null;

        // Одна ячейка «10A 404» / «10A/404»
        if (roomCol === null && classText?.text) {
          const m = /^(\S+)\s*[/|\\,;]?\s+(\S+)$/.exec(classText.text);
          if (m) {
            roomText = { text: m[2]!, confidence: classText.confidence, source: classText.source };
            classText = { ...classText, text: m[1]! };
          }
        }
        if (!classText?.text && !roomText?.text) continue;

        const notes: string[] = [];
        let cls: Normalized = extractClass(classText?.text ?? '', classText?.confidence ?? 0);
        // Шаг 10: повторное чтение сомнительных ячеек с ограниченным алфавитом и большим масштабом
        if (classCell && classText?.source === 'ocr' && (!cls.valid || cls.confidence < REVIEW_THRESHOLD)) {
          stats.reread++;
          const again = await reader.read(await rawToPngCrop(page.raw, classCell, true), 'class');
          const cls2 = extractClass(again.text, again.confidence);
          // Два независимых прочтения без исправлений совпали — значению можно доверять
          const agree = cls.valid && cls2.valid && cls2.value === cls.value && !cls.note && !cls2.note;
          if (agree) cls = { ...cls, confidence: Math.max(cls.confidence, cls2.confidence, 0.85) };
          else if (cls2.valid && (!cls.valid || cls2.confidence > cls.confidence)) cls = cls2;
          else if (cls.valid && cls2.valid && cls2.value === cls.value) cls = { ...cls, confidence: Math.max(cls.confidence, Math.min(0.9, cls2.confidence)) };
        }
        // «Второе мнение»: только строка класса, увеличенная в нескольких масштабах.
        // Совпадение с основным прочтением снимает сомнение; расхождение оставляет пометку.
        if (classCell && classText?.source === 'ocr' && (!cls.valid || cls.confidence < REVIEW_THRESHOLD)) {
          const votes = new Map<string, number>();
          for (const h of [48, 64, 80, 96]) {
            const png = await classLineCrop(page.raw, classCell, h);
            if (!png) continue;
            stats.reread++;
            const x = await reader.read(png, 'classLine');
            const c = extractClass(x.text, x.confidence);
            // Засчитываем только прочтения без исправлений («SA» → «5A» — это уже догадка)
            if (c.valid && !c.corrected) votes.set(c.value, (votes.get(c.value) ?? 0) + 1);
          }
          const agree = cls.valid ? votes.get(cls.value) ?? 0 : 0;
          const rival = Math.max(0, ...[...votes].filter(([v]) => v !== cls.value).map(([, n]) => n));
          if (cls.valid && agree >= 2 && rival < agree) {
            cls = { ...cls, confidence: Math.max(cls.confidence, 0.9), note: undefined };
          } else if (!cls.valid) {
            const [best, n] = [...votes].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
            if (n >= 3) cls = { value: best, valid: true, corrected: true, confidence: 0.7, note: `Класс «${best}» прочитан по увеличенной строке — сверьте с оригиналом` };
          }
        }
        // Шаг 11: сверка кабинета с базой помещений
        let room = normalizeRoom(firstLine(roomText?.text), rooms, roomText?.confidence ?? 0);
        let roomRaw = roomText?.text ?? '';
        if (roomCell && roomText?.source === 'ocr' && (!room.valid || room.confidence < REVIEW_THRESHOLD)) {
          stats.reread++;
          const again = await reader.read(await rawToPngCrop(page.raw, roomCell, true), 'room');
          const room2 = normalizeRoom(firstLine(again.text), rooms, again.confidence);
          if (room2.valid && (!room.valid || room2.confidence > room.confidence)) {
            room = room2;
            roomRaw = again.text.trim();
          } else if (room.valid && room2.valid && room2.value === room.value) room = { ...room, confidence: Math.max(room.confidence, Math.min(0.9, room2.confidence)) };
          if (!roomRaw && again.text.trim()) roomRaw = again.text.trim();
        }
        if (cls.note) notes.push(cls.note);
        else if (cls.valid && cls.confidence < REVIEW_THRESHOLD) notes.push(`Класс «${cls.value}» прочитан неуверенно — сверьте с оригиналом`);
        if (room.note) notes.push(room.valid ? room.note : `${room.note} — укажите вручную`);
        if (!classText?.text) notes.push('Класс не найден — укажите вручную');

        entries.push({
          dayOfWeek: day,
          lessonNumber: lesson,
          className: cls.valid ? cls.value : firstLine(classText?.text),
          classRaw: classText?.text ?? '',
          classConfidence: Number(cls.confidence.toFixed(2)),
          roomLabel: room.valid ? room.value : firstLine(roomText?.text),
          roomRaw,
          roomId: room.roomId,
          roomConfidence: Number(room.confidence.toFixed(2)),
          needsReview: !cls.valid || !room.valid || cls.confidence < REVIEW_THRESHOLD || room.confidence < REVIEW_THRESHOLD,
          notes,
          classBox: classCell ? box(classCell) : undefined,
          roomBox: roomCell ? box(roomCell) : undefined,
        });
        classOk.set(entries[entries.length - 1]!, cls.valid && cls.confidence >= REVIEW_THRESHOLD);
      }
    }
  }

  // У учителя обычно один основной кабинет: непрочитанные номера подсказываем по большинству уроков
  const sure = entries.filter((e) => e.roomId && e.roomConfidence >= REVIEW_THRESHOLD);
  const counts = new Map<string, number>();
  for (const e of sure) counts.set(e.roomLabel, (counts.get(e.roomLabel) ?? 0) + 1);
  const [top, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  const topRoom = rooms.find((r) => r.code === top);
  if (topRoom && topCount >= 3 && topCount >= sure.length * 0.6) {
    for (const e of entries) {
      if (e.roomId && e.roomConfidence >= REVIEW_THRESHOLD) continue;
      if (e.roomId === topRoom.id) {
        // Совпадает с основным кабинетом — сомнение снимается
        e.roomConfidence = Math.max(e.roomConfidence, 0.85);
        e.notes = e.notes.filter((n) => !/абинет|Исправлено OCR: «[^»]*» → «\d+»$/.test(n));
      } else {
        e.notes = e.notes.filter((n) => !/абинет/.test(n));
        e.notes.push(`Кабинет прочитан неуверенно${e.roomRaw ? ` («${firstLine(e.roomRaw)}»)` : ''} — подставлен ${topRoom.code}, как в большинстве уроков. Проверьте`);
        e.roomLabel = topRoom.code;
        e.roomId = topRoom.id;
        e.roomConfidence = 0.6;
      }
      e.needsReview = !classOk.get(e) || e.roomConfidence < REVIEW_THRESHOLD;
    }
  }
  return entries;
}

/** Полный конвейер распознавания расписания (шаги 1–12). */
export async function recognizeTimetable(
  file: Buffer,
  opts: { reader: CellReader; rooms: RoomRef[]; maxPages: number; withPreviews?: boolean },
): Promise<RecognitionResult> {
  const mime = sniffMime(file);
  if (!mime) throw new InputFileError('Неподдерживаемый формат файла. Загрузите PDF или изображение (PNG, JPG, HEIC, WEBP, TIFF, BMP, GIF).');
  const warnings: string[] = [];
  const stats = { cellsRead: 0, reread: 0, textLayer: 0, ocr: 0 };
  const pages: PreparedPage[] = [];
  let totalPages = 1;

  // Повреждённый или нестандартный файл — понятное сообщение пользователю, а не «ошибка сервера»
  try {
    if (mime === 'application/pdf') {
      const pdf = await renderPdf(file, { maxPages: opts.maxPages, targetWidth: 2400 });
      totalPages = pdf.totalPages;
      if (pdf.totalPages > opts.maxPages) warnings.push(`Обработаны первые ${opts.maxPages} из ${pdf.totalPages} страниц.`);
      for (const p of pdf.pages) {
        const raw = await sharp(p.png).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
        pages.push({
          raw: { data: new Uint8Array(raw.data.buffer, raw.data.byteOffset, raw.data.length), width: raw.info.width, height: raw.info.height },
          textItems: p.textItems.length ? p.textItems : undefined,
        });
      }
    } else if (mime === 'image/png' || mime === 'image/jpeg') {
      pages.push({ raw: await prepareRaster(file, mime) });
    } else {
      // HEIC, WEBP, TIFF (в т.ч. многостраничный), BMP, GIF, AVIF → PNG; фото с камеры обрабатываем как JPEG
      const img = await imagePages(file, mime, opts.maxPages);
      totalPages = img.totalPages;
      if (img.totalPages > opts.maxPages) warnings.push(`Обработаны первые ${opts.maxPages} из ${img.totalPages} страниц.`);
      for (const png of img.pages) pages.push({ raw: await prepareRaster(png, PHOTO_MIME.has(mime) ? 'image/jpeg' : 'image/png') });
    }
  } catch (e) {
    if (e instanceof InputFileError) throw e;
    const hint = /BMP со сжатием/.test(String((e as Error)?.message)) ? (e as Error).message : 'файл повреждён или сохранён в необычном варианте формата';
    throw new InputFileError(`Не удалось открыть файл ${FORMAT_LABEL[mime]}: ${hint}. Сохраните расписание как PDF, PNG или JPG и загрузите снова.`);
  }

  const byKey = new Map<string, DraftEntry>();
  const previews: PagePreview[] = [];
  for (const [i, page] of pages.entries()) {
    const entries = await analyzePage(page, i + 1, opts.reader, opts.rooms, stats, warnings);
    for (const e of entries) {
      const key = `${e.dayOfWeek}:${e.lessonNumber}`;
      const prev = byKey.get(key);
      if (prev) {
        warnings.push(`Урок ${e.lessonNumber} (${e.dayOfWeek}-й день) встречается несколько раз — оставлено более уверенное значение.`);
        if (e.classConfidence + e.roomConfidence <= prev.classConfidence + prev.roomConfidence) continue;
      }
      byKey.set(key, e);
    }
    if (opts.withPreviews !== false) previews.push(await previewOf(page.raw, i + 1));
  }

  const entries = [...byKey.values()].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.lessonNumber - b.lessonNumber);
  if (entries.length === 0 && warnings.length === 0) warnings.push('Занятия не найдены. Заполните расписание вручную.');
  const method = stats.textLayer && stats.ocr ? 'mixed' : stats.textLayer ? 'text-layer' : stats.ocr ? 'ocr' : 'none';
  return {
    entries,
    warnings,
    totalPages,
    processedPages: pages.length,
    method,
    cellsRead: stats.cellsRead,
    reread: stats.reread,
    previews,
  };
}
