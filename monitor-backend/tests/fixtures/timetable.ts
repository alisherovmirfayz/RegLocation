import sharp from 'sharp';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

/**
 * Генератор образцов школьного расписания в формате школы:
 * в каждой группе столбцов дня — белая ячейка с классом и оранжевая ячейка с кабинетом.
 */
export interface SampleLesson {
  day: number;
  lesson: number;
  className: string;
  room: string;
}

export const SAMPLE_LESSONS: SampleLesson[] = [
  { day: 1, lesson: 1, className: '1B', room: '404' },
  { day: 1, lesson: 2, className: '10A', room: '404' },
  { day: 1, lesson: 4, className: '6B', room: '405' },
  { day: 2, lesson: 1, className: '0A', room: '301' },
  { day: 2, lesson: 3, className: '1C', room: '404' },
  { day: 3, lesson: 2, className: '9A', room: '502' },
  { day: 3, lesson: 6, className: '10A', room: '404' },
  { day: 4, lesson: 5, className: '6B', room: '203' },
  { day: 5, lesson: 7, className: '1B', room: '101' },
  { day: 5, lesson: 9, className: '9A', room: '601' },
  { day: 6, lesson: 1, className: '10A', room: '404' },
  { day: 6, lesson: 3, className: '1C', room: '305' },
];

const DAYS_RU = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const DAYS_UZ = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];

const ORANGE = '#F4B183';

interface Layout {
  left: number;
  top: number;
  numW: number;
  cellW: number;
  headH: number;
  rowH: number;
  width: number;
  height: number;
}

function layout(): Layout {
  const left = 40, top = 40, numW = 70, cellW = 110, headH = 60, rowH = 56;
  return { left, top, numW, cellW, headH, rowH, width: left * 2 + numW + cellW * 12, height: top * 2 + headH + rowH * 9 };
}

