import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { AppConfig } from '../config';
import { logger } from './logger';

/**
 * Пароли, которые выдаёт директор (учителям и монитору), можно посмотреть позже.
 * Для входа по-прежнему используется только хеш Argon2id; дополнительно хранится копия,
 * зашифрованная AES-256-GCM. Ключ — секрет CREDENTIALS_KEY в настройках хостинга, в базе его нет.
 * Без ключа (в разработке) используется ключ разработки; в production без ключа функция отключена.
 */
let devWarned = false;

function key(config: AppConfig): Buffer | null {
  const raw = config.CREDENTIALS_KEY;
  if (raw) return createHash('sha256').update(raw).digest();
  if (config.isProd) return null;
  if (!devWarned) {
    devWarned = true;
    logger.warn('CREDENTIALS_KEY не задан — используется ключ разработки для просмотра паролей');
  }
  return createHash('sha256').update('reglocation-development-only-key').digest();
}

export function sealPassword(config: AppConfig, password: string): string | null {
  const k = key(config);
  if (!k) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', k, iv);
  const data = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}

export function openPassword(config: AppConfig, sealed: string | null | undefined): string | null {
  const k = key(config);
  if (!k || !sealed) return null;
  try {
    const [v, iv, tag, data] = sealed.split('.');
    if (v !== 'v1' || !iv || !tag || !data) return null;
    const decipher = createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    // Ключ сменили или данные повреждены — пароль недоступен, директор может выдать новый
    return null;
  }
}
