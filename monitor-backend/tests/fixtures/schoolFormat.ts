import sharp from 'sharp';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

/**
 * Расписание в формате школы (по образцу «Mr. Nurulloh dars jadvali»):
 * заголовок, столбцы «#» и «Vaqt», дни Dushanba…Juma; в каждом дне — ячейка класса
 * (класс + предмет второй строкой) и персиковая ячейка кабинета с оранжевым номером.
 * Линии тонкие и светло-серые, строки чередуются по цвету.
 */
export interface Lesson {
  day: number;
  lesson: number;
  className: string;
  room: string;
}

/** Точное содержимое реального образца tests/fixtures/real/timetable-example.png */
export const REAL_SAMPLE: Lesson[] = [
  ...[[1, '1B'], [2, '3B'], [6, '10A'], [7, '1A'], [8, '6B'], [9, '8A']].map(([l, c]) => ({ day: 1, lesson: l as number, className: c as string, room: '404' })),
  ...[[1, '6B'], [2, '4B'], [3, '9A'], [5, '0A'], [6, '10A'], [7, '7B'], [8, '5B'], [9, '7A']].map(([l, c]) => ({ day: 2, lesson: l as number, className: c as string, room: '404' })),
  ...[[6, '2C'], [7, '3A'], [8, '10A'], [9, '1C']].map(([l, c]) => ({ day: 3, lesson: l as number, className: c as string, room: '404' })),
  ...[[1, '1E'], [2, '5A'], [5, '2B'], [6, '10A'], [7, '0B'], [8, '1D'], [9, '5A']].map(([l, c]) => ({ day: 4, lesson: l as number, className: c as string, room: '404' })),
  ...[[1, '8A'], [2, '9A'], [4, '7B'], [7, '2A'], [8, '5B'], [9, '7A']].map(([l, c]) => ({ day: 5, lesson: l as number, className: c as string, room: '404' })),
];

/** Вариант с разными кабинетами — чтобы проверить, что кабинет не «угадывается» как 404. */
export const MIXED_ROOMS: Lesson[] = REAL_SAMPLE.map((l, i) => ({ ...l, room: ['404', '405', '301', '502', '203', '101', '601'][i % 7]! }));

const DAYS = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma'];
const TIMES = ['09:00-09:45', '09:50-10:35', '10:50-11:35', '11:40-12:25', '12:30-13:15', '13:20-14:05', '14:10-14:55', '15:00-15:45', '16:05-16:50'];

