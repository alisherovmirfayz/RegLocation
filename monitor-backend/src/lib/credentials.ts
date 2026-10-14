import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h',
};

export function transliterate(input: string): string {
  return input
    .toLowerCase()
    .replace(/[ʻ'`ʼ‘’]/g, '')
    .split('')
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('')
    .normalize('NFKD')
    .replace(/[^a-z0-9]/g, '');
}

/** Базовый логин: фамилия + первая буква имени, латиницей. */
export function baseLogin(firstName: string, lastName: string, prefix = ''): string {
  const last = transliterate(lastName).slice(0, 14);
  const first = transliterate(firstName).slice(0, 1);
  const base = `${prefix}${last}${first ? '.' + first : ''}`;
  return base.length >= 3 ? base : `${prefix}user${randomInt(100, 999)}`;
}

/**
 * Генерирует уникальный логин. `exists` проверяет занятость в базе.
 * Добавляет криптографически случайный числовой суффикс при совпадении.
 */
export async function generateUniqueLogin(
  firstName: string,
  lastName: string,
  exists: (login: string) => Promise<boolean>,
  prefix = '',
): Promise<string> {
  const base = baseLogin(firstName, lastName, prefix);
  if (!(await exists(base))) return base;
  for (let i = 0; i < 50; i++) {
    const candidate = `${base}${randomInt(10, i < 20 ? 100 : 10_000)}`;
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error('Не удалось подобрать уникальный логин');
}

// Простой для ввода пароль: три слога и четыре цифры (например, «kamidu4827»).
// Без похожих символов (0/o, 1/l), только строчные буквы — легко переписать с листа и набрать на телефоне.
const CONSONANTS = 'bdfgkmnprstvz';
const VOWELS = 'aeiu';
const DIGITS = '23456789';

/** Случайный пароль (crypto.randomInt — CSPRNG): ≈ 28 бит; от подбора защищает блокировка входа после неудачных попыток. */
export function generatePassword(): string {
  let p = '';
  for (let i = 0; i < 3; i++) p += CONSONANTS[randomInt(CONSONANTS.length)]! + VOWELS[randomInt(VOWELS.length)]!;
  for (let i = 0; i < 4; i++) p += DIGITS[randomInt(DIGITS.length)]!;
  return p;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

export function generateNumericCode(digits = 6): string {
  return String(randomInt(0, 10 ** digits)).padStart(digits, '0');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
