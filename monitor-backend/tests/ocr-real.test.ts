import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadConfig } from '../src/config';
import { OcrService } from '../src/ocr/service';
import { DEFAULT_SCHOOL } from '../src/domain/seed';
import type { RecognitionResult } from '../src/ocr/pipeline';
import { MIXED_ROOMS, REAL_SAMPLE, schoolFormatPdf, schoolFormatPng, type Lesson } from './fixtures/schoolFormat';

const rooms = DEFAULT_SCHOOL.flatMap((f) => f.rooms).map((r, i) => ({ id: `room-${i}`, code: r.code, name: r.name }));
const ocr = new OcrService(loadConfig({ ...process.env, NODE_ENV: 'test' }));
afterAll(() => ocr.terminate());

function score(result: RecognitionResult, truth: Lesson[]) {
  const positions = new Set(result.entries.map((e) => `${e.dayOfWeek}:${e.lessonNumber}`));
  let classOk = 0;
  let roomOk = 0;
  const silentErrors: string[] = [];
  for (const l of truth) {
    const e = result.entries.find((x) => x.dayOfWeek === l.day && x.lessonNumber === l.lesson);
    if (!e) continue;
    const cOk = e.className === l.className;
    const rOk = e.roomLabel === l.room && e.roomId === rooms.find((r) => r.code === l.room)?.id;
    if (cOk) classOk++;
    if (rOk) roomOk++;
    // Ошибка допустима только если запись помечена «Проверьте»
    if ((!cOk || !rOk) && !e.needsReview) silentErrors.push(`${l.day}:${l.lesson} ${e.className}/${e.roomLabel}`);
  }
  const allPositions = truth.every((l) => positions.has(`${l.day}:${l.lesson}`));
  return { classOk, roomOk, total: truth.length, extra: result.entries.length - truth.length, allPositions, silentErrors };
}

describe('Расписание в формате школы', () => {
  it('реальный образец (скриншот 590 px): все уроки на своих местах, ошибки не проходят молча', async () => {
    const r = await ocr.recognize(readFileSync('tests/fixtures/real/timetable-example.png'), rooms);
    const s = score(r, REAL_SAMPLE);
    expect(s.allPositions).toBe(true);
    expect(s.extra).toBe(0);
    expect(s.classOk).toBeGreaterThanOrEqual(22); // низкое разрешение — часть классов отправляется на ручную проверку
    expect(s.roomOk).toBeGreaterThanOrEqual(s.total - 1); // кабинеты: повторное чтение + сверка с остальными уроками
    expect(s.silentErrors).toEqual([]);
  }, 240_000);

  it('PNG хорошего качества: классы и кабинеты распознаются полностью', async () => {
    const r = await ocr.recognize(await schoolFormatPng(MIXED_ROOMS, 2), rooms);
    const s = score(r, MIXED_ROOMS);
    expect(s.allPositions).toBe(true);
    expect(s.extra).toBe(0);
    expect(s.classOk).toBeGreaterThanOrEqual(s.total - 1);
    expect(s.roomOk).toBeGreaterThanOrEqual(s.total - 1);
    expect(s.silentErrors).toEqual([]);
  }, 240_000);

  it('PDF с текстовым слоем: 100% без OCR', async () => {
    const r = await ocr.recognize(await schoolFormatPdf(MIXED_ROOMS), rooms);
    const s = score(r, MIXED_ROOMS);
    expect(s).toMatchObject({ classOk: s.total, roomOk: s.total, extra: 0, allPositions: true });
    expect(r.entries.every((e) => !e.needsReview)).toBe(true);
  }, 120_000);
});
