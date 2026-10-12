import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';

const PROD = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://u:p@db:5432/reglocation',
  PUBLIC_MONITOR_URL: 'https://monitor.school.uz',
  PUBLIC_APP_URL: 'https://app.school.uz',
  INITIAL_DIRECTOR_EMAIL: 'owner@school.uz',
  MAIL_TRANSPORT: 'smtp',
  SMTP_HOST: 'smtp.gmail.com',
};

describe('Рабочий режим (production)', () => {
  it('запускается с полной настройкой', () => {
    const c = loadConfig(PROD);
    expect(c.isProd).toBe(true);
    expect(c.cookieSecure).toBe(true);
  });

  it('не запускается в «тестовой» конфигурации', () => {
    // Код подтверждения директора нельзя выводить в журнал — только письмом
    expect(() => loadConfig({ ...PROD, MAIL_TRANSPORT: 'console' })).toThrow(/MAIL_TRANSPORT должен быть smtp/);
    expect(() => loadConfig({ ...PROD, MAIL_TRANSPORT: undefined })).toThrow(/MAIL_TRANSPORT/);
    expect(() => loadConfig({ ...PROD, SMTP_HOST: undefined })).toThrow(/SMTP_HOST/);
    expect(() => loadConfig({ ...PROD, INITIAL_DIRECTOR_EMAIL: undefined })).toThrow(/INITIAL_DIRECTOR_EMAIL/);
    expect(() => loadConfig({ ...PROD, PUBLIC_APP_URL: 'http://localhost:5174' })).toThrow(/PUBLIC_APP_URL/);
    expect(() => loadConfig({ ...PROD, PUBLIC_MONITOR_URL: 'http://monitor.school.uz' })).toThrow(/PUBLIC_MONITOR_URL/);
  });

  it('в разработке остаются удобные значения по умолчанию', () => {
    expect(loadConfig({ DATABASE_URL: PROD.DATABASE_URL }).MAIL_TRANSPORT).toBe('console');
  });
});
