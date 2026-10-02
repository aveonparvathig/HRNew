-- AlterTable
ALTER TABLE "declaration_items" ADD COLUMN     "componentKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "limitPeriod" TEXT NOT NULL DEFAULT 'YEAR',
ADD COLUMN     "regime" TEXT NOT NULL DEFAULT 'OLD';

-- AlterTable
ALTER TABLE "employee_tax_profiles" ADD COLUMN     "editGranted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "landlords" JSONB,
ADD COLUMN     "lenderAddress" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "lenderName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "lenderPan" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "rentByMonth" JSONB,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedBy" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "org_statutory_profiles" ADD COLUMN     "deductorAddressChanged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deductorArea" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "deductorBuilding" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "deductorCity" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "deductorFlat" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "deductorPin" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "deductorState" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "deductorStreet" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "responsibleAddressChanged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "responsibleArea" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "responsibleBuilding" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "responsibleCity" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "responsibleFlat" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "responsiblePin" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "responsibleState" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "responsibleStreet" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "payroll_settings" ADD COLUMN     "form27aName" TEXT NOT NULL DEFAULT 'Form 27A',
ADD COLUMN     "tdsAnnexure1IncludeZero" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tdsAnnexure2SkipZero" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "declaration_reopen_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedBy" TEXT NOT NULL DEFAULT '',
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "declaration_reopen_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perquisite_values" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "fyStart" INTEGER NOT NULL,
    "head" INTEGER NOT NULL,
    "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recovered" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "perquisite_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tds_return_filings" (
    "organizationId" TEXT NOT NULL,
    "fyStart" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "receiptNo" TEXT NOT NULL DEFAULT '',
    "filedOn" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tds_return_filings_pkey" PRIMARY KEY ("organizationId","fyStart","quarter")
);

-- CreateIndex
CREATE INDEX "declaration_reopen_requests_organizationId_status_idx" ON "declaration_reopen_requests"("organizationId", "status");

-- CreateIndex
CREATE INDEX "declaration_reopen_requests_profileId_idx" ON "declaration_reopen_requests"("profileId");

-- CreateIndex
CREATE INDEX "perquisite_values_organizationId_fyStart_idx" ON "perquisite_values"("organizationId", "fyStart");

-- CreateIndex
CREATE UNIQUE INDEX "perquisite_values_personId_fyStart_head_key" ON "perquisite_values"("personId", "fyStart", "head");

-- AddForeignKey
ALTER TABLE "declaration_reopen_requests" ADD CONSTRAINT "declaration_reopen_requests_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "employee_tax_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perquisite_values" ADD CONSTRAINT "perquisite_values_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Items added to the starter catalogue of declaration items: more 80C
-- instruments and deductions, income from other heads, and tax paid
-- elsewhere. Organizations that already have a catalogue get them too,
-- after their own items. Nobody has an amount on them, so no tax changes.
INSERT INTO "declaration_items"
  ("id", "organizationId", "code", "name", "section", "sectionNew", "group", "maxAmount", "deductPercent", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT concat('c', md5(random()::text || o."organizationId" || v."code")), o."organizationId", v."code", v."name",
       v."section", v."sectionNew", v."group", v."maxAmount", v."deductPercent", true, o."last" + v."n", now(), now()
FROM (SELECT "organizationId", max("sortOrder") AS "last" FROM "declaration_items" GROUP BY "organizationId") o
CROSS JOIN (VALUES
  (1, 'POST_OFFICE_TD', 'Post Office five-year time deposit', '80C', '123', 'SECTION_80C', 150000::double precision, 100::double precision),
  (2, 'SCSS', 'Senior Citizens Savings Scheme', '80C', '123', 'SECTION_80C', 150000, 100),
  (3, 'NSC_INTEREST', 'Interest on NSC reinvested', '80C', '123', 'SECTION_80C', 150000, 100),
  (4, 'NABARD_BONDS', 'NABARD rural bonds', '80C', '123', 'SECTION_80C', 150000, 100),
  (5, 'NHB_DEPOSIT', 'National Housing Bank deposit scheme', '80C', '123', 'SECTION_80C', 150000, 100),
  (6, 'INFRA_BONDS', 'Infrastructure bonds or units', '80C', '123', 'SECTION_80C', 150000, 100),
  (7, 'MEDICAL_BILLS_SENIOR', 'Medical expenses of a senior citizen with no insurance', '80D', '126', 'OTHER', 50000, 100),
  (8, 'HOME_LOAN_INTEREST_80EE', 'Additional housing-loan interest (loan sanctioned in 2016-17)', '80EE', '130', 'OTHER', 50000, 100),
  (9, 'HOME_LOAN_INTEREST_80EEA', 'Additional housing-loan interest (affordable housing, 2019-22)', '80EEA', '131', 'OTHER', 150000, 100),
  (10, 'RENT_WITHOUT_HRA', 'Rent paid where no HRA is received', '80GG', '134', 'OTHER', 60000, 100),
  (11, 'DONATION_RESEARCH', 'Donations for scientific research or rural development', '80GGA', '135', 'OTHER', NULL, 100),
  (12, 'DONATION_POLITICAL', 'Donations to political parties', '80GGC', '137', 'OTHER', NULL, 100),
  (13, 'DEPOSIT_INTEREST_SENIOR', 'Interest on deposits — senior citizens', '80TTB', '153(2)(B)', 'OTHER', 50000, 100),
  (14, 'INTEREST_INCOME', 'Interest income (deposits, savings, bonds)', 'Other sources', '', 'OTHER_INCOME', NULL, 100),
  (15, 'ANY_OTHER_INCOME', 'Any other income', 'Other sources', '', 'OTHER_INCOME', NULL, 100),
  (16, 'LET_OUT_INCOME', 'Income from let-out property (after the 30% deduction and interest)', 'House property', '', 'LET_OUT_INCOME', NULL, 100),
  (17, 'LET_OUT_LOSS', 'Loss from let-out property', 'House property', '', 'LET_OUT_LOSS', NULL, 100),
  (18, 'TDS_ELSEWHERE', 'Tax deducted at source on other income', 'TDS', '', 'TAX_CREDIT', NULL, 100),
  (19, 'TCS_PAID', 'Tax collected at source', 'TCS', '', 'TAX_CREDIT', NULL, 100)
) AS v("n", "code", "name", "section", "sectionNew", "group", "maxAmount", "deductPercent")
ON CONFLICT ("organizationId", "code") DO NOTHING;
