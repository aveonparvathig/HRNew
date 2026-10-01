-- AlterTable
ALTER TABLE "payroll_settings" ADD COLUMN     "loanBenchmarkRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "loanPerquisiteExemptLimit" DOUBLE PRECISION NOT NULL DEFAULT 20000;

-- AlterTable
ALTER TABLE "payslip_entries" ADD COLUMN     "loanDeduction" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "loans" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "loanNo" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL,
    "principal" DOUBLE PRECISION NOT NULL,
    "annualRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "instalments" INTEGER NOT NULL,
    "loanDate" TEXT NOT NULL,
    "startPeriod" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "closedOn" TEXT,
    "remarks" TEXT NOT NULL DEFAULT '',
    "createdByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_schedule_lines" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "principal" DOUBLE PRECISION NOT NULL,
    "interest" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DUE',
    "entryId" TEXT,

    CONSTRAINT "loan_schedule_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_transactions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "period" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL,
    "principal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "interest" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "remarks" TEXT NOT NULL DEFAULT '',
    "entryId" TEXT,
    "createdByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "loans_organizationId_personId_idx" ON "loans"("organizationId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "loans_organizationId_loanNo_key" ON "loans"("organizationId", "loanNo");

-- CreateIndex
CREATE INDEX "loan_schedule_lines_period_status_idx" ON "loan_schedule_lines"("period", "status");

-- CreateIndex
CREATE UNIQUE INDEX "loan_schedule_lines_loanId_seq_key" ON "loan_schedule_lines"("loanId", "seq");

-- CreateIndex
CREATE INDEX "loan_transactions_loanId_createdAt_idx" ON "loan_transactions"("loanId", "createdAt");

-- CreateIndex
CREATE INDEX "loan_transactions_organizationId_date_idx" ON "loan_transactions"("organizationId", "date");

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_schedule_lines" ADD CONSTRAINT "loan_schedule_lines_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_transactions" ADD CONSTRAINT "loan_transactions_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

