-- AlterTable
ALTER TABLE "expense_reports" ADD COLUMN     "payrollEntryId" TEXT;

-- AlterTable
ALTER TABLE "payroll_runs" ADD COLUMN     "inputsLockedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "payroll_settings" ADD COLUMN     "autoCreateNextRun" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoReleaseOnFinalize" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "payoutAccountNumber" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "payoutBankName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "payoutBranch" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "payoutIfsc" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "payslip_entries" ADD COLUMN     "heldAt" TIMESTAMP(3),
ADD COLUMN     "holdReason" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "holdReleasedAt" TIMESTAMP(3),
ADD COLUMN     "paidOn" TEXT,
ADD COLUMN     "payStatus" TEXT NOT NULL DEFAULT 'PAY',
ADD COLUMN     "paymentRef" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "payoutBatchId" TEXT,
ADD COLUMN     "reimbursement" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "people" ADD COLUMN     "paymentMode" TEXT NOT NULL DEFAULT 'BANK',
ADD COLUMN     "salaryStopReason" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "salaryStopped" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "payout_batches" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "batchNo" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "payDate" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL DEFAULT '',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_mappings" (
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "ledgerName" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledger_mappings_pkey" PRIMARY KEY ("organizationId","key")
);

-- CreateIndex
CREATE INDEX "payout_batches_runId_idx" ON "payout_batches"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "payout_batches_organizationId_batchNo_key" ON "payout_batches"("organizationId", "batchNo");

-- CreateIndex
CREATE INDEX "expense_reports_payrollEntryId_idx" ON "expense_reports"("payrollEntryId");

-- CreateIndex
CREATE INDEX "payslip_entries_payoutBatchId_idx" ON "payslip_entries"("payoutBatchId");

-- AddForeignKey
ALTER TABLE "expense_reports" ADD CONSTRAINT "expense_reports_payrollEntryId_fkey" FOREIGN KEY ("payrollEntryId") REFERENCES "payslip_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip_entries" ADD CONSTRAINT "payslip_entries_payoutBatchId_fkey" FOREIGN KEY ("payoutBatchId") REFERENCES "payout_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_batches" ADD CONSTRAINT "payout_batches_runId_fkey" FOREIGN KEY ("runId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

