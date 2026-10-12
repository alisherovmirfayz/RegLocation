/**
 * Нормализация распознанного текста ячеек расписания.
 * Ключевая задача — не путать буквы и цифры в обозначениях классов (1B, 6B, 10A, 0A, 1C, 9A)
 * и в номерах кабинетов (404, 305 …).
 */

// Кириллические буквы, визуально совпадающие с латинскими.
const CYR_LOOKALIKE: Record<string, string> = {
  А: 'A', В: 'B', С: 'C', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', Т: 'T', Х: 'X', У: 'Y',
  а: 'A', в: 'B', с: 'C', е: 'E', к: 'K', м: 'M', н: 'H', о: 'O', р: 'P', т: 'T', х: 'X', у: 'Y',
  // «З» и «Б» неотличимы от цифр «3» и «6»
  З: '3', з: '3', Б: '6',
};

/** Символы, которые OCR часто выдаёт вместо цифр. */
const TO_DIGIT: Record<string, string> = {
  O: '0', Q: '0', D: '0', U: '0', '°': '0',
  I: '1', L: '1', '|': '1', '!': '1', ']': '1', '[': '1', J: '1', T: '7',
  Z: '2', S: '5', G: '6', B: '8', A: '4', g: '9', q: '9',
};

/** Символы, которые OCR часто выдаёт вместо букв класса. */
const TO_LETTER: Record<string, string> = {
  '8': 'B', '4': 'A', '6': 'G', '0': 'O', '5': 'S', '2': 'Z', '1': 'I', '7': 'T', '3': 'B', '€': 'C', '(': 'C',
};

export interface Normalized {
  value: string;
  /** 0..1 — итоговая уверенность с учётом исправлений */
  confidence: number;
  valid: boolean;
  corrected: boolean;
  note?: string;
}

function cleanup(raw: string): string {
  return raw
    .replace(/[\s\-_.,:;'"`«»“”‘’*~^]/g, '')
    .split('')
    .map((ch) => CYR_LOOKALIKE[ch] ?? ch)
    .join('')
    .toUpperCase();
}

export const MAX_CLASS_NUMBER = 11;

/**
 * Нормализует обозначение класса: «IOA» → «10A», «OA» → «0A», «68» → «6B», «lC» → «1C».
 * Формат: 1–2 цифры (0–11) + одна буква.
 */
export function normalizeClass(raw: string, ocrConfidence = 1): Normalized {
  const s = cleanup(raw);
  if (!s) return { value: '', confidence: 0, valid: false, corrected: false, note: 'Пусто' };
  if (/^\d{1,2}[A-ZА-ЯЁ]$/.test(s) && Number(s.slice(0, -1)) <= MAX_CLASS_NUMBER) {
    // Цифра получена из буквы «З»/«Б» — это догадка, а не уверенное прочтение
    if (/[ЗзБ]/.test(raw)) return { value: s, confidence: Math.min(ocrConfidence, 0.3), valid: true, corrected: true, note: `Исправлено OCR: «${raw.trim()}» → «${s}»` };
    return { value: s, confidence: ocrConfidence, valid: true, corrected: false };
  }
  if (s.length >= 2 && s.length <= 3) {
    const digits = s
      .slice(0, -1)
      .split('')
      .map((ch) => (/\d/.test(ch) ? ch : TO_DIGIT[ch] ?? ch))
      .join('');
    const lastRaw = s.slice(-1);
    const letter = /[A-ZА-ЯЁ]/.test(lastRaw) ? lastRaw : TO_LETTER[lastRaw] ?? lastRaw;
    const candidate = digits + letter;
    if (/^\d{1,2}[A-ZА-ЯЁ]$/.test(candidate) && Number(digits) <= MAX_CLASS_NUMBER) {
      // Буквы классов обычно A–H (или А–Е): «1T», «7O» скорее всего ошибка OCR — помечаем для проверки
      const usual = /[A-HА-Е]$/.test(candidate);
      return {
        value: candidate,
        confidence: Math.min(ocrConfidence, usual ? 0.7 : 0.4),
        valid: true,
        corrected: candidate !== s,
        note: `Исправлено OCR: «${raw.trim()}» → «${candidate}»`,
      };
    }
  }
  return { value: s, confidence: Math.min(ocrConfidence, 0.2), valid: false, corrected: false, note: `Не похоже на класс: «${raw.trim()}»` };
}

/**
 * Извлекает класс из ячейки, где кроме класса может быть предмет:
 * «1B\nIT (Informatika)» → 1B. Сначала первая строка, затем токены с цифрами.
 * Слова предмета («IT», «Informatika») не принимаются за класс: без цифр токен берётся только из первой строки.
 */
export function extractClass(text: string, ocrConfidence = 1): Normalized & { rest: string } {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const first = lines[0] ?? '';
  const rest = lines.slice(1).join(' ');
  const whole = normalizeClass(first, ocrConfidence);
  if (whole.valid) return { ...whole, rest };
  // Класс всегда в первой строке ячейки; вторая строка — предмет («IT» может читаться как «17»)
  const tokens = first.split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    if (!/\d/.test(tok)) continue;
    const n = normalizeClass(tok, ocrConfidence);
    if (n.valid) return { ...n, confidence: Math.min(n.confidence, 0.85), rest };
  }
  const firstTok = first.split(/\s+/)[0] ?? '';
  const n = normalizeClass(firstTok, ocrConfidence);
  if (n.valid) return { ...n, rest };
  return { ...normalizeClass(first, ocrConfidence), rest };
}

export interface RoomRef {
  id: string;
  code: string;
  name: string;
}

const squash = (s: string) =>
  s
    .toLowerCase()
    .replace(/[\s\-_.]/g, '')
    .replace(/^(каб(инет)?|kab(inet)?|xona)/, '');

/**
 * Нормализует номер кабинета и сопоставляет с базой помещений.
 * Никогда не подставляет кабинет «по умолчанию»: если номер не распознан или не найден — roomId = null и флаг проверки.
 */
export function normalizeRoom(raw: string, rooms: RoomRef[], ocrConfidence = 1): Normalized & { roomId: string | null } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: '', confidence: 0, valid: false, corrected: false, roomId: null, note: 'Номер кабинета не распознан' };

  // 1) Прямое совпадение с кодом или названием помещения (например, «Sport zal 1»).
  const sq = squash(trimmed);
  const direct = rooms.find((r) => squash(r.code) === sq || squash(r.name) === sq);
  if (direct) return { value: direct.code, confidence: ocrConfidence, valid: true, corrected: false, roomId: direct.id };

  // 2) Числовой номер с исправлением похожих символов: «4O4» → «404».
  const s = cleanup(trimmed).replace(/^(KAB(INET)?|KA6|XONA)/, '');
  const digits = s
    .split('')
    .map((ch) => (/\d/.test(ch) ? ch : TO_DIGIT[ch] ?? ch))
    .join('');
  if (/^\d{2,4}$/.test(digits)) {
    const corrected = digits !== s;
    const match = rooms.find((r) => r.code === digits);
    if (match) {
      return {
        value: digits,
        confidence: corrected ? Math.min(ocrConfidence, 0.75) : ocrConfidence,
        valid: true,
        corrected,
        roomId: match.id,
        note: corrected ? `Исправлено OCR: «${trimmed}» → «${digits}»` : undefined,
      };
    }
    return {
      value: digits,
      confidence: Math.min(ocrConfidence, 0.4),
      valid: false,
      corrected,
      roomId: null,
      note: `Кабинет ${digits} не найден в базе помещений`,
    };
  }
  return { value: trimmed, confidence: Math.min(ocrConfidence, 0.2), valid: false, corrected: false, roomId: null, note: `Не похоже на номер кабинета: «${trimmed}»` };
}

