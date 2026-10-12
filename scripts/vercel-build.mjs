// Сборка RegLocation для Vercel: оба проекта на одном домене.
//   /monitor  — монитор ресепшена (проект 1)
//   /teacher, /director — сайт учителя и кабинет директора (проект 2)
//   /api      — backend (проект 1) как функция Vercel, см. api/index.mjs
// Статические файлы собираются в public/, миграции базы применяются до публикации.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backend = path.join(root, 'monitor-backend');
const app = path.join(root, 'teacher-director');
const out = path.join(root, 'public');

const run = (cmd, cwd, env = {}) => {
  console.log(`\n▶ ${cmd}  (${path.relative(root, cwd) || '.'})`);
  execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
};

// База Neon из интеграции Vercel: миграции — напрямую, без пула соединений
const migrateUrl = process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!migrateUrl) {
  console.error('\n✖ Не найдена база данных. Подключите Neon: Vercel → Storage → Create Database → Neon (бесплатно).');
  process.exit(1);
}

run('npx prisma generate', backend);
run('npx prisma migrate deploy', backend, { DATABASE_URL: migrateUrl });
run('npm run build:monitor', backend);
run('npm run build:vercel', backend);
run('npm run build', app);

// Объединяем статические файлы двух сайтов. Совпадающие пути допустимы только с одинаковым содержимым.
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const merge = (from, to) => {
  for (const name of readdirSync(from)) {
    const src = path.join(from, name);
    const dst = path.join(to, name);
    if (statSync(src).isDirectory()) {
      mkdirSync(dst, { recursive: true });
      merge(src, dst);
    } else if (existsSync(dst) && !readFileSync(src).equals(readFileSync(dst))) {
      throw new Error(`Конфликт файлов при сборке: ${path.relative(out, dst)}`);
    } else cpSync(src, dst);
  }
};
merge(path.join(backend, 'dist', 'monitor'), out);
renameSync(path.join(out, 'index.html'), path.join(out, 'monitor.html'));
merge(path.join(app, 'dist'), out);
renameSync(path.join(out, 'index.html'), path.join(out, 'app.html'));
console.log('\n✔ Готово: public/ (статические файлы) и monitor-backend/dist/server/vercel.js (API)');