export function schoolFormatSvg(lessons: Lesson[], scale = 2): string {
  const s = scale;
  const left = 18 * s, top = 56 * s, numW = 18 * s, timeW = 50 * s, cellW = 49 * s, roomW = 42 * s, headH = 28 * s, rowH = 77 * s;
  const groupW = cellW + roomW;
  const width = left * 2 + numW + timeW + groupW * 5;
  const height = top + headH + rowH * 9 + 20 * s;
  const font = `font-family="DejaVu Sans, Arial, Helvetica, sans-serif"`;
  const p: string[] = [`<rect width="${width}" height="${height}" fill="#fff"/>`];
  p.push(`<text x="${width / 2}" y="${32 * s}" ${font} font-size="${16 * s}" font-weight="bold" fill="#1e3a5f" text-anchor="middle">Mr. Nurulloh dars jadvali</text>`);
  const x0 = left + numW + timeW;
  const bodyTop = top + headH;
  p.push(`<rect x="${left}" y="${top}" width="${width - left * 2}" height="${headH}" fill="#e5e7eb"/>`);
  for (let r = 0; r < 9; r++) if (r % 2 === 1) p.push(`<rect x="${left}" y="${bodyTop + rowH * r}" width="${width - left * 2}" height="${rowH}" fill="#f4f7fb"/>`);
  const byKey = new Map(lessons.map((l) => [`${l.day}:${l.lesson}`, l]));
  for (let d = 0; d < 5; d++) {
    for (let r = 0; r < 9; r++) {
      const l = byKey.get(`${d + 1}:${r + 1}`);
      const gx = x0 + groupW * d;
      const y = bodyTop + rowH * r;
      if (!l) continue;
      p.push(`<rect x="${gx + cellW}" y="${y}" width="${roomW}" height="${rowH}" fill="#fde3c4"/>`);
      p.push(`<text x="${gx + cellW / 2}" y="${y + 24 * s}" ${font} font-size="${10 * s}" font-weight="bold" fill="#111" text-anchor="middle">${l.className}</text>`);
      p.push(`<text x="${gx + cellW / 2}" y="${y + 62 * s}" ${font} font-size="${6 * s}" font-style="italic" fill="#3b6fd8" text-anchor="middle">IT (Informatika)</text>`);
      p.push(`<text x="${gx + cellW + roomW / 2}" y="${y + rowH / 2 + 3 * s}" ${font} font-size="${8 * s}" font-weight="bold" fill="#b45309" text-anchor="middle">${l.room}</text>`);
    }
    p.push(`<text x="${x0 + groupW * d + groupW / 2}" y="${top + headH / 2 + 4 * s}" ${font} font-size="${9 * s}" font-weight="bold" fill="#111" text-anchor="middle">${DAYS[d]}</text>`);
  }
  p.push(`<text x="${left + numW / 2}" y="${top + headH / 2 + 4 * s}" ${font} font-size="${9 * s}" font-weight="bold" text-anchor="middle">#</text>`);
  p.push(`<text x="${left + numW + timeW / 2}" y="${top + headH / 2 + 4 * s}" ${font} font-size="${9 * s}" font-weight="bold" text-anchor="middle">Vaqt</text>`);
  for (let r = 0; r < 9; r++) {
    const cy = bodyTop + rowH * r + rowH / 2 + 4 * s;
    p.push(`<text x="${left + numW / 2}" y="${cy}" ${font} font-size="${10 * s}" font-weight="bold" text-anchor="middle">${r + 1}</text>`);
    p.push(`<text x="${left + numW + timeW / 2}" y="${cy}" ${font} font-size="${6.5 * s}" font-weight="bold" text-anchor="middle">${TIMES[r]}</text>`);
  }
  // Линии: внешняя рамка тёмная, внутренние — светло-серые и тонкие
  const thin = `stroke="#c9ced6" stroke-width="${s}"`;
  const right = width - left;
  const bottom = bodyTop + rowH * 9;
  for (let r = 0; r <= 9; r++) p.push(`<line x1="${left}" y1="${bodyTop + rowH * r}" x2="${right}" y2="${bodyTop + rowH * r}" ${thin}/>`);
  const vx = [left + numW, x0];
  for (let d = 0; d < 5; d++) vx.push(x0 + groupW * d + cellW, x0 + groupW * (d + 1));
  for (const x of vx) {
    const isSplit = (x - x0) % groupW !== 0 && x > x0;
    p.push(`<line x1="${x}" y1="${isSplit ? bodyTop : top}" x2="${x}" y2="${bottom}" ${thin}/>`);
  }
  p.push(`<rect x="${left}" y="${top}" width="${right - left}" height="${bottom - top}" fill="none" stroke="#333" stroke-width="${1.5 * s}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${p.join('')}</svg>`;
}

export async function schoolFormatPng(lessons: Lesson[], scale = 2): Promise<Buffer> {
  return sharp(Buffer.from(schoolFormatSvg(lessons, scale))).png().toBuffer();
}

/** Тот же формат как PDF с текстовым слоем (так обычно выгружается расписание из школьной системы). */
export async function schoolFormatPdf(lessons: Lesson[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const page = doc.addPage([595, 842]);
  const left = 18, topY = 842 - 56, numW = 18, timeW = 50, cellW = 49, roomW = 42, headH = 28, rowH = 77;
  const groupW = cellW + roomW;
  const x0 = left + numW + timeW;
  const right = x0 + groupW * 5;
  const bodyTop = topY - headH;
  const bottom = bodyTop - rowH * 9;
  page.drawText('Mr. Nurulloh dars jadvali', { x: 200, y: 842 - 34, size: 16, font: bold, color: rgb(0.12, 0.23, 0.37) });
  page.drawRectangle({ x: left, y: bodyTop, width: right - left, height: headH, color: rgb(0.9, 0.91, 0.92) });
  for (let r = 0; r < 9; r++) if (r % 2 === 1) page.drawRectangle({ x: left, y: bodyTop - rowH * (r + 1), width: right - left, height: rowH, color: rgb(0.957, 0.969, 0.984) });
  const center = (text: string, font: typeof bold, size: number, cx: number, y: number, color = rgb(0.07, 0.07, 0.07)) =>
    page.drawText(text, { x: cx - font.widthOfTextAtSize(text, size) / 2, y, size, font, color });
  const byKey = new Map(lessons.map((l) => [`${l.day}:${l.lesson}`, l]));
  for (let d = 0; d < 5; d++) {
    center(DAYS[d]!, bold, 9, x0 + groupW * d + groupW / 2, bodyTop + 10);
    for (let r = 0; r < 9; r++) {
      const l = byKey.get(`${d + 1}:${r + 1}`);
      if (!l) continue;
      const gx = x0 + groupW * d;
      const yTop = bodyTop - rowH * r;
      page.drawRectangle({ x: gx + cellW, y: yTop - rowH, width: roomW, height: rowH, color: rgb(0.992, 0.89, 0.769) });
      center(l.className, bold, 10, gx + cellW / 2, yTop - 26);
      center('IT (Informatika)', italic, 6, gx + cellW / 2, yTop - 64, rgb(0.23, 0.44, 0.85));
      center(l.room, bold, 8, gx + cellW + roomW / 2, yTop - rowH / 2 - 3, rgb(0.71, 0.33, 0.04));
    }
  }
  center('#', bold, 9, left + numW / 2, bodyTop + 10);
  center('Vaqt', bold, 9, left + numW + timeW / 2, bodyTop + 10);
  for (let r = 0; r < 9; r++) {
    const cy = bodyTop - rowH * r - rowH / 2 - 4;
    center(String(r + 1), bold, 10, left + numW / 2, cy);
    center(TIMES[r]!, bold, 6.5, left + numW + timeW / 2, cy);
  }
  const line = (x1: number, y1: number, x2: number, y2: number, dark = false) =>
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: dark ? 1.2 : 0.6, color: dark ? rgb(0.2, 0.2, 0.2) : rgb(0.79, 0.81, 0.84) });
  for (let r = 0; r <= 9; r++) line(left, bodyTop - rowH * r, right, bodyTop - rowH * r);
  line(left + numW, topY, left + numW, bottom);
  line(x0, topY, x0, bottom);
  for (let d = 0; d < 5; d++) {
    line(x0 + groupW * d + cellW, bodyTop, x0 + groupW * d + cellW, bottom);
    line(x0 + groupW * (d + 1), topY, x0 + groupW * (d + 1), bottom);
  }
  line(left, topY, right, topY, true);
  line(left, bottom, right, bottom, true);
  line(left, topY, left, bottom, true);
  line(right, topY, right, bottom, true);
  return Buffer.from(await doc.save());
}
