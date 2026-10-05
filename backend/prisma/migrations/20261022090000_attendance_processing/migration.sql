-- AlterTable
ALTER TABLE "payslip_entries" ADD COLUMN     "attendanceLopDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "attendancePresentDays" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "attendance_days" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "workedMinutes" INTEGER NOT NULL DEFAULT 0,
    "shiftCode" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'COMPUTED',
    "note" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_periods" (
    "organizationId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "finalisedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_periods_pkey" PRIMARY KEY ("organizationId","month")
);

-- CreateIndex
CREATE INDEX "attendance_days_organizationId_date_idx" ON "attendance_days"("organizationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_days_organizationId_personId_date_key" ON "attendance_days"("organizationId", "personId", "date");

-- AddForeignKey
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

