-- CreateTable
CREATE TABLE "payroll_settings" (
    "organizationId" TEXT NOT NULL,
    "basicPercentOfPackage" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "daPercentOfBasic" DOUBLE PRECISION NOT NULL DEFAULT 45,
    "hraPercentOfBasic" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "transportPercentOfBasic" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "foodPercentOfBasic" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "esiEmployeePercent" DOUBLE PRECISION NOT NULL DEFAULT 0.75,
    "esiEmployerPercent" DOUBLE PRECISION NOT NULL DEFAULT 3.25,
    "esiWageCeiling" DOUBLE PRECISION NOT NULL DEFAULT 21000,
    "pfEmployeePercent" DOUBLE PRECISION NOT NULL DEFAULT 12,
    "pfEmployerPercent" DOUBLE PRECISION NOT NULL DEFAULT 12,
    "pfWageCap" DOUBLE PRECISION NOT NULL DEFAULT 15000,
    "pfWageFactor" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "pfEmployerMatchesEmployee" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_settings_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "finalizedAt" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslip_entries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "monthlyPackage" DOUBLE PRECISION NOT NULL,
    "totalWorkingDays" INTEGER NOT NULL,
    "empLeaveDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lopDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "presentDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "payDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "internetAllowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salaryArrearAllowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salaryAdvance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "basic" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "da" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hra" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "transportAllowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "foodAllowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossSalary" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isEsiEligible" BOOLEAN NOT NULL DEFAULT false,
    "esiEmployee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "esiEmployer" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isPfApplicable" BOOLEAN NOT NULL DEFAULT false,
    "pfEmployee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pfEmployer" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netPayable" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "employerContributions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ctc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remarks" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payslip_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_organizationId_period_key" ON "payroll_runs"("organizationId", "period");

-- CreateIndex
CREATE INDEX "payslip_entries_organizationId_idx" ON "payslip_entries"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "payslip_entries_runId_personId_key" ON "payslip_entries"("runId", "personId");

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip_entries" ADD CONSTRAINT "payslip_entries_runId_fkey" FOREIGN KEY ("runId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip_entries" ADD CONSTRAINT "payslip_entries_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
