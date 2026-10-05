-- AlterTable
ALTER TABLE "leave_types" ADD COLUMN     "accrualFrequency" TEXT NOT NULL DEFAULT 'NONE',
ADD COLUMN     "accrualRate" DOUBLE PRECISION NOT NULL DEFAULT 0;

