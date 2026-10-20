-- AlterEnum
ALTER TYPE "BuildingKind" ADD VALUE 'KINDERGARTEN';

-- AlterTable
ALTER TABLE "SystemState" ADD COLUMN     "kindergartenSeeded" BOOLEAN NOT NULL DEFAULT false;
