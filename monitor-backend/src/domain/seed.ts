import type { PrismaClient, RoomType } from '@prisma/client';
import { logger } from '../lib/logger';

interface RoomSeed {
  code: string;
  name: string;
  type: RoomType;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FloorSeed {
  name: string;
  level: number;
  /** Высота этажа в единицах схемы (по умолчанию 420) */
  height?: number;
  rooms: RoomSeed[];
}

// Геометрия перенесена с чертежей школы (docs/plans/*.png): координаты в пикселях чертежа
// пересчитываются в единицы этажа 1000 × 420 (поля 20, рабочая область 960 × 380).
type Plan = { x0: number; y0: number; w: number; h: number };
function rect(p: Plan, x1: number, y1: number, x2: number, y2: number) {
  const x = Math.round(20 + ((x1 - p.x0) / p.w) * 960);
  const y = Math.round(20 + ((y1 - p.y0) / p.h) * 380);
  return { x, y, width: Math.round(20 + ((x2 - p.x0) / p.w) * 960) - x, height: Math.round(20 + ((y2 - p.y0) / p.h) * 380) - y };
}

/** Этажи 2–6 (чертёж floor-template-2-to-6.png): сверху x01, x02, x03; коридор; снизу лестница с лифтом, туалет, x05, x04. */
const TYPICAL: Plan = { x0: 192, y0: 107, w: 988, h: 515 };
function typicalFloor(level: number): FloorSeed {
  const n = (i: number) => `${level}0${i}`;
  const P = TYPICAL;
  return {
    name: `${level} этаж`,
    level,
    rooms: [
      { code: n(1), name: `Кабинет ${n(1)}`, type: 'CLASSROOM', ...rect(P, 192, 107, 555, 353) },
      { code: n(2), name: `Кабинет ${n(2)}`, type: 'CLASSROOM', ...rect(P, 555, 107, 884, 353) },
      { code: n(3), name: `Кабинет ${n(3)}`, type: 'CLASSROOM', ...rect(P, 884, 107, 1180, 353) },
      { code: `F${level}-CORRIDOR`, name: 'Коридор', type: 'CORRIDOR', ...rect(P, 192, 353, 1180, 435) },
      { code: `F${level}-STAIRS`, name: 'Лестница', type: 'STAIRS', ...rect(P, 192, 435, 295, 622) },
      { code: `F${level}-LIFT`, name: 'Лифт', type: 'ELEVATOR', ...rect(P, 295, 435, 448, 568) },
      { code: `F${level}-STAIRS2`, name: 'Лестница', type: 'STAIRS', ...rect(P, 448, 435, 563, 622) },
      { code: `F${level}-STAIRS3`, name: 'Лестница', type: 'STAIRS', ...rect(P, 295, 568, 448, 622) },
      // Два туалета с дверями в боковой коридор (к кабинету n05)
      { code: `F${level}-WC`, name: 'Туалет М', type: 'OTHER', ...rect(P, 563, 435, 640, 528) },
      { code: `F${level}-WC2`, name: 'Туалет Ж', type: 'OTHER', ...rect(P, 563, 528, 640, 622) },
      { code: `F${level}-CORRIDOR2`, name: 'Коридор', type: 'CORRIDOR', ...rect(P, 640, 435, 708, 622) },
      { code: n(5), name: `Кабинет ${n(5)}`, type: 'CLASSROOM', ...rect(P, 708, 435, 933, 622) },
      { code: n(4), name: `Кабинет ${n(4)}`, type: 'CLASSROOM', ...rect(P, 933, 435, 1180, 622) },
    ],
  };
}

/** 1 этаж (чертёж floor-1.png). */
const F1: Plan = { x0: 337, y0: 140, w: 763, h: 482 };
/** 0 этаж (чертёж floor-0.png). */

export const DEFAULT_SCHOOL: FloorSeed[] = [
  typicalFloor(6),
  typicalFloor(5),
  typicalFloor(4),
  typicalFloor(3),
  typicalFloor(2),
  {
    name: '1 этаж',
    level: 1,
    rooms: [
      { code: 'RECEPTION', name: 'Reception', type: 'RECEPTION', ...rect(F1, 337, 140, 623, 432) },
      { code: '101', name: 'Кабинет 101', type: 'CLASSROOM', ...rect(F1, 623, 140, 859, 348) },
      { code: 'TEACHERS', name: 'Учительская', type: 'TEACHERS_ROOM', ...rect(F1, 859, 140, 1100, 348) },
      { code: 'F1-CORRIDOR', name: 'Коридор', type: 'CORRIDOR', ...rect(F1, 623, 348, 1100, 432) },
      { code: 'F1-CORRIDOR2', name: 'Коридор', type: 'CORRIDOR', ...rect(F1, 703, 432, 780, 622) },
      { code: 'F1-STAIRS', name: 'Лестница', type: 'STAIRS', ...rect(F1, 337, 432, 415, 622) },
      { code: 'F1-LIFT', name: 'Лифт', type: 'ELEVATOR', ...rect(F1, 415, 432, 545, 555) },
      { code: 'F1-STAIRS2', name: 'Лестница', type: 'STAIRS', ...rect(F1, 545, 432, 628, 622) },
      { code: 'F1-STAIRS3', name: 'Лестница', type: 'STAIRS', ...rect(F1, 415, 555, 545, 622) },
      { code: 'F1-WC', name: 'Туалет М', type: 'OTHER', ...rect(F1, 628, 432, 703, 481) },
      { code: 'F1-WC2', name: 'Туалет Ж', type: 'OTHER', ...rect(F1, 628, 481, 703, 530) },
      { code: 'F1-STORAGE', name: 'Подсобка', type: 'OTHER', ...rect(F1, 628, 530, 703, 622) },
      { code: 'HEAD_TEACHER', name: 'Завуч', type: 'HEAD_TEACHER_OFFICE', ...rect(F1, 780, 432, 875, 622) },
      { code: 'CURATOR', name: 'Куратор', type: 'CURATOR_OFFICE', ...rect(F1, 875, 432, 987, 622) },
      { code: 'DIRECTOR', name: 'Директор', type: 'DIRECTOR_OFFICE', ...rect(F1, 987, 432, 1100, 622) },
    ],
  },
  {
    name: '0 этаж',
    level: 0,
    rooms: [
      // По чертежу директора: робототехника, коридор и лестницы с лифтом; два спортзала; две раздевалки и холл со входом
      { code: '100', name: 'Робототехника', type: 'LAB', x: 20, y: 20, width: 331, height: 186 },
      { code: 'F0-CORRIDOR', name: 'Коридор', type: 'CORRIDOR', x: 20, y: 206, width: 331, height: 62 },
      { code: 'F0-STAIRS', name: 'Лестница', type: 'STAIRS', x: 20, y: 268, width: 104, height: 132 },
      { code: 'F0-LIFT', name: 'Лифт', type: 'ELEVATOR', x: 124, y: 268, width: 128, height: 81 },
      { code: 'F0-STAIRS3', name: 'Лестница', type: 'STAIRS', x: 124, y: 349, width: 128, height: 51 },
      { code: 'F0-STAIRS2', name: 'Лестница', type: 'STAIRS', x: 252, y: 268, width: 99, height: 132 },
      { code: 'SPORT1', name: 'Sport zal 1', type: 'GYM', x: 351, y: 20, width: 392, height: 201 },
      { code: 'SPORT2', name: 'Sport zal 2', type: 'GYM', x: 351, y: 221, width: 392, height: 179 },
      { code: 'RAZDEVALKA1', name: 'Раздевалка 1', type: 'OTHER', x: 743, y: 20, width: 119, height: 139 },
      { code: 'RAZDEVALKA2', name: 'Раздевалка 2', type: 'OTHER', x: 862, y: 20, width: 118, height: 139 },
      { code: 'F0-HALL', name: 'Вход / выход', type: 'CORRIDOR', x: 743, y: 159, width: 237, height: 241 },
    ],
  },
];
export const DEFAULT_CANTEEN: FloorSeed = {
  name: 'Столовая',
  level: 1,
  rooms: [
    { code: 'CANTEEN', name: 'Обеденный зал', type: 'CANTEEN', x: 20, y: 20, width: 700, height: 380 },
    { code: 'KITCHEN', name: 'Кухня', type: 'KITCHEN', x: 740, y: 20, width: 240, height: 240 },
    { code: 'CANTEEN_ENTRY', name: 'Вход', type: 'OTHER', x: 740, y: 275, width: 240, height: 125 },
  ],
};

export const DEFAULT_STADIUM: FloorSeed = {
  name: 'Стадион',
  level: 0,
  rooms: [
    { code: 'STADION', name: 'Стадион', type: 'STADIUM', x: 20, y: 20, width: 960, height: 380 },
  ],
};

async function createFloor(prisma: PrismaClient, buildingId: string, f: FloorSeed, sortOrder: number) {
  await prisma.floor.create({
    data: {
      buildingId,
      name: f.name,
      level: f.level,
      sortOrder,
      width: 1000,
      height: f.height ?? 420,
      rooms: {
        create: f.rooms.map((r) => ({
          code: r.code,
          name: r.name,
          type: r.type,
          layout: { create: { x: r.x, y: r.y, width: r.width, height: r.height } },
        })),
      },
    },
  });
}

/** Идемпотентное наполнение: создаёт здания только при пустой базе и никогда не перезаписывает изменения директора. */
export async function seedDefaults(prisma: PrismaClient): Promise<void> {
  await prisma.systemState.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  const existing = await prisma.building.count();
  if (existing > 0) {
    await ensureStadium(prisma);
    return ensureKindergarten(prisma);
  }
  await prisma.$transaction(
    async (tx) => {
      const school = await tx.building.create({ data: { kind: 'SCHOOL', name: 'Школа' } });
      for (const [i, f] of DEFAULT_SCHOOL.entries()) await createFloor(tx as PrismaClient, school.id, f, i);
      const canteen = await tx.building.create({ data: { kind: 'CANTEEN', name: 'Столовая' } });
      await createFloor(tx as PrismaClient, canteen.id, DEFAULT_CANTEEN, 0);
    },
    { timeout: 30_000 },
  );
  logger.info('Создана схема школы по умолчанию');
  await ensureStadium(prisma);
  await ensureKindergarten(prisma);
}

/**
 * Стадион — часть школы: отдельный «этаж» после остальных этажей.
 * Добавляется один раз (в том числе в уже работающие школы); если директор удалит его — не возвращается.
 */
async function ensureStadium(prisma: PrismaClient): Promise<void> {
  await moveStadiumIntoSchool(prisma);
  const state = await prisma.systemState.findUnique({ where: { id: 1 }, select: { stadiumSeeded: true } });
  if (state?.stadiumSeeded) return;
  const created = await prisma.$transaction(
    async (tx) => {
      // Отметку ставим условно: при одновременном запуске нескольких экземпляров стадион создаст только один
      const claimed = await tx.systemState.updateMany({ where: { id: 1, stadiumSeeded: false }, data: { stadiumSeeded: true } });
      if (claimed.count === 0) return false;
      const school = await tx.building.findFirst({ where: { kind: 'SCHOOL' } });
      if (!school) return false;
      if ((await tx.room.count({ where: { type: 'STADIUM', floor: { buildingId: school.id } } })) > 0) return false;
      const max = await tx.floor.aggregate({ where: { buildingId: school.id }, _max: { sortOrder: true } });
      await createFloor(tx as PrismaClient, school.id, DEFAULT_STADIUM, (max._max.sortOrder ?? -1) + 1);
      return true;
    },
    { timeout: 30_000 },
  );
  if (!created) return;
  await prisma.systemState.update({ where: { id: 1 }, data: { dataVersion: { increment: 1 } } });
  logger.info('Добавлен стадион');
}

/** Ранняя версия создавала стадион отдельным зданием — переносим его этажи в школу (с правками директора). */
async function moveStadiumIntoSchool(prisma: PrismaClient): Promise<void> {
  const stadium = await prisma.building.findFirst({ where: { kind: 'STADIUM' }, include: { floors: { orderBy: { sortOrder: 'asc' } } } });
  if (!stadium) return;
  const school = await prisma.building.findFirst({ where: { kind: 'SCHOOL' } });
  if (!school) return;
  await prisma.$transaction(async (tx) => {
    const max = await tx.floor.aggregate({ where: { buildingId: school.id }, _max: { sortOrder: true } });
    let order = (max._max.sortOrder ?? -1) + 1;
    for (const fl of stadium.floors) {
      await tx.floor.updateMany({ where: { id: fl.id, buildingId: stadium.id }, data: { buildingId: school.id, sortOrder: order++ } });
    }
    await tx.building.deleteMany({ where: { id: stadium.id, floors: { none: {} } } });
  });
  await prisma.systemState.update({ where: { id: 1 }, data: { dataVersion: { increment: 1 } } });
  logger.info('Стадион перенесён в схему школы');
}

/**
 * Детский сад — отдельное здание (чертёж директора): актовый зал, учительская, группы 301–309,
 * туалеты, лестница. Номера 301–309 уже заняты в школе, поэтому коды — DS-301…, а на схеме видно «301».
 */
export const DEFAULT_KINDERGARTEN: FloorSeed = {
  name: 'Детский сад',
  level: 1,
  height: 680,
  rooms: [
    { code: 'DS-AKT', name: 'Актовый зал', type: 'OTHER', x: 20, y: 20, width: 170, height: 340 },
    { code: 'DS-305', name: '305', type: 'CLASSROOM', x: 190, y: 20, width: 145, height: 190 },
    { code: 'DS-TEACHERS', name: 'Учительская', type: 'TEACHERS_ROOM', x: 190, y: 210, width: 145, height: 150 },
    { code: 'DS-CORRIDOR2', name: 'Коридор', type: 'CORRIDOR', x: 335, y: 20, width: 65, height: 340 },
    { code: 'DS-304', name: '304', type: 'CLASSROOM', x: 400, y: 20, width: 120, height: 155 },
    { code: 'DS-303', name: '303', type: 'CLASSROOM', x: 520, y: 20, width: 120, height: 155 },
    { code: 'DS-WC', name: 'Туалет М', type: 'OTHER', x: 400, y: 175, width: 120, height: 95 },
    { code: 'DS-WC2', name: 'Туалет Ж', type: 'OTHER', x: 520, y: 175, width: 120, height: 95 },
    { code: 'DS-CORRIDOR3', name: 'Коридор', type: 'CORRIDOR', x: 640, y: 20, width: 80, height: 340 },
    { code: 'DS-CORRIDOR5', name: 'Коридор', type: 'CORRIDOR', x: 400, y: 270, width: 240, height: 90 },
    { code: 'DS-302', name: '302', type: 'CLASSROOM', x: 720, y: 20, width: 260, height: 205 },
    { code: 'DS-301', name: '301', type: 'CLASSROOM', x: 720, y: 225, width: 260, height: 160 },
    { code: 'DS-STAIRS', name: 'Лестница', type: 'STAIRS', x: 745, y: 385, width: 235, height: 135 },
    { code: 'DS-CORRIDOR', name: 'Коридор', type: 'CORRIDOR', x: 20, y: 360, width: 725, height: 160 },
    { code: 'DS-306', name: '306', type: 'CLASSROOM', x: 20, y: 520, width: 125, height: 40 },
    { code: 'DS-307', name: '307', type: 'CLASSROOM', x: 20, y: 560, width: 125, height: 40 },
    { code: 'DS-CORRIDOR4', name: 'Коридор', type: 'CORRIDOR', x: 145, y: 520, width: 195, height: 80 },
    { code: 'DS-308', name: '308', type: 'CLASSROOM', x: 20, y: 600, width: 170, height: 80 },
    { code: 'DS-309', name: '309', type: 'CLASSROOM', x: 190, y: 600, width: 150, height: 80 },
  ],
};

/** Детский сад добавляется один раз (и в уже работающие школы); если директор удалит здание — не возвращается. */
async function ensureKindergarten(prisma: PrismaClient): Promise<void> {
  const state = await prisma.systemState.findUnique({ where: { id: 1 }, select: { kindergartenSeeded: true } });
  if (state?.kindergartenSeeded) return;
  const created = await prisma.$transaction(
    async (tx) => {
      // Условная отметка: при одновременном запуске нескольких экземпляров здание создаст только один
      const claimed = await tx.systemState.updateMany({ where: { id: 1, kindergartenSeeded: false }, data: { kindergartenSeeded: true } });
      if (claimed.count === 0) return false;
      if (await tx.building.findFirst({ where: { kind: 'KINDERGARTEN' } })) return false;
      // Коды комнат уникальны во всей базе: занятые не трогаем
      const taken = new Set((await tx.room.findMany({ where: { code: { in: DEFAULT_KINDERGARTEN.rooms.map((r) => r.code) } }, select: { code: true } })).map((r) => r.code));
      const kg = await tx.building.create({ data: { kind: 'KINDERGARTEN', name: 'Детский сад' } });
      await createFloor(tx as PrismaClient, kg.id, { ...DEFAULT_KINDERGARTEN, rooms: DEFAULT_KINDERGARTEN.rooms.filter((r) => !taken.has(r.code)) }, 0);
      return true;
    },
    { timeout: 30_000 },
  );
  if (!created) return;
  await prisma.systemState.update({ where: { id: 1 }, data: { dataVersion: { increment: 1 } } });
  logger.info('Добавлен детский сад');
}
