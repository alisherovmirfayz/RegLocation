import { afterAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { loadConfig } from '../src/config';
import { OcrService } from '../src/ocr/service';
import { detectGrid } from '../src/ocr/grid';
import { prepareRaster, recognizeTimetable, sniffMime, type RecognitionResult } from '../src/ocr/pipeline';
import { DEFAULT_SCHOOL } from '../src/domain/seed';
import { SAMPLE_LESSONS, timetableJpegPhoto, timetablePdf, timetablePng } from './fixtures/timetable';

const rooms = DEFAULT_SCHOOL.flatMap((f) => f.rooms).map((r, i) => ({ id: `room-${i}-${r.code}`, code: r.code, name: r.name }));
const ocr = new OcrService(loadConfig({ ...process.env, NODE_ENV: 'test' }));

afterAll(() => ocr.terminate());

function accuracy(result: RecognitionResult) {
  let classOk = 0;
  let roomOk = 0;
  for (const l of SAMPLE_LESSONS) {
    const e = result.entries.find((x) => x.dayOfWeek === l.day && x.lessonNumber === l.lesson);
    if (e?.className === l.className) classOk++;
    if (e?.roomLabel === l.room && e.roomId === rooms.find((r) => r.code === l.room)?.id) roomOk++;
  }
  return { classOk, roomOk, total: SAMPLE_LESSONS.length, extra: result.entries.length - SAMPLE_LESSONS.length };
}

describe('OCR: проверка файлов', () => {
  it('определяет тип файла по сигнатуре, а не по расширению', async () => {
    expect(sniffMime(await timetablePng())).toBe('image/png');
    expect(sniffMime(await timetableJpegPhoto())).toBe('image/jpeg');
    expect(sniffMime(await timetablePdf())).toBe('application/pdf');
    expect(sniffMime(Buffer.from('<script>alert(1)</script>'))).toBeNull();
  });

  it('отклоняет неподдерживаемые файлы', async () => {
    await expect(recognizeTimetable(Buffer.from('PK\x03\x04 zip archive....'), { reader: ocr, rooms, maxPages: 3 })).rejects.toThrow(/Неподдерживаемый формат/);
    // Повреждённый файл с правильной сигнатурой — понятная ошибка, а не падение сервера
    await expect(recognizeTimetable(Buffer.from('GIF89a broken file....'), { reader: ocr, rooms, maxPages: 3 })).rejects.toThrow(/Не удалось открыть файл/);
  });

  it('узнаёт форматы изображений с телефона и сканера', async () => {
    const png = await timetablePng();
    expect(sniffMime(await sharp(png).webp().toBuffer())).toBe('image/webp');
    expect(sniffMime(await sharp(png).tiff().toBuffer())).toBe('image/tiff');
    expect(sniffMime(await sharp(png).gif().toBuffer())).toBe('image/gif');
    expect(sniffMime(await sharp(png).resize(200).avif().toBuffer())).toBe('image/avif');
    expect(sniffMime(await toBmp(png))).toBe('image/bmp');
    // Заголовок HEIC (фото iPhone): ftyp + бренд heic
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(16)]);
    expect(sniffMime(heic)).toBe('image/heic');
    // Декодер HEIC загружается; повреждённый файл даёт понятную ошибку
    await expect(recognizeTimetable(heic, { reader: ocr, rooms, maxPages: 3 })).rejects.toThrow(/Не удалось открыть файл/);
  });
});

/** 24-битный BMP (sharp не умеет сохранять BMP). */
async function toBmp(png: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const stride = Math.floor((24 * info.width + 31) / 32) * 4;
  const out = Buffer.alloc(54 + stride * info.height);
  out.write('BM', 0, 'latin1');
  out.writeUInt32LE(out.length, 2);
  out.writeUInt32LE(54, 10);
  out.writeUInt32LE(40, 14);
  out.writeInt32LE(info.width, 18);
  out.writeInt32LE(info.height, 22);
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(24, 28);
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const s = (y * info.width + x) * 3;
      const d = 54 + (info.height - 1 - y) * stride + x * 3;
      out[d] = data[s + 2]!;
      out[d + 1] = data[s + 1]!;
      out[d + 2] = data[s]!;
    }
  }
  return out;
}

