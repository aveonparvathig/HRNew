-- AlterTable
ALTER TABLE "arrear_items" ADD COLUMN     "recurring" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "mail_settings" ADD COLUMN     "appUrl" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "welcomeMail" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "payroll_settings" ADD COLUMN     "releaseMail" TEXT NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "payslip_entries" ADD COLUMN     "consultantSection" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "consultantTdsPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "npsEmployer" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "people" ADD COLUMN     "consultantSection" TEXT NOT NULL DEFAULT '194J',
ADD COLUMN     "consultantTdsPercent" DOUBLE PRECISION NOT NULL DEFAULT 10,
ADD COLUMN     "npsEmployerPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "npsPran" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "taxTreatment" TEXT NOT NULL DEFAULT 'SALARY';

-- AlterTable
ALTER TABLE "tax_regime_configs" ADD COLUMN     "employerNpsLimitPercent" DOUBLE PRECISION NOT NULL DEFAULT 10;


-- Under the new regime the employer's NPS contribution is deductible up
-- to 14% of Basic + DA; under the old one, 10% (the column's default).
UPDATE "tax_regime_configs" SET "employerNpsLimitPercent" = 14 WHERE "regime" = 'NEW';
