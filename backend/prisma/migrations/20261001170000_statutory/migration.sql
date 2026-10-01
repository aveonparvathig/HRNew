-- AlterTable
ALTER TABLE "payroll_settings" ADD COLUMN     "edliPercent" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
ADD COLUMN     "edliWageCap" DOUBLE PRECISION NOT NULL DEFAULT 15000,
ADD COLUMN     "epsPercent" DOUBLE PRECISION NOT NULL DEFAULT 8.33,
ADD COLUMN     "epsWageCap" DOUBLE PRECISION NOT NULL DEFAULT 15000,
ADD COLUMN     "esiAutoCoverage" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pfAdminMinimum" DOUBLE PRECISION NOT NULL DEFAULT 500,
ADD COLUMN     "pfAdminPercent" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
ADD COLUMN     "pfRoundToRupee" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "payslip_entries" ADD COLUMN     "lwfEmployee" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "lwfEmployer" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "pfWage" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "professionalTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "ptOverridden" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "pt_policies" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "effectiveFrom" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "deductionMode" TEXT NOT NULL DEFAULT 'SPREAD',
    "deductionMonths" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pt_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pt_slabs" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "incomeFrom" DOUBLE PRECISION NOT NULL,
    "incomeTo" DOUBLE PRECISION,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "pt_slabs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lwf_policies" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "effectiveFrom" TEXT NOT NULL,
    "employeeAmount" DOUBLE PRECISION NOT NULL,
    "employerAmount" DOUBLE PRECISION NOT NULL,
    "deductionMonths" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lwf_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "remittances" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paidOn" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "bankName" TEXT NOT NULL DEFAULT '',
    "remarks" TEXT NOT NULL DEFAULT '',
    "createdByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "remittances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pt_policies_organizationId_state_effectiveFrom_key" ON "pt_policies"("organizationId", "state", "effectiveFrom");

-- CreateIndex
CREATE INDEX "pt_slabs_policyId_idx" ON "pt_slabs"("policyId");

-- CreateIndex
CREATE UNIQUE INDEX "lwf_policies_organizationId_state_effectiveFrom_key" ON "lwf_policies"("organizationId", "state", "effectiveFrom");

-- CreateIndex
CREATE INDEX "remittances_organizationId_period_idx" ON "remittances"("organizationId", "period");

-- AddForeignKey
ALTER TABLE "pt_slabs" ADD CONSTRAINT "pt_slabs_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "pt_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

