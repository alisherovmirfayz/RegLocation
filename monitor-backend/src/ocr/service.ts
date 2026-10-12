import os from 'node:os';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { createWorker, PSM, type Worker } from 'tesseract.js';
import type { AppConfig } from '../config';
import { logger } from '../lib/logger';
import { recognizeTimetable, type CellReader, type ReadMode, type RecognitionResult } from './pipeline';
import type { RoomRef } from './normalize';

const CLASS_WHITELIST = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ROOM_WHITELIST = '0123456789';
const WORD_WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюяЎўҚқҒғҲҳ';

/**
 * OCR на базе Tesseract.js (WASM, бесплатно, без внешних ИИ API).
 * Один переиспользуемый worker и очередь задач — сервер не перегружается при одновременных загрузках.
 */
export class OcrService implements CellReader {
  private worker: Promise<Worker> | null = null;
  private mode: ReadMode | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private idleTimer: NodeJS.Timeout | null = null;

  constructor(private config: AppConfig) {}

  private getWorker(): Promise<Worker> {
    if (!this.worker) {
      const cachePath = this.config.OCR_CACHE_PATH ?? path.join(os.tmpdir(), 'reglocation-tessdata');
      mkdirSync(cachePath, { recursive: true });
      const langs = this.config.OCR_LANGS.split('+').filter(Boolean);
      logger.info('Запуск OCR-движка', { langs });
      this.worker = createWorker(langs, 1, {
        cachePath,
        ...(this.config.OCR_LANG_PATH ? { langPath: this.config.OCR_LANG_PATH } : {}),
      }).catch((e) => {
        this.worker = null;
        throw e;
      });
      this.mode = null;
    }
    return this.worker;
  }

  /** Освобождаем память, если OCR долго не используется. */
  private scheduleIdle() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => void this.terminate(), 10 * 60_000);
    this.idleTimer.unref();
  }

  async read(png: Buffer, mode: ReadMode): Promise<{ text: string; confidence: number }> {
    const worker = await this.getWorker();
    if (this.mode !== mode) {
      await worker.setParameters({
        tessedit_pageseg_mode: mode === 'room' || mode === 'word' ? PSM.SINGLE_LINE : mode === 'classLine' ? PSM.SINGLE_WORD : PSM.SINGLE_BLOCK,
        tessedit_char_whitelist: mode === 'class' || mode === 'classLine' ? CLASS_WHITELIST : mode === 'room' ? ROOM_WHITELIST : mode === 'word' ? WORD_WHITELIST : '',
        user_defined_dpi: '300',
      });
      this.mode = mode;
    }
    const { data } = await worker.recognize(png);
    // Убираем артефакты линий таблицы, попавшие в ячейку («|», «[», «_»)
    // Строки сохраняем: в ячейке класса вторая строка — предмет
    const text = (data.text ?? '')
      .replace(/[|¦[\]{}_—–]/g, ' ')
      .split('\n')
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n');
    const meaningful = /[\p{L}\d]/u.test(text);
    return { text: meaningful ? text : '', confidence: meaningful ? Math.max(0, Math.min(1, (data.confidence ?? 0) / 100)) : 0 };
  }

  /** Распознать расписание. Задачи выполняются последовательно. */
  recognize(file: Buffer, rooms: RoomRef[]): Promise<RecognitionResult> {
    const job = this.queue.then(() =>
      recognizeTimetable(file, { reader: this, rooms, maxPages: this.config.MAX_PDF_PAGES }).finally(() => this.scheduleIdle()),
    );
    this.queue = job.catch(() => undefined);
    return job;
  }

  async terminate() {
    const w = this.worker;
    this.worker = null;
    this.mode = null;
    if (w) await (await w).terminate().catch(() => undefined);
  }
}
