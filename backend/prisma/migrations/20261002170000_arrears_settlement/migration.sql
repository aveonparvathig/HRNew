-- AlterTable
ALTER TABLE "payroll_settings" ADD COLUMN     "gratuityCap" DOUBLE PRECISION NOT NULL DEFAULT 2000000,
ADD COLUMN     "gratuityMinYears" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "lopReversalMonths" INTEGER NOT NULL DEFAULT 6,
ADD COLUMN     "noticePeriodDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "settlementDayBasis" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "payslip_lines" ADD COLUMN     "source" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "arrear_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourcePeriod" TEXT NOT NULL,
    "sourceEntryId" TEXT NOT NULL,
    "revisionId" TEXT,
    "lopDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fromPackage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "toPackage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "basic" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "da" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hra" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "transportAllowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "foodAllowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gross" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pfEmployee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pfEmployer" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "esiEmployee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "esiEmployer" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "paidEntryId" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "arrear_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "period" TEXT NOT NULL,
    "entryId" TEXT,
    "lastWorkingDate" TEXT NOT NULL,
    "resignedOn" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "payDays" DOUBLE PRECISION,
    "monthlyGross" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "basicDa" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "serviceYears" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "noticeDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "noticeServedDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "noticePayDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "leaveDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gratuityYears" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "leaveEncashment" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gratuity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "noticePay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "noticeRecovery" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remarks" TEXT NOT NULL DEFAULT '',
    "createdByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "arrear_items_organizationId_personId_idx" ON "arrear_items"("organizationId", "personId");

-- CreateIndex
CREATE INDEX "arrear_items_sourceEntryId_idx" ON "arrear_items"("sourceEntryId");

-- CreateIndex
CREATE INDEX "arrear_items_paidEntryId_idx" ON "arrear_items"("paidEntryId");

-- CreateIndex
CREATE INDEX "settlements_organizationId_period_idx" ON "settlements"("organizationId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "settlements_personId_sequence_key" ON "settlements"("personId", "sequence");

-- AddForeignKey
ALTER TABLE "arrear_items" ADD CONSTRAINT "arrear_items_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arrear_items" ADD CONSTRAINT "arrear_items_sourceEntryId_fkey" FOREIGN KEY ("sourceEntryId") REFERENCES "payslip_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arrear_items" ADD CONSTRAINT "arrear_items_paidEntryId_fkey" FOREIGN KEY ("paidEntryId") REFERENCES "payslip_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arrear_items" ADD CONSTRAINT "arrear_items_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "salary_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "payslip_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

