-- «Детский сад» оказался вторым зданием школы: переименование вида здания и флага создания
ALTER TYPE "BuildingKind" RENAME VALUE 'KINDERGARTEN' TO 'SCHOOL2';
ALTER TABLE "SystemState" RENAME COLUMN "kindergartenSeeded" TO "school2Seeded";

-- Уже созданное здание: название, этаж (кабинеты 301–309 — третий этаж) и коды комнат DS-… → 2-…
UPDATE "Building" SET "name" = 'Второе здание' WHERE "kind" = 'SCHOOL2' AND "name" = 'Детский сад';
UPDATE "Floor" SET "name" = '3 этаж', "level" = 3
  WHERE "name" = 'Детский сад' AND "buildingId" IN (SELECT "id" FROM "Building" WHERE "kind" = 'SCHOOL2');
UPDATE "Room" SET "code" = '2-' || substring("code" from 4)
  WHERE "code" LIKE 'DS-%'
    AND NOT EXISTS (SELECT 1 FROM "Room" AS r2 WHERE r2."code" = '2-' || substring("Room"."code" from 4));

-- Сброс кешей на всех экземплярах сервера
UPDATE "SystemState" SET "dataVersion" = "dataVersion" + 1;
