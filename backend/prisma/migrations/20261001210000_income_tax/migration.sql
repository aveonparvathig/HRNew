-- AlterTable
ALTER TABLE "payroll_settings" ADD COLUMN     "defaultTaxRegime" TEXT NOT NULL DEFAULT 'NEW',
ADD COLUMN     "tdsAutoFrom" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "payslip_entries" ADD COLUMN     "tdsOverridden" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "tax_regime_configs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fyStart" INTEGER NOT NULL,
    "regime" TEXT NOT NULL,
    "standardDeduction" DOUBLE PRECISION NOT NULL,
    "rebateIncomeLimit" DOUBLE PRECISION NOT NULL,
    "rebateMaxAmount" DOUBLE PRECISION NOT NULL,
    "rebateMarginalRelief" BOOLEAN NOT NULL DEFAULT false,
    "cessPercent" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "seniorExemption" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "superSeniorExemption" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "allowsExemptions" BOOLEAN NOT NULL DEFAULT false,
    "section80CLimit" DOUBLE PRECISION NOT NULL DEFAULT 150000,
    "housingInterestLimit" DOUBLE PRECISION NOT NULL DEFAULT 200000,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_regime_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_slabs" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "incomeFrom" DOUBLE PRECISION NOT NULL,
    "incomeTo" DOUBLE PRECISION,
    "ratePercent" DOUBLE PRECISION NOT NULL,
    "surchargePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "tax_slabs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_tax_profiles" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "fyStart" INTEGER NOT NULL,
    "regime" TEXT NOT NULL DEFAULT '',
    "prevEmployerIncome" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "prevEmployerTds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherIncome" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "annualRentPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isMetro" BOOLEAN NOT NULL DEFAULT false,
    "section80C" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "housingLoanInterest" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_tax_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_computations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "fyStart" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "working" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_computations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tax_regime_configs_organizationId_fyStart_regime_key" ON "tax_regime_configs"("organizationId", "fyStart", "regime");

-- CreateIndex
CREATE INDEX "tax_slabs_configId_idx" ON "tax_slabs"("configId");

-- CreateIndex
CREATE INDEX "employee_tax_profiles_organizationId_fyStart_idx" ON "employee_tax_profiles"("organizationId", "fyStart");

-- CreateIndex
CREATE UNIQUE INDEX "employee_tax_profiles_personId_fyStart_key" ON "employee_tax_profiles"("personId", "fyStart");

-- CreateIndex
CREATE INDEX "tax_computations_organizationId_personId_fyStart_idx" ON "tax_computations"("organizationId", "personId", "fyStart");

-- CreateIndex
CREATE UNIQUE INDEX "tax_computations_runId_personId_key" ON "tax_computations"("runId", "personId");

-- AddForeignKey
ALTER TABLE "tax_slabs" ADD CONSTRAINT "tax_slabs_configId_fkey" FOREIGN KEY ("configId") REFERENCES "tax_regime_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_tax_profiles" ADD CONSTRAINT "employee_tax_profiles_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_computations" ADD CONSTRAINT "tax_computations_runId_fkey" FOREIGN KEY ("runId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

