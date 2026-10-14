-- CreateEnum
CREATE TYPE "AwayPlace" AS ENUM ('ON_SITE', 'OFF_SITE');

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "awayAt" TIMESTAMP(3),
ADD COLUMN     "awayPlace" "AwayPlace",
ADD COLUMN     "awayUntil" TIMESTAMP(3);