describe('OCR: другие форматы файлов', () => {
  const check = (r: RecognitionResult) => {
    const acc = accuracy(r);
    expect(acc.classOk).toBeGreaterThanOrEqual(acc.total - 1);
    expect(acc.roomOk).toBeGreaterThanOrEqual(acc.total - 1);
    expect(acc.extra).toBe(0);
  };
  it('WEBP', async () => check(await ocr.recognize(await sharp(await timetablePng()).webp({ quality: 92 }).toBuffer(), rooms)), 180_000);
  it('BMP', async () => check(await ocr.recognize(await toBmp(await timetablePng()), rooms)), 180_000);
  it('TIFF из сканера (2 страницы): читаются обе', async () => {
    const png = await timetablePng();
    const page = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    // Две одинаковые страницы одна под другой → многостраничный TIFF
    const tiff = await sharp(Buffer.concat([page.data, page.data]), { raw: { width: page.info.width, height: page.info.height * 2, channels: page.info.channels as 3 | 4, pageHeight: page.info.height } })
      .tiff()
      .toBuffer();
    const r = await ocr.recognize(tiff, rooms);
    expect(r.processedPages).toBe(2);
    check(r);
  }, 240_000);
});

describe('OCR: поиск таблицы', () => {
  it('находит строки, столбцы, объединённые заголовки и оранжевые ячейки', async () => {
    const raw = await prepareRaster(await timetablePng(), 'image/png');
    const grid = detectGrid(raw)!;
    expect(grid).not.toBeNull();
    expect(grid.cols.length).toBe(14); // 13 столбцов → 14 линий
    expect(grid.cells.length).toBe(10); // заголовок + 9 уроков
    // В заголовке день занимает 2 столбца
    const header = grid.cells[0]!;
    expect(header.length).toBe(7);
    expect(header.slice(1).every((c) => c.colSpan === 2)).toBe(true);
    // Столбцы кабинетов оранжевые, столбцы классов белые
    const row = grid.cells[1]!;
    expect(row[1]!.color).toBe('white');
    expect(row[2]!.color).toBe('orange');
  });
});

describe('OCR: распознавание образцов расписания', () => {
  it('PNG: классы и кабинеты объединяются в записи занятий', async () => {
    const result = await ocr.recognize(await timetablePng(), rooms);
    const acc = accuracy(result);
    expect(result.method).toBe('ocr');
    expect(acc.classOk).toBe(acc.total);
    expect(acc.extra).toBe(0);
    for (const l of SAMPLE_LESSONS) {
      const e = result.entries.find((x) => x.dayOfWeek === l.day && x.lessonNumber === l.lesson)!;
      expect(e.roomLabel).toBe(l.room);
      expect(e.roomId).toBe(rooms.find((r) => r.code === l.room)!.id);
    }
    // Субботние уроки распознаются
    expect(result.entries.filter((e) => e.dayOfWeek === 6)).toHaveLength(2);
  }, 180_000);

  it('PDF (2 страницы, текстовый слой): берёт текст из PDF без OCR', async () => {
    const result = await ocr.recognize(await timetablePdf(), rooms);
    expect(result.processedPages).toBe(2);
    expect(result.method === 'text-layer' || result.method === 'mixed').toBe(true);
    const acc = accuracy(result);
    expect(acc.classOk).toBe(acc.total);
    expect(acc.extra).toBe(0);
    for (const e of result.entries) expect(e.needsReview).toBe(false);
  }, 180_000);

  it('JPEG «фото» с наклоном: распознаёт и помечает сомнительное для проверки', async () => {
    const result = await ocr.recognize(await timetableJpegPhoto(), rooms);
    const acc = accuracy(result);
    // Для фото не требуем 100% — требуем, чтобы ошибки не проходили молча.
    expect(acc.classOk).toBeGreaterThanOrEqual(acc.total - 2);
    for (const l of SAMPLE_LESSONS) {
      const e = result.entries.find((x) => x.dayOfWeek === l.day && x.lessonNumber === l.lesson);
      if (e && (e.className !== l.className || e.roomLabel !== l.room)) expect(e.needsReview).toBe(true);
    }
  }, 180_000);

  it('нечитаемый кабинет не подставляется — запись помечается для проверки', async () => {
    const svgNoRoom = (await import('./fixtures/timetable')).timetableSvg({ lessons: [{ day: 1, lesson: 1, className: '10A', room: '' }] });
    const png = await sharp(Buffer.from(svgNoRoom)).png().toBuffer();
    const result = await ocr.recognize(png, rooms);
    const e = result.entries.find((x) => x.dayOfWeek === 1 && x.lessonNumber === 1)!;
    expect(e.className).toBe('10A');
    expect(e.roomId).toBeNull();
    expect(e.roomLabel).toBe('');
    expect(e.needsReview).toBe(true);
  }, 180_000);
});
