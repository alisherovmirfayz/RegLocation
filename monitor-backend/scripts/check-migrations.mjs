// Защита от потери данных: CI не пропустит миграцию с удалением таблиц/столбцов или очисткой данных,
// если в файле нет явной пометки «-- allow-destructive: <причина>» (после ручной проверки и резервной копии).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const dir = path.resolve('prisma/migrations');
const DANGEROUS = [/\bDROP\s+TABLE\b/i, /\bDROP\s+COLUMN\b/i, /\bTRUNCATE\b/i, /\bDELETE\s+FROM\b/i, /\bDROP\s+SCHEMA\b/i, /\bALTER\s+COLUMN\s+\S+\s+TYPE\b/i];
let failed = false;
for (const name of readdirSync(dir).sort()) {
  const file = path.join(dir, name, 'migration.sql');
  try {
    statSync(file);
  } catch {
    continue;
  }
  const sql = readFileSync(file, 'utf8');
  const hits = DANGEROUS.filter((re) => re.test(sql)).map((re) => re.source);
  if (hits.length && !/--\s*allow-destructive:/i.test(sql)) {
    console.error(`✖ ${name}: потенциально разрушительная миграция (${hits.join(', ')}). Добавьте «-- allow-destructive: причина» только после проверки и резервного копирования.`);
    failed = true;
  } else {
    console.log(`✔ ${name}`);
  }
}
process.exit(failed ? 1 : 0);
