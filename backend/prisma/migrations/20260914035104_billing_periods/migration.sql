-- AlterTable
ALTER TABLE "client_billings" ADD COLUMN     "periodEnd" TEXT,
ADD COLUMN     "periodStart" TEXT,
ADD COLUMN     "periodType" TEXT NOT NULL DEFAULT 'ACADEMIC';
