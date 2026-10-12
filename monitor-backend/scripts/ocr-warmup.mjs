// Скачивает языковые данные Tesseract в OCR_CACHE_PATH (выполняется при сборке Docker-образа).
import { mkdirSync } from 'node:fs';
import { createWorker } from 'tesseract.js';

const cachePath = process.env.OCR_CACHE_PATH ?? '.tessdata';
const langs = (process.env.OCR_LANGS ?? 'eng+rus').split('+');
mkdirSync(cachePath, { recursive: true });
const worker = await createWorker(langs, 1, { cachePath });
await worker.terminate();
console.log(`OCR: языковые данные (${langs.join(', ')}) сохранены в ${cachePath}`);
