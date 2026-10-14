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
      { code: `F${level}-WC`, name: 'Туалет', type: 'OTHER', ...rect(P, 563, 435, 708, 622) },
      { code: n(5), name: `Кабинет ${n(5)}`, type: 'CLASSROOM', ...rect(P, 708, 435, 933, 622) },
      { code: n(4), name: `Кабинет ${n(4)}`, type: 'CLASSROOM', ...rect(P, 933, 435, 1180, 622) },
    ],
  };
}

/** 1 этаж (чертёж floor-1.png). */
const F1: Plan = { x0: 337, y0: 140, w: 763, h: 482 };
/** 0 этаж (чертёж floor-0.png). */
const F0: Plan = { x0: 268, y0: 157, w: 747, h: 450 };

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
      { code: 'F1-WC', name: 'Туалет', type: 'OTHER', ...rect(F1, 628, 432, 703, 530) },
      { code: 'F1-STORAGE', name: 'Подсобка', type: 'OTHER', ...rect(F1, 628, 530, 703, 622) },
      { code: 'ACCOUNTING', name: 'Бухгалтерия', type: 'ACCOUNTING', ...rect(F1, 780, 432, 875, 622) },
      { code: 'HEAD_TEACHER', name: 'Завуч', type: 'HEAD_TEACHER_OFFICE', ...rect(F1, 875, 432, 987, 622) },
      { code: 'DIRECTOR', name: 'Директор', type: 'DIRECTOR_OFFICE', ...rect(F1, 987, 432, 1100, 622) },
    ],
  },
  {
    name: '0 этаж',
    level: 0,
    rooms: [
      { code: 'ROBOTICS', name: 'Робототехника', type: 'LAB', ...rect(F0, 268, 157, 580, 367) },
      { code: 'F0-CORRIDOR', name: 'Коридор', type: 'CORRIDOR', ...rect(F0, 268, 367, 580, 428) },
      { code: 'F0-STAIRS', name: 'Лестница', type: 'STAIRS', ...rect(F0, 268, 428, 355, 607) },
      { code: 'F0-LIFT', name: 'Лифт', type: 'ELEVATOR', ...rect(F0, 355, 428, 478, 540) },
      { code: 'F0-STAIRS2', name: 'Лестница', type: 'STAIRS', ...rect(F0, 478, 428, 580, 607) },
      { code: 'F0-STAIRS3', name: 'Лестница', type: 'STAIRS', ...rect(F0, 355, 540, 478, 607) },
      { code: 'SPORT1', name: 'Sport zal 1', type: 'GYM', ...rect(F0, 580, 157, 1015, 370) },
      { code: 'SPORT2', name: 'Sport zal 2', type: 'GYM', ...rect(F0, 580, 370, 1015, 607) },
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
    { code: 'STADION', name: 'Стадион', type: 'STADIUM', x: 20, y: 20, width: 760, height: 380 },
    { code: 'TRIBUNA', name: 'Трибуна', type: 'OTHER', x: 800, y: 20, width: 180, height: 250 },
    { code: 'RAZDEVALKA', name: 'Раздевалка', type: 'OTHER', x: 800, y: 285, width: 180, height: 115 },
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
      height: 420,
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
  if (existing > 0) return ensureStadium(prisma);
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