export function timetableSvg(opts: { lessons?: SampleLesson[]; lang?: 'ru' | 'uz' } = {}): string {
  const lessons = opts.lessons ?? SAMPLE_LESSONS;
  const days = opts.lang === 'uz' ? DAYS_UZ : DAYS_RU;
  const L = layout();
  const font = `font-family="DejaVu Sans, Arial, Helvetica, sans-serif"`;
  const parts: string[] = [`<rect width="${L.width}" height="${L.height}" fill="#ffffff"/>`];
  const x0 = L.left;
  const y0 = L.top;
  const bodyTop = y0 + L.headH;
  const right = x0 + L.numW + L.cellW * 12;
  const bottom = bodyTop + L.rowH * 9;

  // Оранжевые ячейки кабинетов
  for (let d = 0; d < 6; d++) {
    const x = x0 + L.numW + L.cellW * (d * 2 + 1);
    parts.push(`<rect x="${x}" y="${bodyTop}" width="${L.cellW}" height="${L.rowH * 9}" fill="${ORANGE}"/>`);
  }
  // Заголовки дней (объединённые ячейки на 2 столбца)
  parts.push(`<text x="${x0 + L.numW / 2}" y="${y0 + L.headH / 2 + 8}" ${font} font-size="22" text-anchor="middle">№</text>`);
  for (let d = 0; d < 6; d++) {
    const cx = x0 + L.numW + L.cellW * (d * 2) + L.cellW;
    parts.push(`<text x="${cx}" y="${y0 + L.headH / 2 + 9}" ${font} font-size="24" font-weight="bold" text-anchor="middle">${days[d]}</text>`);
  }
  // Номера уроков
  for (let i = 0; i < 9; i++) {
    parts.push(`<text x="${x0 + L.numW / 2}" y="${bodyTop + L.rowH * i + L.rowH / 2 + 10}" ${font} font-size="28" text-anchor="middle">${i + 1}</text>`);
  }
  // Ячейки
  for (const l of lessons) {
    const cx = x0 + L.numW + L.cellW * ((l.day - 1) * 2) + L.cellW / 2;
    const cy = bodyTop + L.rowH * (l.lesson - 1) + L.rowH / 2 + 11;
    parts.push(`<text x="${cx}" y="${cy}" ${font} font-size="30" font-weight="bold" text-anchor="middle">${l.className}</text>`);
    parts.push(`<text x="${cx + L.cellW}" y="${cy}" ${font} font-size="30" font-weight="bold" text-anchor="middle">${l.room}</text>`);
  }
  // Линии сетки
  const stroke = `stroke="#111" stroke-width="3"`;
  parts.push(`<line x1="${x0}" y1="${y0}" x2="${right}" y2="${y0}" ${stroke}/>`);
  for (let i = 0; i <= 9; i++) {
    const y = bodyTop + L.rowH * i;
    parts.push(`<line x1="${x0}" y1="${y}" x2="${right}" y2="${y}" ${stroke}/>`);
  }
  parts.push(`<line x1="${x0}" y1="${y0}" x2="${x0}" y2="${bottom}" ${stroke}/>`);
  for (let c = 0; c <= 12; c++) {
    const x = x0 + L.numW + L.cellW * c;
    // Между классом и кабинетом одного дня линия не проходит через заголовок (объединённая ячейка)
    const startY = c % 2 === 1 ? bodyTop : y0;
    parts.push(`<line x1="${x}" y1="${startY}" x2="${x}" y2="${bottom}" ${stroke}/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${L.width}" height="${L.height}">${parts.join('')}</svg>`;
}

export async function timetablePng(opts?: Parameters<typeof timetableSvg>[0]): Promise<Buffer> {
  return sharp(Buffer.from(timetableSvg(opts))).png().toBuffer();
}

/** «Фото» расписания: небольшой наклон, шум JPEG-сжатия, неравномерная яркость. */
export async function timetableJpegPhoto(): Promise<Buffer> {
  const png = await timetablePng();
  return sharp(png)
    .rotate(1.2, { background: '#f2f2f2' })
    .modulate({ brightness: 0.95 })
    .jpeg({ quality: 72 })
    .toBuffer();
}

/** Многостраничный PDF с текстовым слоем: страница 1 — пн–ср, страница 2 — чт–сб (латиница, Helvetica). */
export async function timetablePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const daysLatin = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  for (const pageDays of [[1, 2, 3], [4, 5, 6]]) {
    const page = doc.addPage([842, 595]);
    const left = 40, top = 555, numW = 40, cellW = 120, headH = 36, rowH = 50;
    const cols = pageDays.length * 2;
    const right = left + numW + cellW * cols;
    const bodyTop = top - headH;
    const bottom = bodyTop - rowH * 9;
    for (let d = 0; d < pageDays.length; d++) {
      page.drawRectangle({ x: left + numW + cellW * (d * 2 + 1), y: bottom, width: cellW, height: rowH * 9, color: rgb(0.957, 0.694, 0.514) });
    }
    const line = (x1: number, y1: number, x2: number, y2: number) => page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 1.5, color: rgb(0, 0, 0) });
    line(left, top, right, top);
    for (let i = 0; i <= 9; i++) line(left, bodyTop - rowH * i, right, bodyTop - rowH * i);
    line(left, top, left, bottom);
    for (let c = 0; c <= cols; c++) line(left + numW + cellW * c, c % 2 === 1 ? bodyTop : top, left + numW + cellW * c, bottom);
    pageDays.forEach((day, d) => {
      const text = daysLatin[day - 1]!;
      const w = font.widthOfTextAtSize(text, 16);
      page.drawText(text, { x: left + numW + cellW * d * 2 + cellW - w / 2, y: top - 24, size: 16, font });
    });
    for (let i = 0; i < 9; i++) page.drawText(String(i + 1), { x: left + 14, y: bodyTop - rowH * i - 32, size: 18, font });
    for (const l of SAMPLE_LESSONS.filter((x) => pageDays.includes(x.day))) {
      const d = pageDays.indexOf(l.day);
      const y = bodyTop - rowH * (l.lesson - 1) - 32;
      const cx = left + numW + cellW * d * 2;
      page.drawText(l.className, { x: cx + 40, y, size: 20, font });
      page.drawText(l.room, { x: cx + cellW + 38, y, size: 20, font });
    }
  }
  return Buffer.from(await doc.save());
}
