import { hash, verify } from '@node-rs/argon2';

// Параметры Argon2id по рекомендациям OWASP (m=19 МиБ, t=2, p=1).
// 2 = Algorithm.Argon2id (const enum нельзя импортировать при isolatedModules).
const OPTIONS = {
  algorithm: 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

/** Хеш для выравнивания времени ответа при несуществующем логине. */
let dummyHash: Promise<string> | null = null;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword('reglocation-timing-equalizer');
  await verifyPassword(await dummyHash, password);
}

export function passwordProblems(password: string): string | null {
  if (password.length < 10) return 'Пароль должен содержать не менее 10 символов';
  if (password.length > 128) return 'Пароль слишком длинный';
  if (!/[A-Za-zА-Яа-я]/.test(password) || !/\d/.test(password)) return 'Пароль должен содержать буквы и цифры';
  return null;
}
