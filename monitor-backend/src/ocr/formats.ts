import { createRequire } from 'node:module';
import sharp from 'sharp';
import { HttpError } from '../lib/errors';

/**
 * Форматы файлов расписания и изображений.
 * Тип определяется только по содержимому (сигнатуре), расширению и Content-Type не доверяем.
 */
export type FileMime =
  | 'application/pdf'
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'image/gif'
  | 'image/bmp'
  | 'image/tiff'
  | 'image/heic'
  | 'image/avif';

/** Всё, что можно загрузить как расписание. */
export const TIMETABLE_MIME: FileMime[] = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff', 'image/heic', 'image/avif'];
/** Всё, что можно загрузить как фотографию или логотип. */
export const IMAGE_MIME: FileMime[] = TIMETABLE_MIME.filter((m) => m !== 'application/pdf');

/** Понятные названия для сообщений об ошибке. */
export const FORMAT_LABEL: Record<FileMime, string> = {
  'application/pdf': 'PDF',
  'image/png': 'PNG',
  'image/jpeg': 'JPG',
  'image/webp': 'WEBP',
  'image/gif': 'GIF',
  'image/bmp': 'BMP',
  'image/tiff': 'TIFF',
  'image/heic': 'HEIC',
  'image/avif': 'AVIF',
};

/** Фотографии с камеры: им нужны шумоподавление и выравнивание наклона, как JPEG (WEBP — обычно скриншот). */
export const PHOTO_MIME = new Set<FileMime>(['image/jpeg', 'image/heic', 'image/avif']);

/** Ошибка во входном файле — показывается пользователю как есть (HTTP 400), а не как сбой сервера. */
export class InputFileError extends HttpError {
  constructor(message: string) {
    super(400, message, 'BAD_FILE');
  }
}

const ascii = (buf: Buffer, start: number, end: number) => buf.subarray(start, end).toString('latin1');

export function sniffMime(buf: Buffer): FileMime | null {
  if (buf.length < 12) return null;
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (ascii(buf, 0, 5) === '%PDF-') return 'application/pdf';
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP') return 'image/webp';
  if (ascii(buf, 0, 6) === 'GIF87a' || ascii(buf, 0, 6) === 'GIF89a') return 'image/gif';
  if (ascii(buf, 0, 2) === 'BM' && buf.length >= 54 && buf.readUInt32LE(2) <= buf.length + 1024) return 'image/bmp';
  if (ascii(buf, 0, 4) === 'II*\0' || ascii(buf, 0, 4) === 'MM\0*') return 'image/tiff';
  if (ascii(buf, 4, 8) === 'ftyp') {
    const brand = ascii(buf, 8, 12);
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heim', 'heis'].includes(brand)) return 'image/heic';
  }
  return null;
}

type HeicDecode = (opts: { buffer: Uint8Array }) => Promise<{ width: number; height: number; data: Uint8ClampedArray }>;
let heicDecode: HeicDecode | null = null;

/** HEIC (фото iPhone): бесплатный декодер libheif (WASM), без внешних сервисов. */
async function decodeHeic(buf: Buffer): Promise<Buffer> {
  heicDecode ??= createRequire(import.meta.url)('heic-decode') as HeicDecode;
  const img = await heicDecode({ buffer: new Uint8Array(buf.buffer, buf.byteOffset, buf.length) });
  return sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length), { raw: { width: img.width, height: img.height, channels: 4 } })
    .png()
    .toBuffer();
}

/** BMP без сжатия: 1/4/8 бит с палитрой, 24 и 32 бита (sharp BMP не читает). */
export function decodeBmp(buf: Buffer): { data: Buffer; width: number; height: number } {
  const offset = buf.readUInt32LE(10);
  const dib = buf.readUInt32LE(14);
  const width = buf.readInt32LE(18);
  const rawH = buf.readInt32LE(22);
  const bpp = buf.readUInt16LE(28);
  const compression = dib >= 40 ? buf.readUInt32LE(30) : 0;
  const height = Math.abs(rawH);
  if (width <= 0 || height <= 0 || width * height > 60_000_000) throw new Error('BMP: недопустимый размер');
  if (![1, 4, 8, 24, 32].includes(bpp) || !(compression === 0 || (compression === 3 && bpp === 32))) {
    throw new Error('BMP со сжатием не поддерживается — сохраните файл как PNG или JPG');
  }
  const stride = Math.floor((bpp * width + 31) / 32) * 4;
  if (offset + stride * height > buf.length) throw new Error('BMP: файл повреждён');
  const paletteAt = 14 + dib;
  const out = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    const row = offset + (rawH > 0 ? height - 1 - y : y) * stride;
    for (let x = 0; x < width; x++) {
      let b: number, g: number, r: number;
      if (bpp >= 24) {
        const p = row + x * (bpp / 8);
        b = buf[p]!;
        g = buf[p + 1]!;
        r = buf[p + 2]!;
      } else {
        const bit = x * bpp;
        const byte = buf[row + (bit >> 3)]!;
        const idx = (byte >> (8 - bpp - (bit & 7))) & ((1 << bpp) - 1);
        const pal = paletteAt + idx * 4;
        b = buf[pal]!;
        g = buf[pal + 1]!;
        r = buf[pal + 2]!;
      }
      const o = (y * width + x) * 3;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
    }
  }
  return { data: out, width, height };
}

/**
 * Приводит изображение любого поддерживаемого формата к виду, который читает sharp.
 * HEIC и BMP декодируются отдельно, остальные форматы sharp читает сам.
 */
export async function toSharpInput(buf: Buffer, mime: FileMime): Promise<Buffer> {
  if (mime === 'image/heic') return decodeHeic(buf);
  if (mime === 'image/bmp') {
    const bmp = decodeBmp(buf);
    return sharp(bmp.data, { raw: { width: bmp.width, height: bmp.height, channels: 3 } }).png().toBuffer();
  }
  return buf;
}

/**
 * Страницы изображения в PNG. Многостраничный TIFF разбирается по страницам (как PDF),
 * у анимированного GIF берётся первый кадр.
 */
export async function imagePages(buf: Buffer, mime: FileMime, maxPages: number): Promise<{ pages: Buffer[]; totalPages: number }> {
  const input = await toSharpInput(buf, mime);
  if (mime === 'image/tiff') {
    const meta = await sharp(input, { limitInputPixels: 60_000_000 }).metadata();
    const total = Math.max(1, meta.pages ?? 1);
    const pages: Buffer[] = [];
    for (let i = 0; i < Math.min(total, maxPages); i++) pages.push(await sharp(input, { page: i, limitInputPixels: 60_000_000 }).png().toBuffer());
    return { pages, totalPages: total };
  }
  return { pages: [await sharp(input, { limitInputPixels: 60_000_000 }).png().toBuffer()], totalPages: 1 };
}
