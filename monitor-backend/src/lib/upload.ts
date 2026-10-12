import multer from 'multer';
import sharp from 'sharp';
import type { AppConfig } from '../config';
import { badRequest } from './errors';
import { FORMAT_LABEL, sniffMime, toSharpInput, type FileMime } from '../ocr/formats';

export function uploader(config: AppConfig, maxMb = config.MAX_UPLOAD_MB) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMb * 1024 * 1024, files: 1, fields: 10 },
  });
}

/** Проверяет сигнатуру файла и допустимые типы. */
export function assertFileType(buf: Buffer | undefined, allowed: FileMime[]): FileMime {
  if (!buf || buf.length === 0) throw badRequest('Файл не выбран');
  const mime = sniffMime(buf);
  if (!mime || !allowed.includes(mime)) {
    throw badRequest(`Неподдерживаемый формат. Допустимо: ${allowed.map((a) => FORMAT_LABEL[a]).join(', ')}`);
  }
  return mime;
}

/**
 * Аватарка: перекодируем в WebP 512×512 — это удаляет метаданные (в т.ч. GPS из EXIF)
 * и исключает загрузку «картинок» с вредоносным содержимым.
 */
export async function processAvatar(buf: Buffer): Promise<Buffer> {
  try {
    return await sharp(await decodable(buf), { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(512, 512, { fit: 'cover', position: 'attention' })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw badRequest('Не удалось обработать изображение');
  }
}

/** Логотип: без перерисовки и обрезки — только ограничение размера; формат PNG без потерь. */
export async function processLogo(buf: Buffer): Promise<Buffer> {
  try {
    return await sharp(await decodable(buf), { limitInputPixels: 40_000_000 }).rotate().resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  } catch {
    throw badRequest('Не удалось обработать изображение');
  }
}

/** HEIC и BMP sharp не читает напрямую — сначала переводим в PNG. */
async function decodable(buf: Buffer): Promise<Buffer> {
  const mime = sniffMime(buf);
  return mime ? toSharpInput(buf, mime) : buf;
}
