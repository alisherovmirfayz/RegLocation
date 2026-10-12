# RegLocation — Проект №1: Monitor + Backend

Backend (Express, Socket.IO, Prisma/PostgreSQL, OCR на Tesseract.js) и монитор ресепшена (React + Vite + Tailwind + Motion).

Полная инструкция по размещению и использованию — в `README.md` в корне репозитория (раздел «Размещение на Railway»).

## Адреса

| Путь | Назначение |
|---|---|
| `/monitor/login` | вход в монитор (аккаунт выдаёт директор) |
| `/monitor` | монитор: схема школы и столовой, список учителей |
| `/api/health` | health-check для хостинга |
| `/api/...` | API для монитора, сайта учителя и кабинета директора |
| `/socket.io` | события реального времени |

## Команды

```bash
npm install
cp .env.example .env           # заполните DATABASE_URL и остальные переменные
npx prisma migrate deploy      # применить миграции
npm run dev                    # разработка: API :8080 + монитор Vite :5173
npm test                       # автотесты (нужна тестовая база, см. vitest.config.ts / TEST_DATABASE_URL)
npm run build && npm start     # production-сборка
npm run check:migrations       # проверка, что миграции не удаляют данные
```

## Важные модули

- `src/domain/location.ts` — единая функция определения местоположения (приоритеты из ТЗ).
- `src/domain/live.ts` — снимок состояния, автоматический выход в 17:00, планировщик, рассылка Socket.IO.
- `src/ocr/` — распознавание расписаний: поиск таблицы (`grid.ts`), нормализация классов/кабинетов/дней (`normalize.ts`), PDF (`pdf.ts`), конвейер (`pipeline.ts`).
- `src/domain/seed.ts` — схема школы по умолчанию (по чертежам 0, 1, 2–6 этажей и столовая).
- `prisma/schema.prisma` — модели: User, Director, Teacher, ReceptionAccount, Session, Subject, SchoolClass, Timetable, TimetableEntry, Attendance, Building, Floor, Room, RoomLayout, ManualAssignment, AuditLog и др.
