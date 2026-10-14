-- AlterEnum
ALTER TYPE "AwayPlace" ADD VALUE 'ROOM';

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "awayRoomId" TEXT;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_awayRoomId_fkey" FOREIGN KEY ("awayRoomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
