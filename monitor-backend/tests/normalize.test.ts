import { describe, expect, it } from 'vitest';
import { matchDay, matchLessonNumber, normalizeClass, normalizeRoom } from '../src/ocr/normalize';
import { generatePassword, generateUniqueLogin, transliterate } from '../src/lib/credentials';
import { hashPassword, verifyPassword } from '../src/lib/passwords';
import { detectStaffKind } from '../src/domain/teachers';

describe('Классы: не путать буквы и цифры', () => {
  const ok: [string, string][] = [
    ['1B', '1B'], ['6B', '6B'], ['10A', '10A'], ['0A', '0A'], ['1C', '1C'], ['9A', '9A'],
    ['IOA', '10A'], ['1OA', '10A'], ['OA', '0A'], ['68', '6B'], ['GB', '6B'], ['lC', '1C'], ['IC', '1C'], ['18', '1B'], ['94', '9A'],
    ['10А', '10A'], // кириллическая «А»
    ['1В', '1B'], // кириллическая «В»
    [' 10-A ', '10A'],
  ];
  for (const [raw, expected] of ok) {
    it(`«${raw}» → ${expected}`, () => {
      const n = normalizeClass(raw, 0.95);
      expect(n.valid).toBe(true);
      expect(n.value).toBe(expected);
    });
  }
  it('исправленное значение получает пониженную уверенность (требует проверки)', () => {
    expect(normalizeClass('IOA', 0.95).confidence).toBeLessThan(0.8);
    expect(normalizeClass('10A', 0.95).confidence).toBe(0.95);
    // Кириллическая «З» выглядит как «3»: значение исправляется, но остаётся на проверке
    expect(normalizeClass('ЗВ', 0.95)).toMatchObject({ value: '3B', valid: true });
    expect(normalizeClass('зв', 0.95).confidence).toBeLessThan(0.8);
  });
  it('мусор не считается классом', () => {
    expect(normalizeClass('Математика').valid).toBe(false);
    expect(normalizeClass('404').valid).toBe(false);
    expect(normalizeClass('').valid).toBe(false);
  });
});

describe('Кабинеты: сверка с базой', () => {
  const rooms = [
    { id: 'a', code: '404', name: 'Кабинет 404' },
    { id: 'b', code: '405', name: 'Кабинет 405' },
    { id: 'c', code: 'SPORT1', name: 'Sport zal 1' },
  ];
  it('точное совпадение', () => expect(normalizeRoom('404', rooms)).toMatchObject({ roomId: 'a', valid: true }));
  it('исправление O→0', () => expect(normalizeRoom('4O4', rooms)).toMatchObject({ value: '404', roomId: 'a', corrected: true }));
  it('по названию', () => expect(normalizeRoom('Sport zal 1', rooms)).toMatchObject({ roomId: 'c' }));
  it('«каб. 405»', () => expect(normalizeRoom('каб. 405', rooms)).toMatchObject({ roomId: 'b' }));
  it('неизвестный кабинет не подставляется', () => expect(normalizeRoom('999', rooms)).toMatchObject({ roomId: null, valid: false }));
  it('пусто — не подставляется 404', () => expect(normalizeRoom('', rooms)).toMatchObject({ roomId: null, valid: false }));
});

describe('Дни недели (рус./узб./англ.)', () => {
  const cases: [string, number][] = [
    ['Понедельник', 1], ['ВТОРНИК', 2], ['Среда', 3], ['Четверг', 4], ['Пятница', 5], ['Суббота', 6],
    ['Dushanba', 1], ['Seshanba', 2], ['Chorshanba', 3], ['Payshanba', 4], ['Juma', 5], ['Shanba', 6],
    ['Душанба', 1], ['Шанба', 6], ['Monday', 1], ['Saturday', 6], ['Пн', 1], ['Сб', 6],
    ['Понедельнк', 1], ['Суббoта', 6],
  ];
  for (const [t, d] of cases) it(`${t} → ${d}`, () => expect(matchDay(t)).toBe(d));
  it('не день недели', () => expect(matchDay('10A')).toBeNull());
  it('номер урока', () => {
    expect(matchLessonNumber('1')).toBe(1);
    expect(matchLessonNumber('9 урок')).toBe(9);
    expect(matchLessonNumber('3-dars')).toBe(3);
    expect(matchLessonNumber('l')).toBe(1);
  });
});

describe('Генерация логинов и паролей', () => {
  it('транслитерация', () => {
    expect(transliterate('Иванова')).toBe('ivanova');
    expect(transliterate('Шукуров')).toBe('shukurov');
    expect(transliterate("G'ulomova")).toBe('gulomova');
  });
  it('уникальный логин', async () => {
    const taken = new Set(['ivanov.a']);
    const login = await generateUniqueLogin('Алексей', 'Иванов', async (l) => taken.has(l));
    expect(login).toMatch(/^ivanov\.a\d+$/);
  });
  it('надёжный пароль: длина, классы символов, случайность', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = generatePassword();
      expect(p).toHaveLength(14);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/\d/);
      expect(p).toMatch(/[-_!@#]/);
      expect(p).not.toMatch(/[0O1lI]/);
      seen.add(p);
    }
    expect(seen.size).toBe(200);
  });
  it('Argon2id: хеш не содержит пароль, проверка работает', async () => {
    const h = await hashPassword('Secret-12345');
    expect(h.startsWith('$argon2id$')).toBe(true);
    expect(h).not.toContain('Secret');
    expect(await verifyPassword(h, 'Secret-12345')).toBe(true);
    expect(await verifyPassword(h, 'wrong')).toBe(false);
  });
});

describe('Тип сотрудника по должности', () => {
  it('директор / завуч / учитель', () => {
    expect(detectStaffKind('Директор')).toBe('DIRECTOR');
    expect(detectStaffKind('Завуч')).toBe('HEAD_TEACHER');
    expect(detectStaffKind('Заместитель директора по УВР')).toBe('HEAD_TEACHER');
    expect(detectStaffKind('Математика')).toBe('TEACHER');
  });
});
