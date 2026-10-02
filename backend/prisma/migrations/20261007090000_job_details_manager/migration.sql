-- AlterTable
ALTER TABLE "people" ADD COLUMN     "confirmationDate" TEXT,
ADD COLUMN     "employmentType" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "firstHireDate" TEXT,
ADD COLUMN     "managerId" TEXT,
ADD COLUMN     "noticePeriodDays" INTEGER,
ADD COLUMN     "probationMonths" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "referredBy" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "people_managerId_idx" ON "people"("managerId");

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

