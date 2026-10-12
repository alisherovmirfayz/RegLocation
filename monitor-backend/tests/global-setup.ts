import { execSync } from 'node:child_process';

/** Применяет миграции к тестовой базе (так же, как в production — prisma migrate deploy). */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/reglocation_test?schema=public';
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
}