// ───────────────────────── Дни недели ─────────────────────────

const DAY_WORDS: [number, string[]][] = [
  [1, ['понедельник', 'пн', 'dushanba', 'душанба', 'monday', 'mon', 'du']],
  [2, ['вторник', 'вт', 'seshanba', 'сешанба', 'tuesday', 'tue', 'se']],
  [3, ['среда', 'ср', 'chorshanba', 'чоршанба', 'wednesday', 'wed', 'chor']],
  [4, ['четверг', 'чт', 'payshanba', 'пайшанба', 'thursday', 'thu', 'pay']],
  [5, ['пятница', 'пт', 'juma', 'жума', 'friday', 'fri', 'ju']],
  [6, ['суббота', 'сб', 'shanba', 'шанба', 'saturday', 'sat', 'sha']],
];

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length]![b.length]!;
}

/** Распознаёт день недели (рус., узб. латиница/кириллица, англ.). Возвращает 1..6 или null. */
export function matchDay(text: string): number | null {
  const t = text
    .toLowerCase()
    .replace(/[ʻ'`ʼ‘’]/g, '')
    .replace(/[^a-zа-яёўқғҳ]/g, '');
  if (!t) return null;
  // Сначала точные совпадения полных слов (длинные — первыми, т.к. «shanba» входит в «dushanba»).
  const full = DAY_WORDS.flatMap(([d, words]) => words.filter((w) => w.length >= 4).map((w) => [d, w] as const)).sort(
    (a, b) => b[1].length - a[1].length,
  );
  for (const [d, w] of full) if (t === w || t.startsWith(w)) return d;
  for (const [d, w] of full) if (t.includes(w)) return d;
  // Нечёткое сравнение для слов с ошибками OCR.
  if (t.length >= 5) {
    let best: { d: number; dist: number } | null = null;
    for (const [d, w] of full) {
      const dist = levenshtein(t.slice(0, w.length + 1), w);
      if (dist <= Math.max(1, Math.floor(w.length / 4)) && (!best || dist < best.dist)) best = { d, dist };
    }
    if (best) return best.d;
  }
  // Короткие сокращения: «пн», «вт», «mon»…
  for (const [d, words] of DAY_WORDS) if (words.includes(t)) return d;
  return null;
}

/** Номер урока из текста ячейки: «1», «1 урок», «1-dars», «1.», «09:00-09:45» (по позиции не определяется). */
export function matchLessonNumber(text: string): number | null {
  const t = text.trim();
  // Время урока («09:00-09:45») — это не номер урока
  if (/\d{1,2}\s*[:.]\s*\d{2}/.test(t)) return null;
  const m = /^\s*([0-9IlO|]{1,2})\s*(?:[-.)]?\s*(?:урок|dars|lesson|-?й)?)?\s*$/i.exec(t) ?? /^([0-9]{1,2})\b/.exec(t);
  if (!m) return null;
  const digits = m[1]!.replace(/[Il|]/g, '1').replace(/O/g, '0');
  const n = Number(digits);
  return n >= 1 && n <= 15 ? n : null;
}

export function looksLikeRoom(text: string): boolean {
  return /^\s*\d{3}\s*$/.test(text);
}

export function looksLikeClass(text: string): boolean {
  return normalizeClass(text).valid;
}
