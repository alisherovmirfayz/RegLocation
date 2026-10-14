-- AlterEnum
ALTER TYPE "BuildingKind" ADD VALUE 'STADIUM';

-- AlterEnum
ALTER TYPE "RoomType" ADD VALUE 'STADIUM';

-- AlterTable
ALTER TABLE "SystemState" ADD COLUMN     "stadiumSeeded" BOOLEAN NOT NULL DEFAULT false;
