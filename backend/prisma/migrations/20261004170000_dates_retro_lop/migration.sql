-- AlterTable
ALTER TABLE "declaration_items" ADD COLUMN     "proofRequired" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "payroll_runs" ADD COLUMN     "cutoffApplied" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "payroll_settings" ADD COLUMN     "inputCutoffDay" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "tax_year_controls" ADD COLUMN     "declarationLockOn" TEXT,
ADD COLUMN     "employeeTaxEstimate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "proofOpenFrom" TEXT;

